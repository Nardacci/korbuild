if(!window.KORBUILD_APP){const s=document.createElement('script');s.src='app-config.js?v=1.2.2';document.head.appendChild(s);}
const {url,publishableKey}=window.KORBUILD_SUPABASE;
const db=window.supabase.createClient(url,publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const state={empresaId:null,isAdmin:false,colaboradores:[],rows:[]};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate=s=>s?new Date(s+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—';
const fmtTime=t=>t?t.slice(0,5):'';
const t=s=>window.KORbuildI18n?window.KORbuildI18n.t(s):s;
const STATUS_LABEL={
  'en-US':{pendente:'Pending',aprovado:'Approved',rejeitado:'Rejected',confirmado:'Confirmed'},
  'pt-BR':{pendente:'Pendente',aprovado:'Aprovado',rejeitado:'Rejeitado',confirmado:'Confirmado'}
};
function statusLabel(status){const lang=window.KORbuildI18n?window.KORbuildI18n.language:'en-US';return (STATUS_LABEL[lang]||STATUS_LABEL['en-US'])[status]||status;}
// tipos_escala.rotulo is seeded straight into English -- translated here
// by tipo_codigo (a stable Portuguese key obter_escalas already returns),
// same pattern as schedule-form.js's own tipoEscalaLabel().
const TIPO_ESCALA_LABEL={
  'en-US':{turno:'Shift',ferias:'Vacation',folga:'Day Off',compromisso:'Commitment'},
  'pt-BR':{turno:'Turno',ferias:'Férias',folga:'Folga',compromisso:'Compromisso'}
};
function tipoEscalaLabel(codigo){const lang=window.KORbuildI18n?window.KORbuildI18n.language:'en-US';return (TIPO_ESCALA_LABEL[lang]||TIPO_ESCALA_LABEL['en-US'])[codigo]||codigo;}
function closeMenu(){$('user-menu')?.classList.add('hidden');$('user-menu-btn')?.setAttribute('aria-expanded','false');}
function msg(text,type='success'){const e=$('message');e.textContent=text;e.className=`message ${type}`;e.classList.remove('hidden');}
function clearMsg(){$('message')?.classList.add('hidden');}
function isoDate(d){return d.toISOString().slice(0,10);}
function defaultRange(){const today=new Date();const start=new Date(today);start.setDate(start.getDate()-7);const end=new Date(today);end.setDate(end.getDate()+21);return {start:isoDate(start),end:isoDate(end)};}

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
  const {data:isAdmin}=await db.rpc('is_empresa_admin');
  state.isAdmin=!!isAdmin;
  return true;
}

async function loadColaboradores(){
  const {data,error}=await db.from('colaboradores').select('id,name').eq('empresa_id',state.empresaId).order('name');
  if(error)throw error;
  state.colaboradores=data||[];
  const sel=$('colaborador-filter');
  sel.innerHTML='<option value="ALL">All people</option>'+state.colaboradores.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
}

async function loadSchedule(){
  const start=$('range-start').value||defaultRange().start;
  const end=$('range-end').value||defaultRange().end;
  const {data,error}=await db.rpc('obter_escalas',{p_empresa_id:state.empresaId,p_data_inicio:start,p_data_fim:end});
  if(error)throw error;
  state.rows=data||[];
  render();
}

function render(){
  const q=($('search').value||'').trim().toLowerCase();
  const colaboradorId=$('colaborador-filter').value;
  const status=$('status-filter').value;
  const rows=state.rows.filter(r=>{
    const matchesText=!q||r.colaborador_nome.toLowerCase().includes(q);
    const matchesColaborador=colaboradorId==='ALL'||r.colaborador_id===colaboradorId;
    const matchesStatus=status==='ALL'||r.status===status;
    return matchesText&&matchesColaborador&&matchesStatus;
  });
  $('pending-count').textContent=state.rows.filter(r=>r.status==='pendente').length;
  const today=new Date();today.setHours(0,0,0,0);
  const weekEnd=new Date(today);weekEnd.setDate(weekEnd.getDate()+7);
  $('week-count').textContent=state.rows.filter(r=>{const s=new Date(r.data_inicio+'T00:00:00'),e=new Date(r.data_fim+'T00:00:00');return e>=today&&s<=weekEnd;}).length;
  $('total-count').textContent=state.rows.length;
  $('schedule-body').innerHTML=rows.map(r=>{
    const canApprove=state.isAdmin&&r.status==='pendente';
    const period=r.data_inicio===r.data_fim?fmtDate(r.data_inicio):`${fmtDate(r.data_inicio)} → ${fmtDate(r.data_fim)}`;
    const time=r.hora_inicio&&r.hora_fim?`${fmtTime(r.hora_inicio)} – ${fmtTime(r.hora_fim)}`:'—';
    return `<tr>
      <td><div class="team-name">${esc(r.colaborador_nome)}</div></td>
      <td><span class="type-chip" style="--chip-color:${esc(r.tipo_cor||'#635bff')}"><span class="dot"></span>${esc(tipoEscalaLabel(r.tipo_codigo))}</span></td>
      <td>${period}</td>
      <td>${time}</td>
      <td><span class="schedule-status ${r.status}"><span class="dot"></span>${statusLabel(r.status)}</span></td>
      <td><div class="row-actions">${canApprove?`<button class="small-btn approve-btn" data-action="approve" data-id="${r.id}">Approve</button><button class="small-btn reject-btn" data-action="reject" data-id="${r.id}">Reject</button>`:''}</div></td>
    </tr>`;
  }).join('');
  $('empty-state').classList.toggle('hidden',rows.length!==0);
}

async function decide(id,status){
  clearMsg();
  const {error}=await db.rpc('aprovar_escala',{p_escala_id:id,p_status:status});
  if(error){msg(`${t("Unable to update this entry.")} ${error.message}`,'error');return;}
  msg(status==='aprovado'?t('Entry approved.'):t('Entry rejected.'));
  await loadSchedule();
}

$('user-menu-btn')?.addEventListener('click',e=>{e.stopPropagation();const menu=$('user-menu');const hidden=menu.classList.toggle('hidden');$('user-menu-btn').setAttribute('aria-expanded',String(!hidden));});
document.addEventListener('click',e=>{if(!e.target.closest('.user-menu-wrap'))closeMenu();});
$('menu-logout')?.addEventListener('click',async()=>{await db.auth.signOut();location.href='index.html';});
$('search').addEventListener('input',render);
$('colaborador-filter').addEventListener('change',render);
$('status-filter').addEventListener('change',render);
$('range-start').addEventListener('change',()=>loadSchedule().catch(e=>msg(e.message,'error')));
$('range-end').addEventListener('change',()=>loadSchedule().catch(e=>msg(e.message,'error')));
$('schedule-body').addEventListener('click',e=>{
  const btn=e.target.closest('button[data-action]');
  if(!btn)return;
  if(btn.dataset.action==='approve')decide(btn.dataset.id,'aprovado');
  if(btn.dataset.action==='reject')decide(btn.dataset.id,'rejeitado');
});

async function init(){
  const range=defaultRange();
  $('range-start').value=range.start;$('range-end').value=range.end;
  if(!(await loadProfile()))return;
  try{await db.rpc('garantir_tipos_escala_padrao',{p_empresa_id:state.empresaId});}catch(e){}
  try{
    await loadColaboradores();
    await loadSchedule();
  }catch(e){console.error(e);msg(`${t("Unable to load Schedule.")} ${e.message||''}`,'error');}
}
init();
