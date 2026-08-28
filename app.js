if(!window.KORBUILD_APP){const s=document.createElement('script');s.src='app-config.js?v=1.2';document.head.appendChild(s);}
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

  window.location.href = 'home.html';
});
