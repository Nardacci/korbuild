const { url, publishableKey } = window.KORBUILD_SUPABASE;
const db = window.supabase.createClient(url, publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const $ = (id) => document.getElementById(id);

function showAuthError(message) {
  $('side-company').textContent = 'KORbuild Demo';
  $('company-pill').textContent = 'KORbuild Demo';
  $('user-name').textContent = 'Owner';
  $('user-email').textContent = message || 'Session unavailable';
  $('employees').textContent = '—';
  $('teams').textContent = '—';
  $('pending').textContent = '—';
  $('period-value').textContent = '—';
  $('period-label').textContent = 'Sign in required';
}

async function loadHome() {
  const { data: { session }, error: sessionError } = await db.auth.getSession();

  if (sessionError || !session?.user) {
    showAuthError('Please sign in to continue.');
    return;
  }

  const user = session.user;

  // public.usuarios intentionally stores the application profile, not email.
  // auth.users is the source of truth for authentication/email.
  const { data: profile, error: profileError } = await db
    .from('usuarios')
    .select('id,name,empresa_id,active,empresas(name)')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile) {
    showAuthError('Profile setup required');
    return;
  }

  const company = profile.empresas?.name || 'KORbuild Demo';
  const name = profile.name || 'Owner';
  $('side-company').textContent = company;
  $('company-pill').textContent = company;
  $('user-name').textContent = name;
  $('user-email').textContent = user.email || '';
  document.querySelector('.avatar').textContent = name.charAt(0).toUpperCase();

  const [people, teams, period, evaluations] = await Promise.all([
    db.from('colaboradores').select('*', { count: 'exact', head: true }).eq('empresa_id', profile.empresa_id),
    db.from('equipes').select('*', { count: 'exact', head: true }).eq('empresa_id', profile.empresa_id),
    db.from('periodos').select('id,start_date,end_date,status').eq('empresa_id', profile.empresa_id).order('start_date', { ascending: false }).limit(1).maybeSingle(),
    db.from('lancamentos').select('*', { count: 'exact', head: true }).eq('empresa_id', profile.empresa_id).neq('status', 'COMPLETED')
  ]);

  $('employees').textContent = people.count ?? 0;
  $('teams').textContent = teams.count ?? 0;
  $('pending').textContent = evaluations.count ?? 0;

  if (period.data) {
    const start = new Date(period.data.start_date + 'T00:00:00');
    const end = new Date(period.data.end_date + 'T00:00:00');
    $('period-value').textContent = `${start.toLocaleDateString('en-US', {month:'short',day:'numeric'})} – ${end.toLocaleDateString('en-US', {month:'short',day:'numeric'})}`;
    $('period-label').textContent = period.data.status || 'Prepared';
  } else {
    $('period-value').textContent = '—';
    $('period-label').textContent = 'No period prepared';
  }
}

db.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') window.location.href = 'index.html';
});

$('logout').addEventListener('click', async () => {
  await db.auth.signOut();
  window.location.href = 'index.html';
});

$('prepare').addEventListener('click', () => {
  alert('Period preparation will be enabled in the next KORbuild V1 step.');
});

loadHome();
