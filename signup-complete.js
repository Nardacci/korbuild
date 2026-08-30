const loadingState = document.getElementById('state-loading');
const successState = document.getElementById('state-success');
const errorState = document.getElementById('state-error');
const errorText = document.getElementById('complete-error');

async function runProvisioning() {
  loadingState.hidden = false;
  successState.hidden = true;
  errorState.hidden = true;

  try {
    const result = await window.KORbuildProvisioning.provisionTenant();
    if (!result || !['provisioned', 'already_provisioned'].includes(result.status)) {
      throw new Error('Unexpected provisioning response.');
    }
    loadingState.hidden = true;
    successState.hidden = false;
  } catch (error) {
    loadingState.hidden = true;
    errorText.textContent = error.message || 'Please try again. If the problem persists, contact support.';
    errorState.hidden = false;
  }
}

document.getElementById('retry-provisioning').addEventListener('click', runProvisioning);
document.getElementById('enter-app').addEventListener('click', () => {
  window.location.href = 'dashboard.html';
});

runProvisioning();