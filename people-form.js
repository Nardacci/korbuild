if(!window.KORBUILD_APP){const s=document.createElement('script');s.src='app-config.js?v=1.2';document.head.appendChild(s);}
const { url, publishableKey } = window.KORBUILD_SUPABASE;
const db = window.supabase.createClient(url, publishableKey, { auth: { persistSession: true, autoRefreshToken: true } });
const $=id=>document.getElementById(id); const state={empresaId:null,editingId:new URLSearchParams(location.search).get('id'),teams:[],currency:'BRL'};
function closeMenu(){$('user-menu')?.classList.add('hidden');$('user-menu-btn')?.setAttribute('aria-expanded','false');}
function showMessage(text,type='success'){const el=$('message');el.textContent=text;el.className=`message ${type}`;el.classList.remove('hidden');}
function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
const t=s=>window.KORbuildI18n?window.KORbuildI18n.t(s):s;
// The company's own configuracoes_folha.currency (set in Payroll
// Settings) -- Payment is a real payroll record, so it must always show a
// currency code, never a bare number, and never assume BRL.
const money=v=>new Intl.NumberFormat(state.currency==='BRL'?'pt-BR':'en-US',{style:'currency',currency:state.currency}).format(Number(v||0));
function fmtDate(v){return v?new Date(v+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—';}
function todayIso(){return new Date().toISOString().slice(0,10);}
// calcular_pagamento_semanal()/registrar_pagamento() only treat a rate as
// effective for a week when vigente_de <= that week's start date -- so
// defaulting this field to TODAY would frequently miss the week already in
// progress (any day today isn't the configured week-start day). Default to
// the current week's start instead, so a rate set today is picked up by
// Payment immediately. Sourced from configuracoes_operacionais.
// period_start_day -- the SAME setting Bonus's periods.js uses for its own
// weekly periods (Monday by default) -- not configuracoes_folha.dia_
// inicio_semana, a separate, independently-editable Payroll Settings field
// that used to (wrongly) drive this and could disagree with Bonus.
function currentWeekStart(startDay){
  const d=new Date();d.setHours(0,0,0,0);
  const delta=(d.getDay()-startDay+7)%7;
  d.setDate(d.getDate()-delta);
  return d.toISOString().slice(0,10);
}
async function loadProfile(){const{data:{session},error}=await db.auth.getSession();if(error||!session?.user){location.href='index.html';return false;}const{data:profile,error:profileError}=await db.from('usuarios').select('id,name,empresa_id,active,empresas(name)').eq('id',session.user.id).maybeSingle();if(profileError||!profile?.empresa_id){showMessage(profileError?.message||'Unable to load workspace profile.','error');return false;}state.empresaId=profile.empresa_id;const company=profile.empresas?.name||'KORbuild Demo';$('side-company').textContent=company;const profileName=profile.name?.trim();const name=profileName&&profileName!=='Owner'?profileName:session.user.user_metadata?.full_name||`${company} Owner`;const initial=name.trim().charAt(0).toUpperCase()||'O';$('user-name').textContent=name;$('user-email').textContent=session.user.email||'';$('user-avatar').textContent=initial;$('menu-avatar').textContent=initial;$('menu-full-name').textContent=name;$('menu-full-email').textContent=session.user.email||'';return true;}
async function loadTeams(){const{data,error}=await db.from('equipes').select('id,name,active').eq('empresa_id',state.empresaId).eq('active',true).order('name',{ascending:true});if(error){showMessage(`Unable to load teams. ${error.message}`,'error');return false;}state.teams=data||[];const select=$('person-team');select.innerHTML='<option value="">Select a team</option>'+state.teams.map(t=>`<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');if(!state.teams.length){select.disabled=true;$('save-person').disabled=true;showMessage('Create at least one active team before adding a person.','error');return false;}select.disabled=false;return true;}
async function loadPerson(){if(!state.editingId)return;const{data,error}=await db.from('colaboradores').select('id,name,specialty,active,equipe_id').eq('id',state.editingId).eq('empresa_id',state.empresaId).maybeSingle();if(error||!data){showMessage(error?.message||'Person not found.','error');return;}$('person-id').value=data.id;$('person-name').value=data.name||'';$('person-specialty').value=data.specialty||'';$('person-active').checked=data.active;$('person-team').value=data.equipe_id||'';$('form-eyebrow').textContent='EDIT PERSON';$('form-title').textContent='Edit person';$('page-title').textContent='Edit Person';$('save-person').textContent='Save Changes';}

// Only meaningful for an EXISTING person -- a brand-new one has no
// colaborador_id yet to attach an hourly-rate history to.
async function loadRateHistory(){
  if(!state.editingId)return;
  $('rate-card').classList.remove('hidden');
  const {data:config}=await db.rpc('obter_configuracoes_folha',{p_empresa_id:state.empresaId});
  const cfg=(config||[])[0];
  state.currency=cfg?.currency||'BRL';
  $('rate-currency-label').textContent=state.currency;

  const {data:opConfig}=await db.from('configuracoes_operacionais').select('period_start_day').eq('empresa_id',state.empresaId).order('created_at',{ascending:false}).limit(1).maybeSingle();
  $('rate-new-date').value=currentWeekStart(opConfig?.period_start_day??1);
  // Only now is it safe to save a new rate -- see saveRate()'s own comment
  // for why "Save new rate" starts disabled in the HTML.
  $('rate-save-btn').disabled=false;

  const {data,error}=await db.rpc('obter_historico_valor_hora',{p_colaborador_id:state.editingId});
  if(error){showMessage(`${t('Unable to load rate history.')} ${error.message}`,'error');return;}
  const history=data||[]; // already ordered vigente_de desc by the RPC
  const today=todayIso();
  const current=history.find(h=>h.vigente_de<=today&&(!h.vigente_ate||h.vigente_ate>=today));
  if(current){
    $('rate-current-value').textContent=money(current.valor_hora);
    $('rate-current-since').textContent=`${t('since')} ${fmtDate(current.vigente_de)}`;
  }else{
    $('rate-current-value').textContent=t('Not set');
    $('rate-current-since').textContent='';
  }
  $('rate-history-body').innerHTML=history.length?history.map(h=>`<tr><td>${fmtDate(h.vigente_de)}</td><td>${h.vigente_ate?fmtDate(h.vigente_ate):t('Ongoing')}</td><td>${money(h.valor_hora)}</td></tr>`).join(''):`<tr><td colspan="3" class="rate-history-empty">${t('No rate history yet.')}</td></tr>`;
}

// Root cause of a 2026-09-20 bug: this used to fall back to todayIso()
// whenever #rate-new-date was still blank, which happened for real
// whenever "Save new rate" got clicked before loadRateHistory()'s async
// chain (3 sequential/awaited network round trips) had populated that
// field with its intended default (the current week's start -- see
// currentWeekStart()'s own comment above for why that default matters).
// A rate silently registered with vigente_de=today instead of the week
// start can fail calcular_pagamento_semanal/registrar_pagamento's own
// "vigente_de <= week start" eligibility check for the week already in
// progress -- the person then just doesn't appear in that week's Payment
// list, with no error anywhere, since nothing was actually wrong from the
// RPCs' point of view. "Save new rate" now starts disabled in the HTML
// and is only enabled once #rate-new-date's real default is in place, so
// this fallback is now unreachable in practice; kept only so a bug here
// never lets vigenteDe end up blank outright.
async function saveRate(){
  const value=Number($('rate-new-value').value);
  const vigenteDe=$('rate-new-date').value||todayIso();
  if(!Number.isFinite(value)||value<0){showMessage(t('Enter a valid hourly rate.'),'error');return;}
  const btn=$('rate-save-btn');btn.disabled=true;const original=btn.textContent;btn.textContent=t('Saving...');
  const {error}=await db.rpc('registrar_valor_hora',{p_empresa_id:state.empresaId,p_colaborador_id:state.editingId,p_valor_hora:value,p_vigente_de:vigenteDe});
  btn.disabled=false;btn.textContent=original;
  if(error){showMessage(`${t('Unable to register the hourly rate.')} ${error.message}`,'error');return;}
  showMessage(t('Hourly rate registered.'));
  $('rate-new-value').value='';
  await loadRateHistory();
}
async function savePerson(event){event.preventDefault();const name=$('person-name').value.trim();const specialty=$('person-specialty').value.trim()||null;const equipeId=$('person-team').value;const active=$('person-active').checked;if(!name){showMessage('Name is required.','error');return;}if(!equipeId){showMessage('A Team is required before a person can be saved.','error');return;}const btn=$('save-person');btn.disabled=true;btn.textContent='Saving...';try{let error;if(state.editingId){({error}=await db.from('colaboradores').update({name,specialty,equipe_id:equipeId,active,updated_at:new Date().toISOString()}).eq('id',state.editingId).eq('empresa_id',state.empresaId));}else{({error}=await db.from('colaboradores').insert({empresa_id:state.empresaId,name,specialty,equipe_id:equipeId,active}));}if(error)throw error;showMessage(state.editingId?'Person updated successfully.':'Person added successfully.');setTimeout(()=>location.href='people.html',500);}catch(error){showMessage(`We couldn't save this person. ${error.message||'Please try again.'}`,'error');btn.disabled=false;btn.textContent=state.editingId?'Save Changes':'Save Person';}}
$('user-menu-btn')?.addEventListener('click',e=>{e.stopPropagation();const menu=$('user-menu');const hidden=menu.classList.toggle('hidden');$('user-menu-btn').setAttribute('aria-expanded',String(!hidden));});document.addEventListener('click',e=>{if(!e.target.closest('.user-menu-wrap'))closeMenu();});$('menu-logout')?.addEventListener('click',async()=>{await db.auth.signOut();location.href='index.html';});$('person-form').addEventListener('submit',savePerson);$('rate-save-btn')?.addEventListener('click',saveRate);
async function init(){if(!(await loadProfile()))return;if(!(await loadTeams()))return;await loadPerson();await loadRateHistory();}init();