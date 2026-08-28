const { url, publishableKey } = window.KORBUILD_SUPABASE;
const db = window.supabase.createClient(url, publishableKey, { auth: { persistSession: true, autoRefreshToken: true } });
const $ = id => document.getElementById(id);
const state = { empresaId: null, people: [], editingId: null };
function closeMenu(){ $('user-menu')?.classList.add('hidden'); $('user-menu-btn')?.setAttribute('aria-expanded','false'); }
function showMessage(text,type='success'){ const el=$('message'); el.textContent=text; el.className=`message ${type}`; }
function clearMessage(){ $('message')?.classList.add('hidden'); }
function escapeHtml(value=''){ return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
function formatDate(value){ if(!value)return '—'; return new Date(value).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
function render(){
  const q=($('search').value||'').trim().toLowerCase(); const filter=$('status-filter').value;
  const filtered=state.people.filter(p=>{const matchesText=!q || p.name.toLowerCase().includes(q) || (p.role||'').toLowerCase().includes(q); const matchesStatus=filter==='ALL' || (filter==='ACTIVE'?p.active:!p.active); return matchesText&&matchesStatus;});
  $('active-count').textContent=state.people.filter(p=>p.active).length; $('inactive-count').textContent=state.people.filter(p=>!p.active).length; $('total-count').textContent=state.people.length;
  $('people-body').innerHTML=filtered.map(p=>`<tr><td><div class="person-name">${escapeHtml(p.name)}</div></td><td><div class="person-role">${escapeHtml(p.role||'—')}</div></td><td><span class="status-pill ${p.active?'active':'inactive'}"><span class="status-dot"></span>${p.active?'Active':'Inactive'}</span></td><td>${formatDate(p.created_at)}</td><td><div class="row-actions"><button class="small-btn" data-action="edit" data-id="${p.id}">Edit</button><button class="small-btn ${p.active?'danger':''}" data-action="toggle" data-id="${p.id}">${p.active?'Deactivate':'Activate'}</button></div></td></tr>`).join('');
  $('empty-state').classList.toggle('hidden',filtered.length!==0);
}
async function loadProfile(){
  const {data:{session},error}=await db.auth.getSession(); if(error||!session?.user){window.location.href='index.html';return false;}
  const {data:profile,error:profileError}=await db.from('usuarios').select('id,name,empresa_id,active,empresas(name)').eq('id',session.user.id).maybeSingle();
  if(profileError||!profile?.empresa_id){showMessage(profileError?.message||'Unable to load workspace profile.','error');return false;}
  state.empresaId=profile.empresa_id; $('side-company').textContent=profile.empresas?.name||'KORbuild Demo';
  const name=profile.name||session.user.user_metadata?.full_name||session.user.email?.split('@')[0]||'Owner'; const initial=name.trim().charAt(0).toUpperCase()||'O';
  $('user-name').textContent=name;$('user-email').textContent=session.user.email||'';$('user-avatar').textContent=initial;$('menu-avatar').textContent=initial;$('menu-full-name').textContent=name;$('menu-full-email').textContent=session.user.email||''; return true;
}
async function loadPeople(){ clearMessage(); const {data,error}=await db.from('colaboradores').select('id,empresa_id,name,role,active,created_at,updated_at').eq('empresa_id',state.empresaId).order('name',{ascending:true}); if(error){showMessage(`Unable to load people. ${error.message}`,'error');return;} state.people=data||[];render(); }
function openModal(person=null){state.editingId=person?.id||null;$('person-id').value=person?.id||'';$('person-name').value=person?.name||'';$('person-role').value=person?.role||'';$('person-active').checked=person?.active??true;$('modal-eyebrow').textContent=person?'EDIT PERSON':'NEW PERSON';$('modal-title').textContent=person?'Edit person':'Add person';$('save-person').textContent=person?'Save Changes':'Save Person';$('person-modal').classList.remove('hidden');setTimeout(()=>$('person-name').focus(),50);}
function closeModal(){ $('person-modal').classList.add('hidden'); state.editingId=null; }
async function savePerson(event){
  event.preventDefault(); const name=$('person-name').value.trim(); const role=$('person-role').value.trim()||null; const active=$('person-active').checked; if(!name){showMessage('Name is required.','error');return;}
  const editing=Boolean(state.editingId); const editingId=state.editingId; const btn=$('save-person'); btn.disabled=true; btn.textContent='Saving...'; clearMessage();
  try{let error;if(editing){({error}=await db.from('colaboradores').update({name,role,active,updated_at:new Date().toISOString()}).eq('id',editingId).eq('empresa_id',state.empresaId));}else{({error}=await db.from('colaboradores').insert({empresa_id:state.empresaId,name,role,active}));}if(error)throw error;closeModal();await loadPeople();showMessage(editing?'Person updated successfully.':'Person added successfully.');}
  catch(error){showMessage(`We couldn't save this person. ${error.message||'Please try again.'}`,'error');}
  finally{btn.disabled=false;btn.textContent=editing?'Save Changes':'Save Person';}
}
async function togglePerson(id){const person=state.people.find(p=>p.id===id);if(!person)return;const next=!person.active;const action=next?'activate':'deactivate';if(!confirm(`Are you sure you want to ${action} ${person.name}?`))return;clearMessage();const {error}=await db.from('colaboradores').update({active:next,updated_at:new Date().toISOString()}).eq('id',id).eq('empresa_id',state.empresaId);if(error){showMessage(`We couldn't update this person. ${error.message}`,'error');return;}await loadPeople();showMessage(`${person.name} is now ${next?'active':'inactive'}.`);}
$('user-menu-btn')?.addEventListener('click',e=>{e.stopPropagation();const menu=$('user-menu');const hidden=menu.classList.toggle('hidden');$('user-menu-btn').setAttribute('aria-expanded',String(!hidden));});
document.addEventListener('click',e=>{if(!e.target.closest('.user-menu-wrap'))closeMenu();});
$('menu-logout')?.addEventListener('click',async()=>{await db.auth.signOut();window.location.href='index.html';});
$('add-person').addEventListener('click',()=>openModal()); $('close-modal').addEventListener('click',closeModal); $('cancel-modal').addEventListener('click',closeModal); $('person-modal').addEventListener('click',e=>{if(e.target.id==='person-modal')closeModal();}); $('person-form').addEventListener('submit',savePerson); $('search').addEventListener('input',render); $('status-filter').addEventListener('change',render);
$('people-body').addEventListener('click',e=>{const btn=e.target.closest('button[data-action]');if(!btn)return;const person=state.people.find(p=>p.id===btn.dataset.id);if(btn.dataset.action==='edit')openModal(person);if(btn.dataset.action==='toggle')togglePerson(btn.dataset.id);});
async function init(){if(await loadProfile())await loadPeople();} init();