if(!window.KORBUILD_APP){const s=document.createElement('script');s.src='app-config.js?v=1.2.2';document.head.appendChild(s);}
const {url,publishableKey}=window.KORBUILD_SUPABASE;
const db=window.supabase.createClient(url,publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
// diaInicioSemana: no longer surfaced in the UI (see git history 2026-09-20
// -- Payment's week now comes from configuracoes_operacionais.
// period_start_day/period_end_day, the same source Bonus uses, not this
// field). Still round-tripped silently on save because atualizar_
// configuracao_folha()'s p_dia_inicio_semana has no SQL default and the
// column/RPC parameter were intentionally left in place -- this just
// keeps whatever value is already stored instead of resetting it.
const state={empresaId:null,diaInicioSemana:1};
function closeMenu(){$('user-menu')?.classList.add('hidden');$('user-menu-btn')?.setAttribute('aria-expanded','false');}
function msg(text,type='success'){const e=$('message');e.textContent=text;e.className=`message ${type}`;e.classList.remove('hidden');}
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

async function loadSettings(){
  const {data,error}=await db.rpc('obter_configuracoes_folha',{p_empresa_id:state.empresaId});
  if(error)throw error;
  const config=(data||[])[0];
  if(config){
    state.diaInicioSemana=config.dia_inicio_semana;
    $('horas-padrao-semana').value=config.horas_padrao_semana;
    $('multiplicador-hora-extra').value=config.multiplicador_hora_extra;
    $('currency').value=config.currency||'BRL';
  }
}

async function save(event){
  event.preventDefault();
  const horasPadrao=Number($('horas-padrao-semana').value);
  const multiplicador=Number($('multiplicador-hora-extra').value);
  const currency=$('currency').value;
  if(!Number.isFinite(horasPadrao)||horasPadrao<=0){msg('Standard hours per week must be greater than zero.','error');return;}
  if(!Number.isFinite(multiplicador)||multiplicador<1){msg('Overtime multiplier must be 1 or greater.','error');return;}
  const btn=$('save-btn');btn.disabled=true;btn.textContent='Saving...';
  try{
    const {error}=await db.rpc('atualizar_configuracao_folha',{
      p_empresa_id:state.empresaId,
      p_dia_inicio_semana:state.diaInicioSemana,
      p_horas_padrao_semana:horasPadrao,
      p_multiplicador_hora_extra:multiplicador,
      p_currency:currency
    });
    if(error)throw error;
    msg('Payroll settings updated successfully.');
  }catch(error){
    msg(`${t("We couldn't save these settings.")} ${error.message||t('Please try again.')}`,'error');
  }finally{
    btn.disabled=false;btn.textContent='Save Settings';
  }
}

$('user-menu-btn')?.addEventListener('click',e=>{e.stopPropagation();const menu=$('user-menu');const hidden=menu.classList.toggle('hidden');$('user-menu-btn').setAttribute('aria-expanded',String(!hidden));});
document.addEventListener('click',e=>{if(!e.target.closest('.user-menu-wrap'))closeMenu();});
$('menu-logout')?.addEventListener('click',async()=>{await db.auth.signOut();location.href='index.html';});
$('payroll-settings-form').addEventListener('submit',save);

async function init(){if(!(await loadProfile()))return;try{await loadSettings();}catch(e){msg(`${t("Unable to load payroll settings.")} ${e.message||''}`,'error');}}
init();
