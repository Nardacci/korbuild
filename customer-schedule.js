if(!window.KORBUILD_APP){const s=document.createElement('script');s.src='app-config.js?v=1.2.2';document.head.appendChild(s);}
const {url,publishableKey}=window.KORBUILD_SUPABASE;
const db=window.supabase.createClient(url,publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const state={empresaId:null,colaboradores:[],calendar:null};
const PALETTE=['#635bff','#2e7a57','#b36b13','#c44b59','#0e7490','#7c3aed','#be185d','#15803d'];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function closeMenu(){$('user-menu')?.classList.add('hidden');$('user-menu-btn')?.setAttribute('aria-expanded','false');}
function msg(text,type='success'){const e=$('message');e.textContent=text;e.className=`message ${type}`;e.classList.remove('hidden');}
function clearMsg(){$('message')?.classList.add('hidden');}
const t=s=>window.KORbuildI18n?window.KORbuildI18n.t(s):s;

function colorFor(colaboradorId){
  let hash=0;
  for(let i=0;i<colaboradorId.length;i++)hash=(hash*31+colaboradorId.charCodeAt(i))>>>0;
  return PALETTE[hash%PALETTE.length];
}

async function loadProfile(){
  const {data:{session},error}=await db.auth.getSession();
  if(error||!session?.user){location.href='index.html';return false;}
  const {data:profile,error:profileError}=await db.from('usuarios').select('id,name,empresa_id,empresas(name)').eq('id',session.user.id).maybeSingle();
  if(profileError||!profile?.empresa_id){msg(profileError?.message||t('Unable to load workspace profile.'),'error');return false;}
  state.empresaId=profile.empresa_id;
  const company=profile.empresas?.name||'KORbuild Demo';
  const name=profile.name?.trim()&&profile.name!=='Owner'?profile.name:session.user.user_metadata?.full_name||`${company} Owner`;
  const initial=name.trim().charAt(0).toUpperCase()||'O';
  $('user-name').textContent=name;$('user-email').textContent=session.user.email||'';
  $('user-avatar').textContent=initial;$('menu-avatar').textContent=initial;$('menu-full-name').textContent=name;$('menu-full-email').textContent=session.user.email||'';
  return true;
}

async function loadColaboradores(){
  const {data,error}=await db.from('colaboradores').select('id,name').eq('empresa_id',state.empresaId).eq('active',true).order('name');
  if(error)throw error;
  state.colaboradores=data||[];
  $('colaborador-filter').innerHTML='<option value="ALL">All collaborators</option>'+state.colaboradores.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
}

async function fetchEvents(fetchInfo,successCallback,failureCallback){
  clearMsg();
  const colaboradorFilter=$('colaborador-filter').value;
  const {data,error}=await db.rpc('obter_agendamentos',{
    p_empresa_id:state.empresaId,
    p_data_inicio:fetchInfo.startStr.slice(0,10),
    p_data_fim:fetchInfo.endStr.slice(0,10),
    p_colaborador_id:colaboradorFilter==='ALL'?null:colaboradorFilter,
    p_status:null
  });
  if(error){failureCallback(error);msg(`${t("Unable to load appointments.")} ${error.message}`,'error');return;}
  const events=(data||[]).map(row=>({
    id:row.id,
    title:`${row.cliente_nome} · ${row.servico_nome}`,
    start:`${row.data}T${row.hora_inicio}`,
    end:`${row.data}T${row.hora_fim}`,
    backgroundColor:colorFor(row.colaborador_id),
    borderColor:colorFor(row.colaborador_id),
    classNames:[`appointment-${row.status}`],
    extendedProps:row
  }));
  successCallback(events);
}

async function handleReschedule(info){
  const row=info.event.extendedProps;
  const newData=info.event.startStr.slice(0,10);
  const newHoraInicio=info.event.startStr.slice(11,16);
  const newHoraFim=info.event.endStr.slice(11,16);
  const {error}=await db.rpc('mover_agendamento',{
    p_agendamento_id:row.id,p_nova_data:newData,p_novo_hora_inicio:newHoraInicio,p_novo_hora_fim:newHoraFim
  });
  if(error){
    info.revert();
    msg(`${t("Couldn't move this appointment.")} ${error.message}`,'error');
    return;
  }
  msg(t('Appointment moved successfully.'));
  state.calendar.refetchEvents();
}

function openDetail(event){
  const row=event.extendedProps;
  $('detail-title').textContent=row.cliente_nome;
  $('detail-client').textContent=row.cliente_nome;
  $('detail-service').textContent=row.servico_nome;
  $('detail-colaborador').textContent=row.colaborador_nome;
  $('detail-when').textContent=`${row.data} · ${row.hora_inicio.slice(0,5)} – ${row.hora_fim.slice(0,5)}`;
  $('detail-status').textContent=row.status;
  $('detail-notes').textContent=row.observacoes||'—';
  $('detail-cancel-appointment').dataset.id=row.id;
  $('detail-cancel-appointment').classList.toggle('hidden',row.status==='cancelado');
  $('detail-modal').classList.add('open');
}

function closeDetail(){$('detail-modal').classList.remove('open');}

async function cancelAppointment(id){
  if(!confirm(t('Cancel this appointment?')))return;
  const {error}=await db.rpc('cancelar_agendamento',{p_agendamento_id:id});
  if(error){msg(`${t("Unable to cancel this appointment.")} ${error.message}`,'error');return;}
  closeDetail();
  msg(t('Appointment cancelled.'));
  state.calendar.refetchEvents();
}

function initCalendar(){
  const el=$('calendar');
  state.calendar=new FullCalendar.Calendar(el,{
    initialView:'timeGridWeek',
    headerToolbar:{left:'prev,next today',center:'title',right:'dayGridMonth,timeGridWeek,timeGridDay'},
    height:'auto',
    slotMinTime:'06:00:00',
    slotMaxTime:'21:00:00',
    nowIndicator:true,
    editable:true,
    eventStartEditable:true,
    eventDurationEditable:true,
    events:fetchEvents,
    eventDrop:handleReschedule,
    eventResize:handleReschedule,
    eventClick:info=>openDetail(info.event),
    dateClick:info=>{
      const params=new URLSearchParams();
      const colaboradorFilter=$('colaborador-filter').value;
      if(colaboradorFilter!=='ALL')params.set('colaborador_id',colaboradorFilter);
      params.set('data',info.dateStr.slice(0,10));
      if(info.view.type.startsWith('timeGrid'))params.set('hora_inicio',info.dateStr.slice(11,16));
      location.href='customer-appointment-form.html?'+params.toString();
    }
  });
  state.calendar.render();
}

$('user-menu-btn')?.addEventListener('click',e=>{e.stopPropagation();const menu=$('user-menu');const hidden=menu.classList.toggle('hidden');$('user-menu-btn').setAttribute('aria-expanded',String(!hidden));});
document.addEventListener('click',e=>{if(!e.target.closest('.user-menu-wrap'))closeMenu();});
$('menu-logout')?.addEventListener('click',async()=>{await db.auth.signOut();location.href='index.html';});
$('colaborador-filter').addEventListener('change',()=>state.calendar?.refetchEvents());
$('detail-close').addEventListener('click',closeDetail);
$('detail-modal').addEventListener('click',e=>{if(e.target.id==='detail-modal')closeDetail();});
$('detail-cancel-appointment').addEventListener('click',e=>cancelAppointment(e.target.dataset.id));

async function init(){
  if(!(await loadProfile()))return;
  try{
    await loadColaboradores();
    initCalendar();
  }catch(e){console.error(e);msg(`${t("Unable to load the calendar.")} ${e.message||''}`,'error');}
}
init();
