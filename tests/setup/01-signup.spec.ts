import { test, expect } from '@playwright/test';
import { SUITE_USER } from '../config';

// One-time provisioning step 1 of 2: create the auth.users row for the
// dedicated suite account via the real signup UI (signup.html), exactly as
// a real user would. Step 2 (email confirmation via SQL, since this
// account can't receive real email, then completing the onboarding
// wizard) is in 02-onboarding.spec.ts -- confirmation has to happen
// out-of-band between the two, see tests/README.md.
//
// Idempotent: if the account already exists (re-running this after it was
// already created), signup.html's own error message ("User already
// registered" or similar) is treated as success, not a failure -- this
// script is meant to be safe to run more than once.
test('provision suite user: sign up via the real form', async ({ page }) => {
  // No leading slash: baseURL is https://nardacci.github.io/korbuild/, and a
  // leading-slash path would resolve against the origin instead (404s,
  // since the site is a project page under /korbuild/, not the user page).
  await page.goto('signup.html');

  await page.fill('#full-name', SUITE_USER.fullName);
  await page.fill('#company-name', SUITE_USER.companyName);
  await page.fill('#signup-email', SUITE_USER.email);
  await page.fill('#signup-password', SUITE_USER.password);
  await page.fill('#confirm-password', SUITE_USER.password);
  await page.check('#accept-terms');
  await page.click('#signup-submit');

  // signup.js navigates away on success (check-email.html when email
  // confirmation is required -- the normal case here -- or straight to
  // signup-complete.html if a session came back immediately). On failure
  // it stays on signup.html and writes an error into #signup-message.
  // Note: it also briefly shows "Creating your account..." (as a transient
  // success-styled message) before either outcome -- that text must be
  // ignored, not treated as the final state.
  const message = page.locator('#signup-message');
  await Promise.race([
    page.waitForURL(/check-email\.html|signup-complete\.html/, { timeout: 20_000 }),
    page.waitForFunction(
      () => {
        const el = document.getElementById('signup-message');
        const text = el?.textContent?.trim() || '';
        return text !== '' && text !== 'Creating your account...';
      },
      { timeout: 20_000 },
    ),
  ]).catch(() => {});

  if (/check-email\.html|signup-complete\.html/.test(page.url())) {
    console.log('[signup] navigated to', page.url(), '-- account created.');
    return;
  }

  const text = (await message.textContent())?.trim() || '';
  console.log('[signup] message:', text);
  const alreadyRegistered = /already registered|already exists|already in use/i.test(text);
  expect(alreadyRegistered, `Unexpected signup failure: "${text}"`).toBeTruthy();
});
