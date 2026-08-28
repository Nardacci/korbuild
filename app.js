const SUPABASE_URL = 'https://nowbohxeqwlddbfnukva.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_OTGYzEhQxckBa_8Xqu4Uog_Dm3RmTtD';

const message = document.getElementById('login-message');
const form = document.getElementById('login-form');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = '';

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  const { error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    message.textContent = error.message;
    return;
  }

  // Home is the single canonical dashboard route.
  window.location.href = 'home.html';
});
