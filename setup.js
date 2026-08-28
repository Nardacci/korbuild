const { url, publishableKey } = window.KORBUILD_SUPABASE;
const db = window.supabase.createClient(url, publishableKey, { auth: { persistSession: true, autoRefreshToken: true } });

const state = { step: 2, maxPoints: 500, pointValue: 1.00, frequency: 'WEEKLY', startDay: '1', endDay: '6', preparation: 'MANUAL', preparationDay: '6', preparationTime: '08:00 AM' };
const $ = id => document.getElementById(id);
const views = [...document.querySelectorAll('.step-view')];
const labels = [...document.querySelectorAll('.progress-labels span')];

function render() {
  views.forEach(v => v.classList.toggle('hidden', Number(v.dataset.step) !== state.step));
  $('step-number').textContent = state.step;
  $('progress-bar').style.width = `${((state.step - 1) / 5) * 100}%`;
  labels.forEach((label, i) => { label.classList.toggle('done', i < state.step - 1); label.classList.toggle('active', i === state.step - 1); });
  $('back').disabled = state.step <= 2;
  $('next').style.display = state.step >= 6 ? 'none' : 'inline-block';
  updatePreparationUI();
}

function updatePreparationUI() {
  document.querySelectorAll('input[name="preparation"]').forEach(input => input.closest('.radio')?.classList.toggle('selected', input.checked));
  const automatic = document.querySelector('input[name="preparation"]:checked')?.value === 'AUTOMATIC';
  $('automatic-options')?.classList.toggle('hidden', !automatic);
}

function collect() {
  if (state.step === 2) { state.maxPoints = Number($('max-points').value); state.pointValue = Number($('point-value').value); }
  if (state.step === 3) {
    state.frequency = $('frequency').value;
    state.startDay = $('start-day').value;
    state.endDay = $('end-day').value;
    state.preparation = document.querySelector('input[name="preparation"]:checked')?.value || 'MANUAL';
    state.preparationDay = $('prep-day').value;
    state.preparationTime = $('prep-time').value;
  }
}

document.querySelectorAll('input[name="preparation"]').forEach(input => input.addEventListener('change', updatePreparationUI));
$('next').addEventListener('click', () => { collect(); if (state.step < 6) { state.step += 1; render(); } });
$('back').addEventListener('click', () => { if (state.step > 2) { state.step -= 1; render(); } });
$('exit-setup').addEventListener('click', () => window.location.href = 'dashboard.html');
$('save-exit').addEventListener('click', () => { collect(); window.location.href = 'dashboard.html'; });
$('finish').addEventListener('click', () => { alert('Final setup completion will be connected to Supabase after the wizard flow is approved.'); window.location.href = 'dashboard.html'; });
$('go-people')?.addEventListener('click', () => { state.step = 4; render(); });
$('go-teams')?.addEventListener('click', () => { state.step = 5; render(); });

async function loadWorkspace() {
  const { data: { session } } = await db.auth.getSession();
  if (!session?.user) { window.location.href = 'index.html'; return; }
  const { data: profile } = await db.from('usuarios').select('empresa_id,empresas(name)').eq('id', session.user.id).maybeSingle();
  if (profile?.empresas?.name) $('workspace-name').textContent = profile.empresas.name;
}

loadWorkspace();
render();
