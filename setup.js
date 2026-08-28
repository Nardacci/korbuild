const { url, publishableKey } = window.KORBUILD_SUPABASE;
const db = window.supabase.createClient(url, publishableKey, { auth: { persistSession: true, autoRefreshToken: true } });
const state = { step: 2, maxPoints: 500, pointValue: 1.00, cycleStart: 'January', cycleEnd: 'December', frequency: 'WEEKLY', startDay: '1', endDay: '6', preparation: 'MANUAL', preparationDay: '6', preparationTime: '08:00' };
const $ = id => document.getElementById(id);
const views = [...document.querySelectorAll('.step-view')];
const labels = [...document.querySelectorAll('.progress-labels span')];
const dayName = v => ({0:'Sunday',1:'Monday',2:'Tuesday',3:'Wednesday',4:'Thursday',5:'Friday',6:'Saturday'}[v]);
const freqName = v => ({WEEKLY:'Weekly',BIWEEKLY:'Every 2 weeks',MONTHLY:'Monthly'}[v] || v);
function collect() {
  if (state.step === 2) { state.maxPoints = Number($('max-points').value); state.pointValue = Number($('point-value').value); }
  if (state.step === 3) { state.cycleStart = $('cycle-start').value; state.cycleEnd = $('cycle-end').value; }
  if (state.step === 4) { state.frequency = $('frequency').value; state.startDay = $('start-day').value; state.endDay = $('end-day').value; state.preparation = document.querySelector('input[name="preparation"]:checked')?.value || 'MANUAL'; state.preparationDay = $('prep-day').value; state.preparationTime = $('prep-time').value; }
}
function updatePreparationUI() {
  const automatic = document.querySelector('input[name="preparation"]:checked')?.value === 'AUTOMATIC';
  $('automatic-options')?.classList.toggle('hidden', !automatic);
}
function updateSummary() {
  $('summary-evaluation').textContent = `${state.maxPoints} points · $${state.pointValue.toFixed(2)} / point`;
  $('summary-cycle').textContent = `${state.cycleStart} → ${state.cycleEnd}`;
  $('summary-period').textContent = `${freqName(state.frequency)} · ${dayName(state.startDay)} → ${dayName(state.endDay)}`;
  $('summary-prep').textContent = state.preparation === 'AUTOMATIC' ? `Automatic · ${dayName(state.preparationDay)} at ${state.preparationTime}` : 'Manual preparation';
}
function render() {
  views.forEach(v => v.classList.toggle('hidden', Number(v.dataset.step) !== state.step));
  $('step-number').textContent = state.step;
  $('progress-bar').style.width = `${((state.step - 1) / 6) * 100}%`;
  labels.forEach((label, i) => { label.classList.toggle('done', i < state.step - 1); label.classList.toggle('active', i === state.step - 1); });
  $('back').disabled = state.step <= 2;
  $('next').classList.toggle('hidden', state.step >= 7);
  $('confirm').classList.toggle('hidden', state.step !== 7);
  updatePreparationUI();
  if (state.step === 7) updateSummary();
}
document.querySelectorAll('input[name="preparation"]').forEach(input => input.addEventListener('change', updatePreparationUI));
$('next').addEventListener('click', () => { collect(); if (state.step < 7) { state.step += 1; render(); } });
$('back').addEventListener('click', () => { collect(); if (state.step > 2) { state.step -= 1; render(); } });
document.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', () => { collect(); state.step = Number(btn.dataset.edit); render(); }));
$('exit-setup').addEventListener('click', () => window.location.href = 'dashboard.html');
$('save-exit').addEventListener('click', () => { collect(); window.location.href = 'dashboard.html'; });
$('confirm').addEventListener('click', () => { collect(); alert('Configuration confirmation will be connected to Supabase after the wizard flow is approved.'); window.location.href = 'dashboard.html'; });
async function loadWorkspace() { const { data: { session } } = await db.auth.getSession(); if (!session?.user) { window.location.href = 'index.html'; return; } const { data: profile } = await db.from('usuarios').select('empresa_id,empresas(name)').eq('id', session.user.id).maybeSingle(); if (profile?.empresas?.name) $('workspace-name').textContent = profile.empresas.name; }
loadWorkspace(); render();
