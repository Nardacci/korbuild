import { test, expect } from '@playwright/test';
import { STORAGE_STATE_PATH, testbotName, assertTestbotName } from './config';

// Financial domain: Accounts Payable (accounts-payable.html, despesas +
// payroll consolidated) and Accounts Receivable (accounts-receivable.html,
// recebimentos). Both follow this project's own RPC-heavy + PL/pgSQL
// validation convention (see supabase/migrations/20260921100000_contas_a_
// pagar_receber.sql) rather than the RLS+trigger-only pattern investigated
// separately as a reference for KORbuild Finances.
//
// Accounts Payable's main screen was redesigned 2026-09-20 from an
// item-by-item list into a grouped summary (Payroll as one group, one group
// per despesa categoria) with an in-page drill-down into the item-level
// list -- the same list->detail toggle pattern evaluations.js and
// bonus-settlement.js already use elsewhere in this app (#list-view/
// #detail-view sections swapped via a "hidden" class, no separate page or
// querystring navigation). Status filtering, which no longer makes sense at
// the group level (a group already shows pending and paid side by side),
// moved into the detail view; the categoria filter was dropped entirely --
// clicking a categoria's own summary row now serves as that filter.

test.describe.configure({ mode: 'serial' });
test.use({ storageState: STORAGE_STATE_PATH });

const categoryName = testbotName('AP_Category');
const expenseName = testbotName('AP_Expense');
const recurringExpenseName = testbotName('AP_RecurringExpense');
const clientName = testbotName('AR_Client');
const clientEmail = `${clientName.toLowerCase()}@example.com`;
const receivableName = testbotName('AR_Receivable');

function currentMonthRange(): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const to = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { from, to };
}

test.describe('Accounts Payable: Expense Categories', () => {
  test('create a category', async ({ page }) => {
    await page.goto('accounts-payable.html');
    await expect(page.locator('#add-expense')).toBeEnabled({ timeout: 15_000 });
    await page.click('#manage-categories');
    await expect(page.locator('#categories-modal')).toBeVisible({ timeout: 10_000 });
    await page.fill('#new-category-name', categoryName);
    await page.click('#add-category-btn');
    await expect(page.locator('#categories-message')).toContainText('Category created.', { timeout: 10_000 });
    await expect(page.locator('#categories-body')).toContainText(categoryName, { timeout: 10_000 });
    await page.click('#categories-modal-close');
  });
});

test.describe('Accounts Payable: one-time expense (grouped summary + drill-down)', () => {
  test('create a one-time (pontual) expense, then drill into its category group', async ({ page }) => {
    await page.goto('accounts-payable.html');
    await expect(page.locator('#add-expense')).toBeEnabled({ timeout: 15_000 });

    // A wide date window covering today ensures the freshly created expense
    // (due today) always falls inside the visible range regardless of when
    // this suite runs in the month.
    const { from, to } = currentMonthRange();
    await page.fill('#filter-data-inicio', from);
    await page.fill('#filter-data-fim', to);

    await page.click('#add-expense');
    await expect(page.locator('#expense-modal')).toBeVisible({ timeout: 10_000 });
    await page.selectOption('#expense-categoria', { label: categoryName });
    await page.fill('#expense-descricao', expenseName);
    await page.fill('#expense-valor', '250.00');
    // #expense-data-prevista is pre-filled with today by openExpenseModal();
    // left untouched so the row lands inside the [from, to] window above.
    await page.click('#expense-save');
    await expect(page.locator('#message')).toContainText('Expense created successfully.', { timeout: 10_000 });

    // The main screen now shows one summarized row per category (grouped
    // view), not the expense itself -- assert the group exists, then drill
    // into it to reach the item-level list.
    const groupRow = page.locator('#ap-groups-body tr', { hasText: categoryName });
    await expect(groupRow).toHaveCount(1, { timeout: 10_000 });
    await groupRow.click();

    await expect(page.locator('#detail-view')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#summary-view')).toBeHidden();
    await expect(page.locator('#detail-heading')).toHaveText(categoryName);

    const row = page.locator('#ap-detail-body tr', { hasText: expenseName });
    await expect(row).toHaveCount(1, { timeout: 10_000 });
    assertTestbotName((await row.locator('.team-name').textContent())?.trim());
    await expect(row.locator('.origin-tag')).toHaveText('Expense');
    await expect(row.locator('.ap-status-tag')).toHaveText('Provisioned');
    await expect(row.locator('button[data-action="mark-paid"]')).toBeVisible();

    await page.click('#back-to-summary');
    await expect(page.locator('#summary-view')).toBeVisible({ timeout: 10_000 });
  });

  test('mark the expense as paid from inside the drill-down', async ({ page }) => {
    await page.goto('accounts-payable.html');
    await expect(page.locator('#add-expense')).toBeEnabled({ timeout: 15_000 });

    const groupRow = page.locator('#ap-groups-body tr', { hasText: categoryName });
    await expect(groupRow).toHaveCount(1, { timeout: 10_000 });
    await groupRow.click();
    await expect(page.locator('#detail-view')).toBeVisible({ timeout: 10_000 });

    const row = page.locator('#ap-detail-body tr', { hasText: expenseName });
    await expect(row).toHaveCount(1, { timeout: 10_000 });
    await row.locator('button[data-action="mark-paid"]').click();
    await expect(page.locator('#detail-message')).toContainText('Expense marked as paid.', { timeout: 10_000 });

    const refreshedRow = page.locator('#ap-detail-body tr', { hasText: expenseName });
    await expect(refreshedRow).toHaveCount(1, { timeout: 10_000 });
    await expect(refreshedRow.locator('.ap-status-tag')).toHaveText('Paid');
    await expect(refreshedRow.locator('button[data-action="mark-paid"]')).toHaveCount(0);

    // Marking paid also refreshes the group's own Pending/Paid split.
    await page.click('#back-to-summary');
    const summaryGroupRow = page.locator('#ap-groups-body tr', { hasText: categoryName });
    await expect(summaryGroupRow.locator('td').nth(2)).toContainText('250', { timeout: 10_000 }); // PAID column
  });
});

test.describe('Accounts Payable: recurring expense generates 12 future occurrences', () => {
  test('create a monthly recurring expense', async ({ page }) => {
    await page.goto('accounts-payable.html');
    await expect(page.locator('#add-expense')).toBeEnabled({ timeout: 15_000 });
    await page.click('#add-expense');
    await expect(page.locator('#expense-modal')).toBeVisible({ timeout: 10_000 });
    await page.fill('#expense-descricao', recurringExpenseName);
    await page.fill('#expense-valor', '100.00');
    await page.check('#expense-recorrente');
    await expect(page.locator('#expense-frequencia-wrap')).toBeVisible({ timeout: 5_000 });
    await page.selectOption('#expense-frequencia', 'mensal'); // already the default, set explicitly for clarity
    await page.click('#expense-save');
    await expect(page.locator('#message')).toContainText('Recurring expense created (13 occurrences).', { timeout: 10_000 });
  });

  test('confirm 13 total occurrences (the entered one + 12 future) exist for this group', async ({ page }) => {
    // The grouped summary (accounts-payable.html) only ever shows one
    // period at a time, so counting all 13 rows -- which span a full year
    // -- is done directly against obter_despesas via the page's own
    // authenticated Supabase client, the same technique payment.spec.ts
    // uses to independently recompute expected values in-browser.
    await page.goto('accounts-payable.html');
    await expect(page.locator('#add-expense')).toBeEnabled({ timeout: 15_000 });

    const count = await page.evaluate(async (descricao) => {
      const cfg = (window as any).KORBUILD_SUPABASE;
      const supabase = (window as any).supabase;
      const db = supabase.createClient(cfg.url, cfg.publishableKey, { auth: { persistSession: true } });
      const { data: { session } } = await db.auth.getSession();
      const { data: profile } = await db.from('usuarios').select('empresa_id').eq('id', session.user.id).maybeSingle();
      const { data, error } = await db.rpc('obter_despesas', { p_empresa_id: profile.empresa_id });
      if (error) throw new Error(error.message);
      return (data || []).filter((d: any) => d.descricao === descricao).length;
    }, recurringExpenseName);

    expect(count).toBe(13);
  });
});

test.describe('Accounts Receivable: create client prerequisite', () => {
  test('create Client for receivables', async ({ page }) => {
    await page.goto('customer-form.html');
    await page.fill('#nome', clientName);
    await page.fill('#email', clientEmail);
    await page.click('#save-btn');
    await page.waitForURL(/customers\.html/, { timeout: 10_000 });
    await expect(page.locator('#clients-body')).toContainText(clientName, { timeout: 10_000 });
  });
});

test.describe('Accounts Receivable: receivable lifecycle', () => {
  test('create a receivable', async ({ page }) => {
    await page.goto('accounts-receivable.html');
    await expect(page.locator('#add-receivable')).toBeEnabled({ timeout: 15_000 });

    const { from, to } = currentMonthRange();
    await page.fill('#filter-data-inicio', from);
    await page.fill('#filter-data-fim', to);

    await page.click('#add-receivable');
    await expect(page.locator('#receivable-modal')).toBeVisible({ timeout: 10_000 });
    await page.selectOption('#receivable-cliente', { label: clientName });
    await page.fill('#receivable-descricao', receivableName);
    await page.fill('#receivable-valor', '500.00');
    // #receivable-data-prevista is pre-filled with today by openReceivableModal().
    await page.click('#receivable-save');
    await expect(page.locator('#message')).toContainText('Receivable created successfully.', { timeout: 10_000 });

    const row = page.locator('#ar-body tr', { hasText: receivableName });
    await expect(row).toHaveCount(1, { timeout: 10_000 });
    assertTestbotName((await row.locator('.team-name').textContent())?.trim());
    await expect(row.locator('td', { hasText: clientName })).toHaveCount(1);
    await expect(row.locator('.ap-status-tag')).toHaveText('Pending');
    await expect(row.locator('button[data-action="mark-received"]')).toBeVisible();
  });

  test('mark the receivable as received', async ({ page }) => {
    await page.goto('accounts-receivable.html');
    await expect(page.locator('#add-receivable')).toBeEnabled({ timeout: 15_000 });
    const row = page.locator('#ar-body tr', { hasText: receivableName });
    await expect(row).toHaveCount(1, { timeout: 10_000 });
    await row.locator('button[data-action="mark-received"]').click();
    await expect(page.locator('#message')).toContainText('Receivable marked as received.', { timeout: 10_000 });

    const refreshedRow = page.locator('#ar-body tr', { hasText: receivableName });
    await expect(refreshedRow).toHaveCount(1, { timeout: 10_000 });
    await expect(refreshedRow.locator('.ap-status-tag')).toHaveText('Received');
    await expect(refreshedRow.locator('button[data-action="mark-received"]')).toHaveCount(0);
  });
});

test.describe('Accounts Payable: multiple payroll payments summarize into one group', () => {
  const workUnitName = testbotName('AP_Payroll_WorkUnit');
  const teamName = testbotName('AP_Payroll_Team');
  const personAName = testbotName('AP_Payroll_PersonA');
  const personBName = testbotName('AP_Payroll_PersonB');

  test('prerequisite: two rated people, each auto-generating a payroll row for the current week', async ({ page }) => {
    await page.goto('work-units-form.html');
    await page.fill('#unit-name', workUnitName);
    await page.click('#save-unit');
    await page.waitForURL(/work-units\.html/, { timeout: 10_000 });

    await page.goto('teams-form.html');
    await page.fill('#team-name', teamName);
    await page.selectOption('#team-work-unit', { label: workUnitName });
    await page.click('#save-team');
    await page.waitForURL(/teams\.html/, { timeout: 10_000 });

    for (const personName of [personAName, personBName]) {
      await page.goto('people-form.html');
      await page.fill('#person-name', personName);
      await page.selectOption('#person-team', { label: teamName });
      await page.click('#save-person');
      await page.waitForURL(/people\.html/, { timeout: 10_000 });

      const row = page.locator('#people-body tr', { hasText: personName });
      await expect(row).toHaveCount(1, { timeout: 10_000 });
      await row.locator('button[data-action="edit"]').click();
      await page.waitForURL(/people-form\.html\?id=/, { timeout: 10_000 });

      await page.fill('#rate-new-value', '20.00');
      await page.click('#rate-save-btn');
      await expect(page.locator('#message')).toContainText('Hourly rate registered', { timeout: 10_000 });

      // Visiting Weekly Payments right after each person is rated
      // auto-generates that person's current-week row. Done once per
      // person here (rather than once after both are rated) to sidestep a
      // separate, pre-existing weekly-payments.js issue where auto-
      // creating more than one brand-new row on the very same page load
      // only renders the first -- the server-side rows are both created
      // correctly either way, but this ordering avoids depending on that
      // rendering path, which is outside this task's scope to fix.
      await page.goto('weekly-payments.html');
      await expect(page.locator('#payments-body tr', { hasText: personName })).toHaveCount(1, { timeout: 15_000 });
    }
  });

  test('Accounts Payable groups both payroll rows into a single "Payroll" row, and shows it alongside expense categories', async ({ page }) => {
    await page.goto('accounts-payable.html');
    await expect(page.locator('#add-expense')).toBeEnabled({ timeout: 15_000 });
    const { from, to } = currentMonthRange();
    await page.fill('#filter-data-inicio', from);
    await page.fill('#filter-data-fim', to);

    // Exactly one summarized Payroll row -- never one row per person/payment.
    const payrollRow = page.locator('#ap-groups-body tr[data-kind="payroll"]');
    await expect(payrollRow).toHaveCount(1, { timeout: 10_000 });

    const itemCount = Number((await payrollRow.locator('td').nth(3).textContent())?.trim());
    expect(itemCount).toBeGreaterThanOrEqual(2); // at least this test's own two people

    // The despesa category group from earlier in this suite coexists
    // alongside Payroll in the same grouped list.
    await expect(page.locator('#ap-groups-body tr', { hasText: categoryName })).toHaveCount(1);

    // Drill into Payroll: both people's individual rows show up, each with
    // the Payroll origin tag and no "Mark as Paid" action (payroll payment
    // stays in Weekly Payments, not duplicated here).
    await payrollRow.click();
    await expect(page.locator('#detail-view')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#detail-heading')).toHaveText('Payroll');

    for (const personName of [personAName, personBName]) {
      const itemRow = page.locator('#ap-detail-body tr', { hasText: personName });
      await expect(itemRow).toHaveCount(1, { timeout: 10_000 });
      await expect(itemRow.locator('.origin-tag')).toHaveText('Payroll');
      await expect(itemRow.locator('button[data-action="mark-paid"]')).toHaveCount(0);
    }

    await page.click('#back-to-summary');
    await expect(page.locator('#summary-view')).toBeVisible({ timeout: 10_000 });
  });
});
