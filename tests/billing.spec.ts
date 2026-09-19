import { test, expect } from '@playwright/test';
import { STORAGE_STATE_PATH } from './config';

// Billing domain (Mercado Pago). This is the most delicate domain in the
// suite and is DELIBERATELY only partially automated:
//
// Claude Code's own browser-automation safety rules absolutely prohibit
// entering login credentials or financial/card data into any field, even
// well-known Mercado Pago sandbox/test-buyer credentials. That rule holds
// regardless of authorization, so this suite stops at the point where
// KORbuild redirects to Mercado Pago's own checkout page -- it never logs
// in, never enters a test card, and never completes a payment.
//
// What IS verified here is everything on KORbuild's own side of that
// boundary: clicking the subscribe button calls the real
// mercadopago-checkout Edge Function, which must create a real Mercado
// Pago Preference and return a valid init_point, and the browser must
// actually be redirected there. That's the full extent of what this
// domain's automated coverage can safely reach; completing the purchase
// (logging into Mercado Pago's sandbox and paying with a test card) is
// left for the user to do manually if they want to verify the rest of the
// loop (webhook/reconciliation, subscription activation).
//
// Uses the suite's own TESTBOT test user (TRIALING / setup_status PENDING
// at the time this was written) -- never "testando", which already has an
// active paid subscription and must not be touched here. Only the
// setup-fee flow is exercised; the monthly Preapproval flow is
// intentionally not triggered, to avoid creating an unnecessary test
// subscription.

test.use({ storageState: STORAGE_STATE_PATH });

test('setup-fee checkout redirects to a real Mercado Pago checkout page', async ({ page }) => {
  await page.goto('billing.html');
  const subscribeBtn = page.locator('#subscribe-btn');
  await expect(subscribeBtn).toBeEnabled({ timeout: 15_000 });
  await expect(subscribeBtn).toContainText('setup', { timeout: 5_000 });

  await subscribeBtn.click();
  // KORbuild's own code does a full-page redirect via
  // window.location.href = body.init_point once mercadopago-checkout
  // returns successfully -- waiting for navigation off the KORbuild
  // origin is the signal that the Preference was created for real.
  await page.waitForURL(/mercadopago\.com/, { timeout: 20_000 });
  expect(page.url()).toMatch(/mercadopago\.com/);
  console.log('[billing] redirected to Mercado Pago checkout:', page.url());
  // Stop here by design -- do not log in or enter payment details.
});
