const form = document.getElementById('signup-form');
const message = document.getElementById('signup-message');
const submitButton = document.getElementById('signup-submit');

function showMessage(text, type = 'error') {
  message.textContent = text;
  message.className = 'message' + (type === 'success' ? ' success' : '');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showMessage('');
  const fullName = document.getElementById('full-name').value.trim();
  const companyName = document.getElementById('company-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;
  const acceptedTerms = document.getElementById('accept-terms').checked;

  if (!fullName || !companyName || !email || !password) return showMessage('Please complete all required fields.');
  if (password.length < 8) return showMessage('Password must contain at least 8 characters.');
  if (password !== confirmPassword) return showMessage('Passwords do not match.');
  if (!acceptedTerms) return showMessage('You must accept the Terms of Service and Privacy Policy.');

  submitButton.disabled = true;
  submitButton.textContent = 'Creating account...';

  try {
    const result = await window.KORbuildAuth.signUp({ email, password, fullName, companyName });
    if (result.user && !result.session) {
      showMessage('Check your email to confirm your account. After confirmation, we will prepare your workspace.', 'success');
    } else {
      window.location.href = 'signup-complete.html';
    }
    form.reset();
  } catch (error) {
    showMessage(error.message || 'Unable to create your account. Please try again.');
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Create free account <span>→</span>';
  }
});