import { test, expect, Page } from '@playwright/test';
import { STORAGE_STATE_PATH, assertTestbotName } from './config';

// payroll-settings.html's #horas-padrao-semana has a static HTML default
// of "44", which happens to equal the real saved value throughout this
// suite -- so waiting for that value to appear is not a reliable signal
// that loadSettings() actually finished populating the form from the DB.
// Wait for its RPC response directly instead.
async function gotoPayrollSettings(page: Page): Promise<void> {
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('rpc/obter_configuracoes_folha') && r.ok(), { timeout: 15_000 }),
    page.goto('payroll-settings.html'),
  ]);
}

// Payment domain (internal Payroll): Payroll Settings (a singleton config
// form, same shape as Reminder Settings) and Weekly Payments (a
// per-person, per-week calculation preview + payment register).
//
// Payroll Settings must be edited without breaking the existing config,
// per the task: read the current values first, change them, verify the
// change persisted, then restore the original values and verify that too.
//
// Weekly Payments: this suite only sets an hourly rate for a TESTBOT
// person (needed to see an actual calculation, since a person with no
// rate just shows "No hourly rate registered") and views the resulting
// preview. It deliberately does NOT click "Register" -- that would create
// a real payroll payment record, which is a step further than "view the
// calculation preview" asked for.

test.describe.configure({ mode: 'serial' });
test.use({ storageState: STORAGE_STATE_PATH });

let originalSettings: { day: string; hours: string; multiplier: string };

test.describe('Payroll Settings: edit without breaking existing config', () => {
  test('read current settings', async ({ page }) => {
    await gotoPayrollSettings(page);
    originalSettings = {
      day: await page.locator('#dia-inicio-semana').inputValue(),
      hours: await page.locator('#horas-padrao-semana').inputValue(),
      multiplier: await page.locator('#multiplicador-hora-extra').inputValue(),
    };
    console.log('[payroll-settings] original:', originalSettings);
    expect(originalSettings.day).not.toBe('');
  });

  test('change settings and verify it persisted', async ({ page }) => {
    await gotoPayrollSettings(page);
    // Pick a value that's guaranteed different from whatever is currently set.
    const newDay = originalSettings.day === '1' ? '2' : '1';
    await page.selectOption('#dia-inicio-semana', newDay);
    await page.fill('#horas-padrao-semana', '40');
    await page.fill('#multiplicador-hora-extra', '2');
    await page.click('#save-btn');
    await expect(page.locator('#message')).toContainText('Payroll settings updated successfully', { timeout: 10_000 });

    await gotoPayrollSettings(page);
    await expect(page.locator('#dia-inicio-semana')).toHaveValue(newDay, { timeout: 10_000 });
    await expect(page.locator('#horas-padrao-semana')).toHaveValue('40');
    await expect(page.locator('#multiplicador-hora-extra')).toHaveValue('2');
  });

  test('restore the original settings', async ({ page }) => {
    await gotoPayrollSettings(page);
    await page.selectOption('#dia-inicio-semana', originalSettings.day);
    await page.fill('#horas-padrao-semana', originalSettings.hours);
    await page.fill('#multiplicador-hora-extra', originalSettings.multiplier);
    await page.click('#save-btn');
    await expect(page.locator('#message')).toContainText('Payroll settings updated successfully', { timeout: 10_000 });

    await gotoPayrollSettings(page);
    await expect(page.locator('#dia-inicio-semana')).toHaveValue(originalSettings.day, { timeout: 10_000 });
    await expect(page.locator('#horas-padrao-semana')).toHaveValue(originalSettings.hours);
    await expect(page.locator('#multiplicador-hora-extra')).toHaveValue(originalSettings.multiplier);
  });
});

test.describe('Weekly Payments: calculation preview for a TESTBOT collaborator', () => {
  test('set an hourly rate and view the calculated preview', async ({ page }) => {
    await page.goto('weekly-payments.html');
    const row = page.locator('#payments-body tr', { hasText: 'TESTBOT_' }).first();
    await expect(row).toHaveCount(1, { timeout: 15_000 });
    const name = (await row.locator('.team-name').textContent())?.trim() || '';
    assertTestbotName(name);
    console.log('[weekly-payments] using collaborator:', name);

    const rateMissing = await row.locator('.pay-new-rate').count();
    if (rateMissing > 0) {
      await row.locator('.pay-new-rate').fill('20');
      await row.locator('button[data-action="set-rate"]').click();
      await expect(page.locator('#message')).toContainText('Hourly rate registered', { timeout: 10_000 });
    } else {
      console.log('[weekly-payments] collaborator already had a rate registered.');
    }

    const refreshedRow = page.locator('#payments-body tr').filter({ has: page.locator('.team-name', { hasText: name }) }).first();
    await expect(refreshedRow.locator('.pay-new-rate')).toHaveCount(0, { timeout: 10_000 });
    const hours = await refreshedRow.locator('.pay-horas').inputValue();
    const grossText = await refreshedRow.locator('.pay-bruto').textContent();
    console.log('[weekly-payments] preview -- hours:', hours, 'gross:', grossText);
    // A calculation preview genuinely rendered -- confirmed by a non-zero
    // gross amount -- without ever clicking Register/Update ourselves.
    // The button may already read "Update" instead of "Register" if this
    // collaborator's current week was pre-populated by the historical
    // backfill (a pendente pagamentos_semanais row already exists for it);
    // either label is fine here, we just never click it.
    await expect(refreshedRow.locator('button[data-action="save"]')).toHaveText(/^(Register|Update)$/);
    expect(Number(grossText?.replace(/[^0-9.]/g, ''))).toBeGreaterThan(0);
  });
});
