if(!window.KORBUILD_APP){const s=document.createElement('script');s.src='app-config.js?v=1.2.2';document.head.appendChild(s);}
const {url,publishableKey}=window.KORBUILD_SUPABASE;
const db=window.supabase.createClient(url,publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const state={empresaId:null,colaboradores:[],calendar:null,view:'day',date:DayPilot.Date.today()};
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

function visibleColaboradores(){
  const filter=$('colaborador-filter').value;
  if(filter==='ALL')return state.colaboradores;
  return state.colaboradores.filter(c=>c.id===filter);
}

function rangeForView(){
  if(state.view==='day')return {start:state.date, end:state.date.addDays(1)};
  const weekStart=state.date.firstDayOfWeek();
  return {start:weekStart, end:weekStart.addDays(7)};
}

function updateNavLabel(){
  const {start,end}=rangeForView();
  $('nav-label').textContent=state.view==='day'
    ? start.toString('ddd, MMM d, yyyy')
    : `${start.toString('MMM d')} → ${end.addDays(-1).toString('MMM d, yyyy')}`;
}

async function fetchEvents(){
  clearMsg();
  const {start,end}=rangeForView();
  const colaboradorFilter=$('colaborador-filter').value;
  const {data,error}=await db.rpc('obter_agendamentos',{
    p_empresa_id:state.empresaId,
    p_data_inicio:start.toString('yyyy-MM-dd'),
    p_data_fim:end.toString('yyyy-MM-dd'),
    p_colaborador_id:colaboradorFilter==='ALL'?null:colaboradorFilter,
    p_status:null
  });
  if(error){msg(`${t("Unable to load appointments.")} ${error.message}`,'error');return [];}
  return (data||[]).map(row=>({
    id:row.id,
    text:`${row.cliente_nome} · ${row.servico_nome}`,
    start:`${row.data}T${row.hora_inicio}`,
    end:`${row.data}T${row.hora_fim}`,
    resource:row.colaborador_id,
    backColor:colorFor(row.colaborador_id),
    cssClass:`appointment-${row.status}`,
    tags:row
  }));
}

async function refetchAndRender(){
  const events=await fetchEvents();
  state.calendar.update({startDate:rangeForView().start, events});
  updateNavLabel();
}

async function handleReschedule(args){
  const row=args.e.data.tags;
  const newDate=args.newStart.toString('yyyy-MM-dd');
  const newHoraInicio=args.newStart.toString('HH:mm');
  const newHoraFim=args.newEnd.toString('HH:mm');
  const newColaboradorId=args.newResource||row.colaborador_id;
  args.async=true;
  const {error}=await db.rpc('mover_agendamento',{
    p_agendamento_id:row.id,p_nova_data:newDate,p_novo_hora_inicio:newHoraInicio,p_novo_hora_fim:newHoraFim,p_novo_colaborador_id:newColaboradorId
  });
  if(error){
    args.preventDefault();
    msg(`${t("Couldn't move this appointment.")} ${error.message}`,'error');
    return;
  }
  msg(t('Appointment moved successfully.'));
  await refetchAndRender();
}

function openDetail(e){
  const row=e.data.tags;
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
  await refetchAndRender();
}

function goToNewAppointment(resourceId,start){
  const params=new URLSearchParams();
  if(resourceId)params.set('colaborador_id',resourceId);
  params.set('data',start.toString('yyyy-MM-dd'));
  if(state.view==='day')params.set('hora_inicio',start.toString('HH:mm'));
  location.href='customer-appointment-form.html?'+params.toString();
}

function buildCalendarConfig(){
  const {start}=rangeForView();
  const base={
    startDate:start,
    height:600,
    heightSpec:'Fixed',
    businessBeginsHour:6,
    businessEndsHour:21,
    eventMoveHandling:'Update',
    eventResizeHandling:'Disabled',
    timeRangeSelectedHandling:'Enabled',
    onEventMove:handleReschedule,
    onEventClicked:args=>openDetail(args.e),
    onTimeRangeSelected:args=>{
      const resourceId=args.resource||null;
      goToNewAppointment(resourceId,args.start);
      state.calendar.clearSelection();
    },
    onBeforeEventRender:args=>{
      if(args.data.cssClass)args.data.cssClass=args.data.cssClass;
    }
  };
  if(state.view==='day'){
    return {...base, viewType:'Resources', columns:visibleColaboradores().map(c=>({name:c.name,id:c.id}))};
  }
  return {...base, viewType:'Week', days:7};
}

async function setView(view){
  state.view=view;
  $('view-day').classList.toggle('active',view==='day');
  $('view-week').classList.toggle('active',view==='week');
  state.calendar.update(buildCalendarConfig());
  await refetchAndRender();
}

function navigate(delta){
  state.date=state.view==='day'?state.date.addDays(delta):state.date.addDays(delta*7);
  state.calendar.update({startDate:rangeForView().start});
  refetchAndRender();
}

$('user-menu-btn')?.addEventListener('click',e=>{e.stopPropagation();const menu=$('user-menu');const hidden=menu.classList.toggle('hidden');$('user-menu-btn').setAttribute('aria-expanded',String(!hidden));});
document.addEventListener('click',e=>{if(!e.target.closest('.user-menu-wrap'))closeMenu();});
$('menu-logout')?.addEventListener('click',async()=>{await db.auth.signOut();location.href='index.html';});
$('colaborador-filter').addEventListener('change',()=>{
  if(state.view==='day')state.calendar.update({columns:visibleColaboradores().map(c=>({name:c.name,id:c.id}))});
  refetchAndRender();
});
$('detail-close').addEventListener('click',closeDetail);
$('detail-modal').addEventListener('click',e=>{if(e.target.id==='detail-modal')closeDetail();});
$('detail-cancel-appointment').addEventListener('click',e=>cancelAppointment(e.target.dataset.id));
$('view-day').addEventListener('click',()=>setView('day'));
$('view-week').addEventListener('click',()=>setView('week'));
$('nav-prev').addEventListener('click',()=>navigate(-1));
$('nav-next').addEventListener('click',()=>navigate(1));
$('nav-today').addEventListener('click',()=>{state.date=DayPilot.Date.today();state.calendar.update({startDate:rangeForView().start});refetchAndRender();});

async function init(){
  if(!(await loadProfile()))return;
  try{
    await loadColaboradores();
    state.calendar=new DayPilot.Calendar('calendar', buildCalendarConfig());
    state.calendar.init();
    await refetchAndRender();
  }catch(e){console.error(e);msg(`${t("Unable to load the calendar.")} ${e.message||''}`,'error');}
}
init();
