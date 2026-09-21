if(!window.KORBUILD_APP){const s=document.createElement('script');s.src='app-config.js?v=1.2.2';document.head.appendChild(s);}
const {url,publishableKey}=window.KORBUILD_SUPABASE;
const db=window.supabase.createClient(url,publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const state={empresaId:null,editingId:new URLSearchParams(location.search).get('id')};
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

async function loadClient(){
  if(!state.editingId)return;
  const {data,error}=await db.from('clientes').select('id,nome,email,telefone,endereco').eq('id',state.editingId).eq('empresa_id',state.empresaId).maybeSingle();
  if(error||!data){msg(error?.message||'Client not found.','error');return;}
  $('nome').value=data.nome||'';$('email').value=data.email||'';$('telefone').value=data.telefone||'';$('endereco').value=data.endereco||'';
  $('page-title').textContent='Edit Client';$('save-btn').textContent='Save Changes';
}

async function save(event){
  event.preventDefault();
  const nome=$('nome').value.trim();
  const email=$('email').value.trim();
  const telefone=$('telefone').value.trim()||null;
  const endereco=$('endereco').value.trim()||null;
  if(!nome){msg('Name is required.','error');return;}
  if(!email){msg('Email is required.','error');return;}
  await ready;if(!state.empresaId)return;const btn=$('save-btn');btn.disabled=true;btn.textContent='Saving...';
  try{
    let error;
    if(state.editingId){
      ({error}=await db.rpc('atualizar_cliente',{p_cliente_id:state.editingId,p_nome:nome,p_email:email,p_telefone:telefone,p_endereco:endereco}));
    }else{
      ({error}=await db.rpc('criar_cliente',{p_empresa_id:state.empresaId,p_nome:nome,p_email:email,p_telefone:telefone,p_endereco:endereco}));
    }
    if(error)throw error;
    msg(state.editingId?t('Client updated successfully.'):t('Client added successfully.'));
    setTimeout(()=>location.href='customers.html',600);
  }catch(error){
    msg(`${t("We couldn't save this client.")} ${error.message||t('Please try again.')}`,'error');
    btn.disabled=false;btn.textContent=state.editingId?'Save Changes':'Save Client';
  }
}

$('user-menu-btn')?.addEventListener('click',e=>{e.stopPropagation();const menu=$('user-menu');const hidden=menu.classList.toggle('hidden');$('user-menu-btn').setAttribute('aria-expanded',String(!hidden));});
document.addEventListener('click',e=>{if(!e.target.closest('.user-menu-wrap'))closeMenu();});
$('menu-logout')?.addEventListener('click',async()=>{await db.auth.signOut();location.href='index.html';});
$('client-form').addEventListener('submit',save);

async function init(){if(!(await loadProfile()))return;await loadClient();}
const ready=init();
