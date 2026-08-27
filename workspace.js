const { url, publishableKey } = window.KORBUILD_SUPABASE;
const supabaseClient = window.supabase.createClient(url, publishableKey);

async function loadWorkspace() {
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser();

  if (authError || !user) {
    window.location.href = 'index.html';
    return;
  }

  const { data: profile, error: profileError } = await supabaseClient
    .from('usuarios')
    .select('id, name, empresa_id, empresas(name)')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    document.getElementById('welcome').textContent = 'User profile could not be loaded.';
    return;
  }

  document.getElementById('company').textContent = profile.empresas?.name || 'Company workspace';
  document.getElementById('welcome').textContent = `Welcome, ${profile.name || user.email}.`;

  const [{ count: employeeCount }, { count: teamCount }] = await Promise.all([
    supabaseClient.from('colaboradores').select('*', { count: 'exact', head: true }).eq('empresa_id', profile.empresa_id),
    supabaseClient.from('equipes').select('*', { count: 'exact', head: true }).eq('empresa_id', profile.empresa_id)
  ]);

  document.getElementById('employees').textContent = employeeCount ?? 0;
  document.getElementById('teams').textContent = teamCount ?? 0;
  document.getElementById('period').textContent = 'Ready';
}

document.getElementById('logout').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
});

loadWorkspace();
