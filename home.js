const { url, publishableKey } = window.KORBUILD_SUPABASE;
const db = window.supabase.createClient(url, publishableKey);

async function loadHome() {
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) { window.location.href = 'index.html'; return; }

  const { data: profile, error } = await db.from('usuarios').select('id,name,email,empresa_id,empresas(name)').eq('id', user.id).single();
  if (error || !profile) { window.location.href = 'index.html'; return; }

  const company = profile.empresas?.name || 'Workspace';
  const name = profile.name || 'Owner';
  document.getElementById('side-company').textContent = company;
  document.getElementById('company-pill').textContent = company;
  document.getElementById('user-name').textContent = name;
  document.getElementById('user-email').textContent = profile.email || user.email || '';
  document.querySelector('.avatar').textContent = name.charAt(0).toUpperCase();

  const [people, teams, period, evaluations] = await Promise.all([
    db.from('colaboradores').select('*', { count:'exact', head:true }).eq('empresa_id', profile.empresa_id),
    db.from('equipes').select('*', { count:'exact', head:true }).eq('empresa_id', profile.empresa_id),
    db.from('periodos').select('id,start_date,end_date,status').eq('empresa_id', profile.empresa_id).order('start_date',{ascending:false}).limit(1).maybeSingle(),
    db.from('lancamentos').select('*', { count:'exact', head:true }).eq('empresa_id', profile.empresa_id).neq('status','COMPLETED')
  ]);

  document.getElementById('employees').textContent = people.count ?? 0;
  document.getElementById('teams').textContent = teams.count ?? 0;
  document.getElementById('pending').textContent = evaluations.count ?? 0;

  if (period.data) {
    const start = new Date(period.data.start_date + 'T00:00:00');
    const end = new Date(period.data.end_date + 'T00:00:00');
    document.getElementById('period-value').textContent = `${start.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${end.toLocaleDateString('en-US',{month:'short',day:'numeric'})}`;
    document.getElementById('period-label').textContent = period.data.status || 'Prepared';
  } else {
    document.getElementById('period-value').textContent = '—';
    document.getElementById('period-label').textContent = 'No period prepared';
  }
}

document.getElementById('logout').addEventListener('click', async () => { await db.auth.signOut(); window.location.href='index.html'; });
document.getElementById('prepare').addEventListener('click', () => { alert('Period preparation will be enabled in the next KORbuild V1 step.'); });
loadHome();
