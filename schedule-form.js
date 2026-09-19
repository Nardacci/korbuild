if(!window.KORBUILD_APP){const s=document.createElement('script');s.src='app-config.js?v=1.2.2';document.head.appendChild(s);}
const {url,publishableKey}=window.KORBUILD_SUPABASE;
const db=window.supabase.createClient(url,publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const state={empresaId:null,tipos:[]};
function closeMenu(){$('user-menu')?.classList.add('hidden');$('user-menu-btn')?.setAttribute('aria-expanded','false');}
function msg(text,type='success'){const e=$('message');e.textContent=text;e.className=`message ${type}`;e.classList.remove('hidden');}
function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
const t=s=>window.KORbuildI18n?window.KORbuildI18n.t(s):s;

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
  $('user-avatar').textContent=initial;
  return true;
}

async function loadOptions(){
  try{await db.rpc('garantir_tipos_escala_padrao',{p_empresa_id:state.empresaId});}catch(e){}
  const [{data:colaboradores,error:ce},{data:tipos,error:te}]=await Promise.all([
    db.from('colaboradores').select('id,name').eq('empresa_id',state.empresaId).eq('active',true).order('name'),
    db.from('tipos_escala').select('id,codigo,rotulo,requer_aprovacao').eq('empresa_id',state.empresaId).order('rotulo')
  ]);
  if(ce)throw ce;if(te)throw te;
  state.tipos=tipos||[];
  $('colaborador-id').innerHTML='<option value="">Select a person</option>'+(colaboradores||[]).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  $('tipo-escala-id').innerHTML='<option value="">Select a type</option>'+state.tipos.map(t=>`<option value="${t.id}">${esc(t.rotulo)}</option>`).join('');
}

function updateApprovalHint(){
  const tipo=state.tipos.find(t=>t.id===$('tipo-escala-id').value);
  $('approval-hint').classList.toggle('hidden',!tipo?.requer_aprovacao);
}

async function save(event){
  event.preventDefault();
  const colaboradorId=$('colaborador-id').value;
  const tipoEscalaId=$('tipo-escala-id').value;
  const dataInicio=$('data-inicio').value;
  const dataFim=$('data-fim').value;
  const horaInicio=$('hora-inicio').value||null;
  const horaFim=$('hora-fim').value||null;
  const observacoes=$('observacoes').value.trim()||null;
  if(!colaboradorId||!tipoEscalaId||!dataInicio||!dataFim){msg('Person, type and date range are required.','error');return;}
  if(dataFim<dataInicio){msg('End date must be on or after the start date.','error');return;}
  const btn=$('save-btn');btn.disabled=true;btn.textContent='Saving...';
  try{
    const {error}=await db.rpc('criar_escala',{
      p_empresa_id:state.empresaId,
      p_colaborador_id:colaboradorId,
      p_tipo_escala_id:tipoEscalaId,
      p_data_inicio:dataInicio,
      p_data_fim:dataFim,
      p_hora_inicio:horaInicio,
      p_hora_fim:horaFim,
      p_observacoes:observacoes
    });
    if(error)throw error;
    msg('Schedule entry created successfully.');
    setTimeout(()=>location.href='schedule.html',600);
  }catch(error){
    msg(`${t("We couldn't save this entry.")} ${error.message||t('Please try again.')}`,'error');
    btn.disabled=false;btn.textContent='Save Entry';
  }
}

$('user-menu-btn')?.addEventListener('click',e=>{e.stopPropagation();const menu=$('user-menu');const hidden=menu.classList.toggle('hidden');$('user-menu-btn').setAttribute('aria-expanded',String(!hidden));});
document.addEventListener('click',e=>{if(!e.target.closest('.user-menu-wrap'))closeMenu();});
$('menu-logout')?.addEventListener('click',async()=>{await db.auth.signOut();location.href='index.html';});
$('tipo-escala-id').addEventListener('change',updateApprovalHint);
$('schedule-form').addEventListener('submit',save);

async function init(){if(!(await loadProfile()))return;try{await loadOptions();}catch(e){msg(`${t("Unable to load form options.")} ${e.message||''}`,'error');}}
init();
