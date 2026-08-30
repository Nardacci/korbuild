const form = document.getElementById('signup-form');
const message = document.getElementById('signup-message');
const submitButton = document.getElementById('signup-submit');

function showMessage(text, type='error'){
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

  if (!fullName || !companyName || !email || !password) {
    showMessage('Please complete all required fields.');
    return;
  }
  if (password.length < 8) {
    showMessage('Password must contain at least 8 characters.');
    return;
  }
  if (password !== confirmPassword) {
    showMessage('Passwords do not match.');
    return;
  }
  if (!acceptedTerms) {
    showMessage('You must accept the Terms of Service and Privacy Policy.');
    return;
  }

  // Intentionally isolated from the product pages.
  // Supabase Auth + automatic company provisioning will be connected
  // only after the backend provisioning flow is implemented and tested.
  submitButton.disabled = true;
  submitButton.textContent = 'Preparing your account...';

  setTimeout(() => {
    showMessage('Signup flow UI is ready. Authentication and provisioning will be connected next.', 'success');
    submitButton.disabled = false;
    submitButton.innerHTML = 'Create free account <span>→</span>';
  }, 350);
});
