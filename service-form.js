if(!window.KORBUILD_APP){const s=document.createElement('script');s.src='app-config.js?v=1.2.2';document.head.appendChild(s);}
const {url,publishableKey}=window.KORBUILD_SUPABASE;
const db=window.supabase.createClient(url,publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const set=(id,prop,value)=>{const e=$(id);if(e)e[prop]=value};
const state={empresaId:null,id:new URLSearchParams(location.search).get('id')};
function msg(t,type='success'){const e=$('message');if(!e)return;e.textContent=t;e.className=`message ${type}`;e.classList.remove('hidden')}
function closeMenu(){const m=$('user-menu');if(m)m.classList.add('hidden');$('user-menu-btn')?.setAttribute('aria-expanded','false')}
function toggleActive(){set('active-label','textContent',$('active')?.checked?'Active':'Inactive')}

async function init(){
  const {data:{session}}=await db.auth.getSession();
  if(!session?.user){location.href='index.html';return}
  const {data:p,error:pe}=await db.from('usuarios').select('id,name,empresa_id,empresas(name)').eq('id',session.user.id).maybeSingle();
  if(pe||!p?.empresa_id){msg(pe?.message||'Unable to load workspace profile.','error');return}
  state.empresaId=p.empresa_id;
  const name=p.name?.trim()&&p.name!=='Owner'?p.name:session.user.user_metadata?.full_name||`${p.empresas?.name||'KORbuild'} Owner`;
  set('user-name','textContent',name);set('user-email','textContent',session.user.email||'');
  const initial=name.trim().charAt(0).toUpperCase()||'O';
  set('user-avatar','textContent',initial);set('menu-avatar','textContent',initial);set('menu-full-name','textContent',name);set('menu-full-email','textContent',session.user.email||'');

  if(state.id){
    set('page-title','textContent','Edit Service');set('save-btn','textContent','Save Changes');
    const {data:item,error}=await db.from('servicos_catalogo').select('id,nome,duracao_padrao_minutos,preco_padrao,ativo').eq('id',state.id).eq('empresa_id',state.empresaId).maybeSingle();
    if(error||!item){msg(error?.message||'Service not found.','error');return}
    set('nome','value',item.nome||'');
    set('duracao','value',item.duracao_padrao_minutos??60);
    set('preco','value',item.preco_padrao??0);
    set('active','checked',item.ativo!==false);
    toggleActive();
  }else toggleActive();
}

$('user-menu-btn')?.addEventListener('click',e=>{e.stopPropagation();const m=$('user-menu');const h=m.classList.toggle('hidden');$('user-menu-btn').setAttribute('aria-expanded',String(!h))});
document.addEventListener('click',e=>{if(!e.target.closest('.user-menu-wrap'))closeMenu()});
$('menu-logout')?.addEventListener('click',async()=>{await db.auth.signOut();location.href='index.html'});
$('active')?.addEventListener('change',toggleActive);

$('service-form')?.addEventListener('submit',async e=>{
  e.preventDefault();
  const nome=$('nome')?.value.trim();
  const duracao=Number($('duracao')?.value);
  const preco=Number($('preco')?.value);
  const ativo=$('active')?.checked;
  if(!nome){msg('Name is required.','error');return}
  if(!Number.isFinite(duracao)||duracao<=0){msg('Duration must be greater than zero.','error');return}
  if(!Number.isFinite(preco)||preco<0){msg('Default price cannot be negative.','error');return}
  set('save-btn','disabled',true);
  try{
    let result;
    if(state.id)result=await db.rpc('atualizar_servico',{p_servico_id:state.id,p_nome:nome,p_duracao_padrao_minutos:duracao,p_preco_padrao:preco,p_ativo:ativo});
    else result=await db.rpc('criar_servico',{p_empresa_id:state.empresaId,p_nome:nome,p_duracao_padrao_minutos:duracao,p_preco_padrao:preco,p_ativo:ativo});
    if(result.error)throw result.error;
    msg(state.id?'Service updated successfully.':'Service created successfully.');
    setTimeout(()=>location.href='services.html',600);
  }catch(error){
    msg(`We couldn't save this service. ${error.message||'Please try again.'}`,'error');
    set('save-btn','disabled',false);
  }
});

init();
