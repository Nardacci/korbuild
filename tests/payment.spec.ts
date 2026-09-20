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
  let originalSettings: { day: string; hours: string; multiplier: string; currency: string };

  test('read current settings', async ({ page }) => {
    await gotoPayrollSettings(page);
    originalSettings = {
      day: await page.locator('#dia-inicio-semana').inputValue(),
      hours: await page.locator('#horas-padrao-semana').inputValue(),
      multiplier: await page.locator('#multiplicador-hora-extra').inputValue(),
      currency: await page.locator('#currency').inputValue(),
    };
    console.log('[payroll-settings] original:', originalSettings);
    expect(originalSettings.day).not.toBe('');
  });

  test('change settings (including currency) and verify it persisted', async ({ page }) => {
    await gotoPayrollSettings(page);
    const newDay = originalSettings.day === '1' ? '2' : '1';
    const newCurrency = originalSettings.currency === 'USD' ? 'EUR' : 'USD';
    await page.selectOption('#dia-inicio-semana', newDay);
    await page.fill('#horas-padrao-semana', '40');
    await page.fill('#multiplicador-hora-extra', '2');
    await page.selectOption('#currency', newCurrency);
    await page.click('#save-btn');
    await expect(page.locator('#message')).toContainText('Payroll settings updated successfully', { timeout: 10_000 });

    await gotoPayrollSettings(page);
    await expect(page.locator('#dia-inicio-semana')).toHaveValue(newDay, { timeout: 10_000 });
    await expect(page.locator('#horas-padrao-semana')).toHaveValue('40');
    await expect(page.locator('#multiplicador-hora-extra')).toHaveValue('2');
    await expect(page.locator('#currency')).toHaveValue(newCurrency);
  });

  test('restore the original settings', async ({ page }) => {
    await gotoPayrollSettings(page);
    await page.selectOption('#dia-inicio-semana', originalSettings.day);
    await page.fill('#horas-padrao-semana', originalSettings.hours);
    await page.fill('#multiplicador-hora-extra', originalSettings.multiplier);
    await page.selectOption('#currency', originalSettings.currency);
    await page.click('#save-btn');
    await expect(page.locator('#message')).toContainText('Payroll settings updated successfully', { timeout: 10_000 });

    await gotoPayrollSettings(page);
    await expect(page.locator('#dia-inicio-semana')).toHaveValue(originalSettings.day, { timeout: 10_000 });
    await expect(page.locator('#horas-padrao-semana')).toHaveValue(originalSettings.hours);
    await expect(page.locator('#multiplicador-hora-extra')).toHaveValue(originalSettings.multiplier);
    await expect(page.locator('#currency')).toHaveValue(originalSettings.currency);
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

// Loans (loans.html): a NEW person is used here rather than reusing
// personName above -- that person's current-week Payment row already
// exists (registered in the describe block just above), and the
// auto-prefill-from-loans logic only runs the first time a week's row is
// created. Using a fresh person guarantees their first-ever weekly-
// payments.html visit is the one that auto-generates the row, so the
// installment prefill actually gets exercised end to end.
test.describe('Loans: installment prefill and deduction marking', () => {
  const loanPersonName = testbotName('Pay_LoanPerson');
  let loanPersonId = '';

  test('create a second person and register their hourly rate', async ({ page }) => {
    await page.goto('people-form.html');
    await page.fill('#person-name', loanPersonName);
    await page.selectOption('#person-team', { label: teamName });
    await page.click('#save-person');
    await page.waitForURL(/people\.html/, { timeout: 10_000 });

    const row = page.locator('#people-body tr', { hasText: loanPersonName });
    await expect(row).toHaveCount(1, { timeout: 10_000 });
    await row.locator('button[data-action="edit"]').click();
    await page.waitForURL(/people-form\.html\?id=/, { timeout: 10_000 });
    loanPersonId = new URL(page.url()).searchParams.get('id') || '';
    expect(loanPersonId).not.toBe('');

    await page.fill('#rate-new-value', '15.00');
    await page.click('#rate-save-btn');
    await expect(page.locator('#message')).toContainText('Hourly rate registered', { timeout: 10_000 });
  });

  test('create a 2-installment loan starting this week', async ({ page }) => {
    await page.goto('loans.html');
    await page.click('#add-loan');
    await expect(page.locator('#loan-modal')).toBeVisible({ timeout: 10_000 });
    await page.selectOption('#loan-colaborador', { label: loanPersonName });
    await page.fill('#loan-valor-total', '100');
    await page.fill('#loan-numero-parcelas', '2');
    // #loan-semana-inicio is left at its own auto-filled default (the
    // current week, same defaultWeekStart() weekly-payments.js uses) so
    // installment #1 lands exactly in the week the next test checks.
    await page.click('#loan-save');
    await expect(page.locator('#message')).toContainText('Loan created successfully', { timeout: 10_000 });

    const rows = page.locator('#loans-body tr', { hasText: loanPersonName });
    await expect(rows).toHaveCount(1, { timeout: 10_000 }); // only the group-start row repeats the name
    await expect(page.locator('#loans-body')).toContainText('1 / 2');
    await expect(page.locator('#loans-body')).toContainText('2 / 2');
  });

  test('the first installment shows up pre-filled as this week\'s Loan amount', async ({ page }) => {
    await page.goto('weekly-payments.html');
    const row = page.locator('#payments-body tr', { hasText: loanPersonName });
    await expect(row).toHaveCount(1, { timeout: 15_000 });
    // R$100 / 2 installments = R$50.00 for the installment landing this week;
    // the second installment (next week) must NOT be included.
    await expect(row.locator('.pay-adiantamento')).toHaveValue('50', { timeout: 10_000 });
  });

  test('registering the payment marks that installment as deducted', async ({ page }) => {
    await page.goto('weekly-payments.html');
    const row = page.locator('#payments-body tr', { hasText: loanPersonName });
    await expect(row).toHaveCount(1, { timeout: 15_000 });
    await row.locator('button[data-action="save"]').click();
    await expect(page.locator('#message')).toContainText('Payment registered for', { timeout: 10_000 });

    // Scope to this person via the collaborator filter -- TESTBOT_ loans
    // from earlier suite runs are never cleaned up (see tests/README.md),
    // so an unscoped "1 / 2" text search can match more than one row.
    await page.goto('loans.html');
    await page.selectOption('#colaborador-filter', { label: loanPersonName });
    const installment1 = page.locator('#loans-body tr', { hasText: '1 / 2' });
    await expect(installment1).toHaveCount(1, { timeout: 10_000 });
    await expect(installment1.locator('.loan-status-tag')).toHaveText('Deducted');
    const installment2 = page.locator('#loans-body tr', { hasText: '2 / 2' });
    await expect(installment2).toHaveCount(1, { timeout: 10_000 });
    await expect(installment2.locator('.loan-status-tag')).toHaveText('Pending');
  });
});
