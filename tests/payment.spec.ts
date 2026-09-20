import { test, expect, Page } from '@playwright/test';
import { STORAGE_STATE_PATH, testbotName, assertTestbotName } from './config';

// Payment domain (internal Payroll): Payroll Settings (a singleton config
// form, same shape as Reminder Settings) and Payment (weekly-payments.html,
// redesigned 2026-09-20 -- see git history for the "before" version).
//
// The redesign moved hourly-rate management out of Payment and into the
// Person's own page (people-form.html), and made Payment auto-generate the
// current calendar week's row for every active, rate-having person on load
// -- no more manual "open the week" / "set rate inline" steps. This suite
// exercises the full new flow end to end: create a Person, confirm they do
// NOT appear in Payment yet (no rate registered), register their hourly
// rate from People, confirm they DO appear afterwards with an
// auto-generated row, then edit and register a real payment for them.
// Registering an internal payroll payment has no external side effect (no
// gateway call, unlike Mercado Pago Billing) -- safe to complete for real.

test.describe.configure({ mode: 'serial' });
test.use({ storageState: STORAGE_STATE_PATH });

const workUnitName = testbotName('Pay_WorkUnit');
const teamName = testbotName('Pay_Team');
const personName = testbotName('Pay_Person');
let personId = '';

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

test.describe('prerequisites: an active Work Unit, Team and Person', () => {
  test('create active Work Unit', async ({ page }) => {
    await page.goto('work-units-form.html');
    await page.fill('#unit-name', workUnitName);
    await page.click('#save-unit');
    await page.waitForURL(/work-units\.html/, { timeout: 10_000 });
    await expect(page.locator('#units-body')).toContainText(workUnitName, { timeout: 10_000 });
  });

  test('create active Team', async ({ page }) => {
    await page.goto('teams-form.html');
    await page.fill('#team-name', teamName);
    await page.selectOption('#team-work-unit', { label: workUnitName });
    await page.click('#save-team');
    await page.waitForURL(/teams\.html/, { timeout: 10_000 });
    await expect(page.locator('#teams-body')).toContainText(teamName, { timeout: 10_000 });
  });

  test('create active Person', async ({ page }) => {
    await page.goto('people-form.html');
    await page.fill('#person-name', personName);
    await page.selectOption('#person-team', { label: teamName });
    await page.click('#save-person');
    await page.waitForURL(/people\.html/, { timeout: 10_000 });
    await expect(page.locator('#people-body')).toContainText(personName, { timeout: 10_000 });

    // Capture the new person's id for the rest of the suite by following
    // the row's own Edit link, same as colaboradores.spec.ts's helper.
    const row = page.locator('#people-body tr', { hasText: personName });
    await expect(row).toHaveCount(1, { timeout: 10_000 });
    await row.locator('button[data-action="edit"]').click();
    await page.waitForURL(/people-form\.html\?id=/, { timeout: 10_000 });
    personId = new URL(page.url()).searchParams.get('id') || '';
    expect(personId).not.toBe('');
  });
});

test.describe('Payroll Settings: edit without breaking existing config', () => {
  let originalSettings: { day: string; hours: string; multiplier: string };

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

test.describe('Hourly rate lives on the Person page now', () => {
  test('a freshly created person has no rate, and the section explains that', async ({ page }) => {
    await page.goto(`people-form.html?id=${personId}`);
    await expect(page.locator('#rate-card')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#rate-current-value')).toHaveText('Not set', { timeout: 10_000 });
    await expect(page.locator('#rate-history-body')).toContainText('No rate history yet.');
  });

  test('this person does not appear in Payment yet (no rate registered)', async ({ page }) => {
    await page.goto('weekly-payments.html');
    await expect(page.locator('#payments-body')).not.toContainText(personName, { timeout: 15_000 });
  });

  test('register an hourly rate for the person', async ({ page }) => {
    await page.goto(`people-form.html?id=${personId}`);
    await page.fill('#rate-new-value', '18.00');
    await page.click('#rate-save-btn');
    await expect(page.locator('#message')).toContainText('Hourly rate registered', { timeout: 10_000 });
    await expect(page.locator('#rate-current-value')).toContainText('18', { timeout: 10_000 });
    await expect(page.locator('#rate-history-body tr')).toHaveCount(1);
  });
});

test.describe('Payment: this week is auto-generated once a rate exists', () => {
  test('the person now appears in the current week, auto-generated with hours=0', async ({ page }) => {
    await page.goto('weekly-payments.html');
    const row = page.locator('#payments-body tr', { hasText: personName });
    await expect(row).toHaveCount(1, { timeout: 15_000 });
    assertTestbotName((await row.locator('.team-name').textContent())?.trim());
    await expect(row.locator('.pay-rate-hint')).toContainText('18', { timeout: 10_000 });
    await expect(row.locator('.pay-horas')).toHaveValue('0');
    await expect(row.locator('button[data-action="save"]')).toHaveText('Update'); // auto-created rows already exist -> Update, never Register
  });

  test('edit hours and loan, and register the payment', async ({ page }) => {
    await page.goto('weekly-payments.html');
    const row = page.locator('#payments-body tr', { hasText: personName });
    await expect(row).toHaveCount(1, { timeout: 15_000 });

    await row.locator('.pay-horas').fill('10');
    await row.locator('.pay-adiantamento').fill('20');
    await expect(row.locator('.pay-liquido')).toContainText('R$', { timeout: 5_000 });
    // 10h * R$18/hr = R$180 gross, minus a R$20 loan = R$160 net.
    await expect(row.locator('.pay-liquido')).toContainText('160');

    await row.locator('button[data-action="save"]').click();
    await expect(page.locator('#message')).toContainText('Payment registered for', { timeout: 10_000 });

    await page.goto('weekly-payments.html');
    const refreshedRow = page.locator('#payments-body tr', { hasText: personName });
    await expect(refreshedRow.locator('.pay-horas')).toHaveValue('10', { timeout: 10_000 });
    await expect(refreshedRow.locator('.pay-adiantamento')).toHaveValue('20');
  });
});
