if(!window.KORBUILD_APP){const s=document.createElement('script');s.src='app-config.js?v=1.2';document.head.appendChild(s);}
const SUPABASE_URL = 'https://nowbohxeqwlddbfnukva.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_OTGYzEhQxckBa_8Xqu4Uog_Dm3RmTtD';

const message = document.getElementById('login-message');
const form = document.getElementById('login-form');

function setMessage(text) {
  if (message) message.textContent = text || '';
}

async function resolvePostLoginRoute(client, user) {
  const { data: profile, error } = await client
    .from('usuarios')
    .select('empresa_id, active')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.error('KORbuild onboarding check failed:', error);
    throw new Error('Unable to check your workspace status. Please try again.');
  }

  return profile?.empresa_id ? 'home.html' : 'setup.html';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('');

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  const { data, error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    setMessage(error.message);
    return;
  }

  try {
    const destination = await resolvePostLoginRoute(client, data.user);
    window.location.href = destination;
  } catch (routeError) {
    setMessage(routeError.message || 'Unable to continue. Please try again.');
  }
});