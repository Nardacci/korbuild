if(!window.KORBUILD_APP){const s=document.createElement('script');s.src='app-config.js?v=1.2.2';document.head.appendChild(s);}
const {url,publishableKey}=window.KORBUILD_SUPABASE;
const db=window.supabase.createClient(url,publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const state={empresaId:null,services:[]};
function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
function closeMenu(){$('user-menu')?.classList.add('hidden');$('user-menu-btn')?.setAttribute('aria-expanded','false');}
function msg(text,type='success'){const e=$('message');e.textContent=text;e.className=`message ${type}`;e.classList.remove('hidden');}
function addMinutes(hhmm,minutes){const [h,m]=hhmm.split(':').map(Number);const total=h*60+m+minutes;const nh=Math.floor(((total%1440)+1440)%1440/60),nm=((total%60)+60)%60;return String(nh).padStart(2,'0')+':'+String(nm).padStart(2,'0');}

async function loadProfile(){
  const {data:{session},error}=await db.auth.getSession();
  if(error||!session?.user){location.href='index.html';return false;}
  const {data:profile,error:profileError}=await db.from('usuarios').select('id,name,empresa_id,empresas(name)').eq('id',session.user.id).maybeSingle();
  if(profileError||!profile?.empresa_id){msg(profileError?.message||'Unable to load workspace profile.','error');return false;}
  state.empresaId=profile.empresa_id;
  const company=profile.empresas?.name||'KORbuild Demo';
  const name=profile.name?.trim()&&profile.name!=='Owner'?profile.name:session.user.user_metadata?.full_name||`${company} Owner`;
  const initial=name.trim().charAt(0).toUpperCase()||'O';
  $('user-name').textContent=name;$('user-email').textContent=session.user.email||'';
  $('user-avatar').textContent=initial;
  return true;
}

async function loadOptions(){
  const [{data:clients,error:ce},{data:services,error:se},{data:colaboradores,error:pe}]=await Promise.all([
    db.rpc('obter_clientes',{p_empresa_id:state.empresaId}),
    db.rpc('obter_servicos_catalogo',{p_empresa_id:state.empresaId}),
    db.from('colaboradores').select('id,name').eq('empresa_id',state.empresaId).eq('active',true).order('name')
  ]);
  if(ce)throw ce;if(se)throw se;if(pe)throw pe;
  state.services=(services||[]).filter(s=>s.ativo);
  $('cliente-id').innerHTML='<option value="">Select a client</option>'+(clients||[]).map(c=>`<option value="${c.id}">${esc(c.nome)}</option>`).join('');
  $('servico-id').innerHTML='<option value="">Select a service</option>'+state.services.map(s=>`<option value="${s.id}" data-duration="${s.duracao_padrao_minutos}">${esc(s.nome)} (${s.duracao_padrao_minutos} min)</option>`).join('');
  $('colaborador-id').innerHTML='<option value="">Select a collaborator</option>'+(colaboradores||[]).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
}

function applyQueryPrefill(){
  const params=new URLSearchParams(location.search);
  if(params.get('colaborador_id'))$('colaborador-id').value=params.get('colaborador_id');
  if(params.get('data'))$('data').value=params.get('data');
  if(params.get('hora_inicio'))$('hora-inicio').value=params.get('hora_inicio');
}

function recomputeEndTime(){
  const servicoId=$('servico-id').value;
  const service=state.services.find(s=>s.id===servicoId);
  const start=$('hora-inicio').value;
  if(service&&start)$('hora-fim').value=addMinutes(start,service.duracao_padrao_minutos);
}

function toggleNewClient(force){
  const open=force??$('new-client-panel').classList.contains('hidden');
  $('new-client-panel').classList.toggle('hidden',!open);
  $('cliente-id').disabled=open;
  $('toggle-new-client').textContent=open?'Use existing client':'+ New client';
  if(open)$('cliente-id').value='';
}

function toggleNewService(force){
  const open=force??$('new-service-panel').classList.contains('hidden');
  $('new-service-panel').classList.toggle('hidden',!open);
  $('servico-id').disabled=open;
  $('toggle-new-service').textContent=open?'Use existing service':'+ New service';
  if(open)$('servico-id').value='';
}

async function resolveClienteId(){
  if(!$('new-client-panel').classList.contains('hidden')){
    const nome=$('new-client-nome').value.trim();
    const email=$('new-client-email').value.trim();
    const telefone=$('new-client-telefone').value.trim()||null;
    if(!nome||!email)throw new Error('New client name and email are required.');
    const {data,error}=await db.rpc('criar_cliente',{p_empresa_id:state.empresaId,p_nome:nome,p_email:email,p_telefone:telefone});
    if(error)throw error;
    return data;
  }
  const id=$('cliente-id').value;
  if(!id)throw new Error('Select a client or create a new one.');
  return id;
}

async function resolveServicoId(){
  if(!$('new-service-panel').classList.contains('hidden')){
    const nome=$('new-service-nome').value.trim();
    const duracao=Number($('new-service-duracao').value);
    const preco=Number($('new-service-preco').value);
    if(!nome)throw new Error('New service name is required.');
    if(!Number.isFinite(duracao)||duracao<=0)throw new Error('New service duration must be greater than zero.');
    if(!Number.isFinite(preco)||preco<0)throw new Error('New service price must be zero or greater.');
    const {data,error}=await db.rpc('criar_servico',{p_empresa_id:state.empresaId,p_nome:nome,p_duracao_padrao_minutos:duracao,p_preco_padrao:preco});
    if(error)throw error;
    return data;
  }
  const id=$('servico-id').value;
  if(!id)throw new Error('Select a service or create a new one.');
  return id;
}

async function save(event){
  event.preventDefault();
  const colaboradorId=$('colaborador-id').value;
  const data=$('data').value;
  const horaInicio=$('hora-inicio').value;
  const horaFim=$('hora-fim').value;
  const observacoes=$('observacoes').value.trim()||null;
  if(!colaboradorId||!data||!horaInicio||!horaFim){msg('Collaborator, date and time are required.','error');return;}
  if(horaFim<=horaInicio){msg('End time must be after the start time.','error');return;}
  const btn=$('save-btn');btn.disabled=true;btn.textContent='Saving...';
  try{
    const [clienteId,servicoId]=await Promise.all([resolveClienteId(),resolveServicoId()]);
    const {error}=await db.rpc('criar_agendamento',{
      p_empresa_id:state.empresaId,p_cliente_id:clienteId,p_colaborador_id:colaboradorId,p_servico_id:servicoId,
      p_data:data,p_hora_inicio:horaInicio,p_hora_fim:horaFim,p_observacoes:observacoes
    });
    if(error)throw error;
    msg('Appointment booked successfully.');
    setTimeout(()=>location.href='customer-schedule.html',600);
  }catch(error){
    msg(`We couldn't save this appointment. ${error.message||'Please try again.'}`,'error');
    btn.disabled=false;btn.textContent='Save Appointment';
  }
}

$('user-menu-btn')?.addEventListener('click',e=>{e.stopPropagation();const menu=$('user-menu');const hidden=menu.classList.toggle('hidden');$('user-menu-btn').setAttribute('aria-expanded',String(!hidden));});
document.addEventListener('click',e=>{if(!e.target.closest('.user-menu-wrap'))closeMenu();});
$('menu-logout')?.addEventListener('click',async()=>{await db.auth.signOut();location.href='index.html';});
$('toggle-new-client').addEventListener('click',()=>toggleNewClient());
$('toggle-new-service').addEventListener('click',()=>toggleNewService());
$('servico-id').addEventListener('change',recomputeEndTime);
$('hora-inicio').addEventListener('change',recomputeEndTime);
$('appointment-form').addEventListener('submit',save);

async function init(){
  if(!(await loadProfile()))return;
  try{
    await loadOptions();
    applyQueryPrefill();
    recomputeEndTime();
  }catch(e){msg(`Unable to load form options. ${e.message||''}`,'error');}
}
init();
