import { test, expect } from '@playwright/test';
import { SUITE_USER, STORAGE_STATE_PATH } from '../config';

// One-time provisioning step 2 of 2: log in with the suite user created by
// 01-signup.spec.ts (email already confirmed via a manual SQL step run
// separately -- see tests/README.md), drive the setup-v2.js 5-step wizard
// to completion, and save the authenticated session so every domain test
// file can reuse it via `test.use({ storageState: STORAGE_STATE_PATH })`
// instead of logging in again.
test('provision suite user: log in and complete onboarding', async ({ page }) => {
  page.on('dialog', async (dialog) => {
    console.log('[onboarding] unexpected alert:', dialog.message());
    await dialog.dismiss();
  });

  await page.goto('index.html');
  await page.fill('#email', SUITE_USER.email);
  await page.fill('#password', SUITE_USER.password);
  await page.click('#login-form button[type="submit"]');

  // Fresh user with no empresa_id -> app.js routes to setup.html.
  await page.waitForURL(/setup\.html/, { timeout: 20_000 });

  // Step 1: workspace identity.
  await expect(page.locator('#company-name')).toHaveValue(SUITE_USER.companyName, { timeout: 10_000 });
  await page.fill('#owner-name', SUITE_USER.fullName);
  await page.click('#next');

  // Step 2: evaluation points -- accept the pre-filled defaults.
  await expect(page.locator('#max-points')).toBeVisible({ timeout: 10_000 });
  await page.click('#next');

  // Step 3: bonus cycle -- accept the pre-filled defaults.
  await expect(page.locator('#cycle-name')).toBeVisible({ timeout: 10_000 });
  await page.click('#next');

  // Step 4: evaluation period -- accept the pre-filled defaults (manual
  // preparation, no admin dependency).
  await expect(page.locator('#frequency')).toBeVisible({ timeout: 10_000 });
  await page.click('#next');

  // Step 5: review and confirm.
  await expect(page.locator('#confirm')).toBeVisible({ timeout: 10_000 });
  await page.click('#confirm');

  await page.waitForURL(/home\.html/, { timeout: 20_000 });

  await page.context().storageState({ path: STORAGE_STATE_PATH });
  console.log('[onboarding] session saved to', STORAGE_STATE_PATH);
});
