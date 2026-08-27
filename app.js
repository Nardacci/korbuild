const SUPABASE_URL = '';
const SUPABASE_ANON_KEY = '';

const message = document.getElementById('login-message');
const form = document.getElementById('login-form');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = '';

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    message.textContent = 'Supabase DEV connection is not configured yet.';
    return;
  }

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const { error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    message.textContent = error.message;
    return;
  }

  window.location.href = 'dashboard.html';
});
