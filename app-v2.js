const { url: SUPABASE_URL, publishableKey: SUPABASE_ANON_KEY } = window.KORBUILD_SUPABASE;
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const message = document.getElementById('login-message');
const form = document.getElementById('login-form');
const submitButton = form.querySelector('button[type="submit"]');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = '';
  submitButton.disabled = true;
  submitButton.textContent = 'Signing in...';

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    message.textContent = error.message;
    submitButton.disabled = false;
    submitButton.textContent = 'Sign in';
    return;
  }

  window.location.href = 'dashboard.html';
});
