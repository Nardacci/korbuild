import { test, expect } from '@playwright/test';
import { SUITE_USER, STORAGE_STATE_PATH } from '../config';

// Re-authenticates the suite user and overwrites tests/.auth/suite-user.json
// with a freshly-issued session. Run this whenever the saved storageState
// is old enough that its access/refresh token pair may have expired --
// symptom: mid-suite tests suddenly redirect to index.html (loadProfile()'s
// !session?.user branch) even though nothing in the app changed.
test('log back in and refresh the saved session', async ({ page }) => {
  await page.goto('index.html');
  await page.fill('#email', SUITE_USER.email);
  await page.fill('#password', SUITE_USER.password);
  await page.click('#login-form button[type="submit"]');
  await page.waitForURL(/home\.html/, { timeout: 20_000 });
  await page.context().storageState({ path: STORAGE_STATE_PATH });
  console.log('[refresh-session] session refreshed and saved to', STORAGE_STATE_PATH);
});
