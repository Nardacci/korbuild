if(!window.KORBUILD_APP){const s=document.createElement('script');s.src='app-config.js?v=1.2.2';document.head.appendChild(s);}
const {url,publishableKey}=window.KORBUILD_SUPABASE;
const db=window.supabase.createClient(url,publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const state={empresaId:null,clients:[]};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate=v=>v?new Date(v).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—';
function closeMenu(){$('user-menu')?.classList.add('hidden');$('user-menu-btn')?.setAttribute('aria-expanded','false');}
function msg(text,type='success'){const e=$('message');e.textContent=text;e.className=`message ${type}`;e.classList.remove('hidden');}

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
  $('user-avatar').textContent=initial;$('menu-avatar').textContent=initial;$('menu-full-name').textContent=name;$('menu-full-email').textContent=session.user.email||'';
  return true;
}

async function loadClients(){
  const {data,error}=await db.rpc('obter_clientes',{p_empresa_id:state.empresaId});
  if(error)throw error;
  state.clients=data||[];
  render();
}

function render(){
  const q=($('search').value||'').trim().toLowerCase();
  const rows=state.clients.filter(c=>!q||c.nome.toLowerCase().includes(q)||(c.email||'').toLowerCase().includes(q));
  $('total-count').textContent=state.clients.length;
  $('clients-body').innerHTML=rows.map(c=>`<tr>
    <td><div class="team-name">${esc(c.nome)}</div></td>
    <td>${esc(c.email||'—')}</td>
    <td>${esc(c.telefone||'—')}</td>
    <td>${fmtDate(c.criado_em)}</td>
    <td><div class="row-actions"><a class="small-btn" href="customer-form.html?id=${encodeURIComponent(c.id)}">Edit</a></div></td>
  </tr>`).join('');
  $('empty-state').classList.toggle('hidden',rows.length!==0);
}

$('user-menu-btn')?.addEventListener('click',e=>{e.stopPropagation();const menu=$('user-menu');const hidden=menu.classList.toggle('hidden');$('user-menu-btn').setAttribute('aria-expanded',String(!hidden));});
document.addEventListener('click',e=>{if(!e.target.closest('.user-menu-wrap'))closeMenu();});
$('menu-logout')?.addEventListener('click',async()=>{await db.auth.signOut();location.href='index.html';});
$('search').addEventListener('input',render);

async function init(){if(!(await loadProfile()))return;try{await loadClients();}catch(e){console.error(e);msg(`Unable to load clients. ${e.message||''}`,'error');}}
init();
