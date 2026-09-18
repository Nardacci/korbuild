if(!window.KORBUILD_APP){const s=document.createElement('script');s.src='app-config.js?v=1.2.2';document.head.appendChild(s);}
const {url,publishableKey}=window.KORBUILD_SUPABASE;
const db=window.supabase.createClient(url,publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const state={empresaId:null};
const SAMPLE_VARS={cliente_nome:'Jane Cooper',data:'Oct 12, 2026',hora:'14:30',servico_nome:'Haircut',colaborador_nome:'Alex Rivera'};
function closeMenu(){$('user-menu')?.classList.add('hidden');$('user-menu-btn')?.setAttribute('aria-expanded','false');}
function msg(text,type='success'){const e=$('message');e.textContent=text;e.className=`message ${type}`;e.classList.remove('hidden');}
function renderTemplate(template,vars){return String(template||'').replace(/\{\{\s*(\w+)\s*\}\}/g,(_,key)=>vars[key]??'');}

function updatePreview(){
  $('preview-subject').textContent=renderTemplate($('template-assunto').value,SAMPLE_VARS)||'—';
  $('preview-body').textContent=renderTemplate($('template-corpo').value,SAMPLE_VARS)||'—';
}

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

async function loadSettings(){
  const {data,error}=await db.rpc('obter_configuracoes_lembrete',{p_empresa_id:state.empresaId});
  if(error)throw error;
  const config=(data||[])[0];
  if(config){
    $('canal').value=config.canal;
    $('horas-antes').value=config.horas_antes;
    $('ativo').checked=config.ativo!==false;
    $('template-assunto').value=config.template_assunto||'';
    $('template-corpo').value=config.template_corpo||'';
  }else{
    $('template-assunto').value='Reminder: your appointment on {{data}} at {{hora}}';
    $('template-corpo').value='Hi {{cliente_nome}}, this is a reminder for your {{servico_nome}} appointment on {{data}} at {{hora}}.';
  }
  updatePreview();
}

async function save(event){
  event.preventDefault();
  const canal=$('canal').value;
  const horasAntes=Number($('horas-antes').value);
  const templateAssunto=$('template-assunto').value.trim();
  const templateCorpo=$('template-corpo').value.trim();
  const ativo=$('ativo').checked;
  if(!Number.isFinite(horasAntes)||horasAntes<=0){msg('Send hours before must be greater than zero.','error');return;}
  if(!templateAssunto||!templateCorpo){msg('Email subject and body are required.','error');return;}
  const btn=$('save-btn');btn.disabled=true;btn.textContent='Saving...';
  try{
    const {error}=await db.rpc('atualizar_configuracao_lembrete',{
      p_empresa_id:state.empresaId,p_canal:canal,p_horas_antes:horasAntes,
      p_template_assunto:templateAssunto,p_template_corpo:templateCorpo,p_ativo:ativo
    });
    if(error)throw error;
    msg('Reminder settings updated successfully.');
  }catch(error){
    msg(`We couldn't save these settings. ${error.message||'Please try again.'}`,'error');
  }finally{
    btn.disabled=false;btn.textContent='Save Settings';
  }
}

$('user-menu-btn')?.addEventListener('click',e=>{e.stopPropagation();const menu=$('user-menu');const hidden=menu.classList.toggle('hidden');$('user-menu-btn').setAttribute('aria-expanded',String(!hidden));});
document.addEventListener('click',e=>{if(!e.target.closest('.user-menu-wrap'))closeMenu();});
$('menu-logout')?.addEventListener('click',async()=>{await db.auth.signOut();location.href='index.html';});
$('template-assunto').addEventListener('input',updatePreview);
$('template-corpo').addEventListener('input',updatePreview);
$('reminder-form').addEventListener('submit',save);

async function init(){if(!(await loadProfile()))return;try{await loadSettings();}catch(e){msg(`Unable to load reminder settings. ${e.message||''}`,'error');}}
init();
