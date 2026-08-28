if(!window.KORBUILD_APP){const s=document.createElement('script');s.src='app-config.js?v=1.2';document.head.appendChild(s);}
const { url, publishableKey } = window.KORBUILD_SUPABASE;
const db = window.supabase.createClient(url, publishableKey, { auth: { persistSession: true, autoRefreshToken: true } });
const $ = id => document.getElementById(id);
const state = { empresaId: null, people: [] };
function closeMenu(){ $('user-menu')?.classList.add('hidden'); $('user-menu-btn')?.setAttribute('aria-expanded','false'); }
function showMessage(text,type='success'){ const el=$('message'); el.textContent=text; el.className=`message ${type}`; el.classList.remove('hidden'); }
function clearMessage(){ $('message')?.classList.add('hidden'); }
function escapeHtml(value=''){ return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
function formatDate(value){ if(!value)return '—'; return new Date(value).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
function render(){
  const q=($('search').value||'').trim().toLowerCase(); const filter=$('status-filter').value;
  const filtered=state.people.filter(p=>{const matchesText=!q || p.name.toLowerCase().includes(q) || (p.specialty||'').toLowerCase().includes(q); const matchesStatus=filter==='ALL' || (filter==='ACTIVE'?p.active:!p.active); return matchesText&&matchesStatus;});
  $('active-count').textContent=state.people.filter(p=>p.active).length; $('inactive-count').textContent=state.people.filter(p=>!p.active).length; $('total-count').textContent=state.people.length;
  $('people-body').innerHTML=filtered.map(p=>`<tr><td><div class="person-name">${escapeHtml(p.name)}</div></td><td><div class="person-role">${escapeHtml(p.specialty||'—')}</div></td><td><span class="status-pill ${p.active?'active':'inactive'}"><span class="status-dot"></span>${p.active?'Active':'Inactive'}</span></td><td>${formatDate(p.created_at)}</td><td><div class="row-actions"><button class="small-btn" data-action="edit" data-id="${p.id}">Edit</button><button class="small-btn ${p.active?'danger':''}" data-action="toggle" data-id="${p.id}">${p.active?'Deactivate':'Activate'}</button></div></td></tr>`).join('');
  $('empty-state').classList.toggle('hidden',filtered.length!==0);
}
async function loadProfile(){
  const {data:{session},error}=await db.auth.getSession(); if(error||!session?.user){window.location.href='index.html';return false;}
  const {data:profile,error:profileError}=await db.from('usuarios').select('id,name,empresa_id,active,empresas(name)').eq('id',session.user.id).maybeSingle();
  if(profileError||!profile?.empresa_id){showMessage(profileError?.message||'Unable to load workspace profile.','error');return false;}
  state.empresaId=profile.empresa_id; $('side-company').textContent=profile.empresas?.name||'KORbuild Demo';
  const company=profile.empresas?.name||'KORbuild Demo'; const profileName=profile.name?.trim(); const name=profileName&&profileName!=='Owner'?profileName:session.user.user_metadata?.full_name||`${company} Owner`; const initial=name.trim().charAt(0).toUpperCase()||'O';
  $('user-name').textContent=name;$('user-email').textContent=session.user.email||'';$('user-avatar').textContent=initial;$('menu-avatar').textContent=initial;$('menu-full-name').textContent=name;$('menu-full-email').textContent=session.user.email||''; return true;
}
async function loadPeople(){ clearMessage(); const {data,error}=await db.from('colaboradores').select('id,empresa_id,name,specialty,active,created_at,updated_at').eq('empresa_id',state.empresaId).order('name',{ascending:true}); if(error){showMessage(`Unable to load people. ${error.message}`,'error');return;} state.people=data||[];render(); }
async function togglePerson(id){const person=state.people.find(p=>p.id===id);if(!person)return;const next=!person.active;const action=next?'activate':'deactivate';if(!confirm(`Are you sure you want to ${action} ${person.name}?`))return;clearMessage();const {error}=await db.from('colaboradores').update({active:next,updated_at:new Date().toISOString()}).eq('id',id).eq('empresa_id',state.empresaId);if(error){showMessage(`We couldn't update this person. ${error.message}`,'error');return;}await loadPeople();showMessage(`${person.name} is now ${next?'active':'inactive'}.`);}
$('user-menu-btn')?.addEventListener('click',e=>{e.stopPropagation();const menu=$('user-menu');const hidden=menu.classList.toggle('hidden');$('user-menu-btn').setAttribute('aria-expanded',String(!hidden));});
document.addEventListener('click',e=>{if(!e.target.closest('.user-menu-wrap'))closeMenu();});
$('menu-logout')?.addEventListener('click',async()=>{await db.auth.signOut();window.location.href='index.html';});
$('add-person').addEventListener('click',()=>window.location.href='people-form.html'); $('search').addEventListener('input',render); $('status-filter').addEventListener('change',render);
$('people-body').addEventListener('click',e=>{const btn=e.target.closest('button[data-action]');if(!btn)return; if(btn.dataset.action==='edit')window.location.href=`people-form.html?id=${encodeURIComponent(btn.dataset.id)}`; if(btn.dataset.action==='toggle')togglePerson(btn.dataset.id);});
async function init(){if(await loadProfile())await loadPeople();} init();