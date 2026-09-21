if(!window.KORBUILD_APP){const s=document.createElement('script');s.src='app-config.js?v=1.2.2';document.head.appendChild(s);}
const {url,publishableKey}=window.KORBUILD_SUPABASE;
const db=window.supabase.createClient(url,publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const state={empresaId:null,items:[]};
function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
// Local map, not routed through i18n.js's DOM text-node walk: the DICT's
// own "Active"->"Ativas" entry is tuned for a plural KPI-card context
// elsewhere, not a singular per-row status badge. "Inactive"/"Activate"/
// "Deactivate" have no DICT entry at all. Same pattern used in
// accounts-payable.js/loans.js.
const ACTIVE_STATUS_LABEL={'en-US':{active:'Active',inactive:'Inactive'},'pt-BR':{active:'Ativo',inactive:'Inativo'}};
const ACTIVE_TOGGLE_LABEL={'en-US':{active:'Deactivate',inactive:'Activate'},'pt-BR':{active:'Desativar',inactive:'Ativar'}};
function activeStatusLabel(isActive){const lang=window.KORbuildI18n?window.KORbuildI18n.language:'en-US';return (ACTIVE_STATUS_LABEL[lang]||ACTIVE_STATUS_LABEL['en-US'])[isActive?'active':'inactive'];}
function activeToggleLabel(isActive){const lang=window.KORbuildI18n?window.KORbuildI18n.language:'en-US';return (ACTIVE_TOGGLE_LABEL[lang]||ACTIVE_TOGGLE_LABEL['en-US'])[isActive?'active':'inactive'];}
function msg(t,type='success'){const e=$('message');e.textContent=t;e.className=`message ${type}`;e.classList.remove('hidden')}
function closeMenu(){$('user-menu')?.classList.add('hidden');$('user-menu-btn')?.setAttribute('aria-expanded','false')}
function date(v){return v?new Date(v).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—'}
function money(v){return '$'+Number(v||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}

async function profile(){
  const {data:{session}}=await db.auth.getSession();
  if(!session?.user){location.href='index.html';return false}
  const {data:p,error}=await db.from('usuarios').select('id,name,empresa_id,empresas(name)').eq('id',session.user.id).maybeSingle();
  if(error||!p?.empresa_id){msg(error?.message||'Unable to load workspace profile.','error');return false}
  state.empresaId=p.empresa_id;
  const company=p.empresas?.name||'KORbuild';
  $('user-name').textContent=p.name?.trim()&&p.name!=='Owner'?p.name:session.user.user_metadata?.full_name||`${company} Owner`;
  $('user-email').textContent=session.user.email||'';
  const initial=$('user-name').textContent.trim().charAt(0).toUpperCase()||'O';
  $('user-avatar').textContent=initial;$('menu-avatar').textContent=initial;$('menu-full-name').textContent=$('user-name').textContent;$('menu-full-email').textContent=session.user.email||'';
  return true
}

async function load(){
  const {data,error}=await db.from('servicos_catalogo').select('id,nome,duracao_padrao_minutos,preco_padrao,ativo,criado_em').eq('empresa_id',state.empresaId).order('nome');
  if(error)throw error;
  state.items=data||[];
  render();
}

function render(){
  const q=($('search').value||'').trim().toLowerCase();
  const status=$('status-filter')?.value||'ALL';
  const rows=state.items.filter(x=>(!q||x.nome.toLowerCase().includes(q))&&(status==='ALL'||(status==='ACTIVE'?x.ativo:!x.ativo)));
  $('active-count').textContent=state.items.filter(x=>x.ativo).length;
  $('inactive-count').textContent=state.items.filter(x=>!x.ativo).length;
  $('total-count').textContent=state.items.length;
  $('services-body').innerHTML=rows.map(x=>{
    const editUrl=`service-form.html?id=${encodeURIComponent(x.id)}`;
    return `<tr><td><div class="team-name">${esc(x.nome)}</div></td><td>${x.duracao_padrao_minutos} min</td><td>${money(x.preco_padrao)}</td><td><span class="team-status ${x.ativo?'active':'inactive'}"><span class="dot"></span>${activeStatusLabel(x.ativo)}</span></td><td>${date(x.criado_em)}</td><td><div class="row-actions"><a class="small-btn" href="${editUrl}">Edit</a><button class="small-btn danger" data-action="toggle" data-id="${x.id}">${activeToggleLabel(x.ativo)}</button></div></td></tr>`;
  }).join('');
  $('empty-state').classList.toggle('hidden',rows.length>0);
}

async function toggleService(id){
  const x=state.items.find(i=>i.id===id);if(!x)return;
  const {error}=await db.from('servicos_catalogo').update({ativo:!x.ativo}).eq('id',id).eq('empresa_id',state.empresaId);
  if(error){msg(`We couldn't update this service. ${error.message}`,'error');return}
  await load();
  msg(`${x.nome} is now ${!x.ativo?'active':'inactive'}.`);
}

$('user-menu-btn')?.addEventListener('click',e=>{e.stopPropagation();const m=$('user-menu'),h=m.classList.toggle('hidden');$('user-menu-btn').setAttribute('aria-expanded',String(!h))});
document.addEventListener('click',e=>{if(!e.target.closest('.user-menu-wrap'))closeMenu()});
$('menu-logout')?.addEventListener('click',async()=>{await db.auth.signOut();location.href='index.html'});
$('add-service').addEventListener('click',()=>location.href='service-form.html');
$('search').addEventListener('input',render);
$('status-filter')?.addEventListener('change',render);
$('services-body').addEventListener('click',e=>{const b=e.target.closest('button[data-action="toggle"]');if(b)toggleService(b.dataset.id)});

(async()=>{if(await profile())try{await load()}catch(e){msg(`Unable to load Services. ${e.message}`,'error')}})();
