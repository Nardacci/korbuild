import { test, expect } from '@playwright/test';
import { STORAGE_STATE_PATH, testbotName, assertTestbotName } from './config';

// Financial domain: Accounts Payable (accounts-payable.html, despesas +
// payroll consolidated) and Accounts Receivable (accounts-receivable.html,
// recebimentos). Both follow this project's own RPC-heavy + PL/pgSQL
// validation convention (see supabase/migrations/20260921100000_contas_a_
// pagar_receber.sql) rather than the RLS+trigger-only pattern investigated
// separately as a reference for KORbuild Finances.
//
// The consolidated-view test below depends on this suite's Payment domain
// already having registered at least one payroll payment for the current
// week (see payment.spec.ts) so a real 'folha' row exists to interleave
// with a 'despesa' row -- if payment.spec.ts hasn't run first in this
// worker, that one assertion is skipped rather than failed, since Playwright
// spec files are not guaranteed to share execution order across files.

test.describe.configure({ mode: 'serial' });
test.use({ storageState: STORAGE_STATE_PATH });

const categoryName = testbotName('AP_Category');
const expenseName = testbotName('AP_Expense');
const recurringExpenseName = testbotName('AP_RecurringExpense');
const clientName = testbotName('AR_Client');
const clientEmail = `${clientName.toLowerCase()}@example.com`;
const receivableName = testbotName('AR_Receivable');

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

test.describe('Accounts Payable: one-time expense', () => {
  test('create a one-time (pontual) expense', async ({ page }) => {
    await page.goto('accounts-payable.html');
    await expect(page.locator('#add-expense')).toBeEnabled({ timeout: 15_000 });

    // A wide date window covering today ensures the freshly created expense
    // (due today) always falls inside the visible range regardless of when
    // this suite runs in the month.
    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    const to = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
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

    const row = page.locator('#ap-body tr', { hasText: expenseName });
    await expect(row).toHaveCount(1, { timeout: 10_000 });
    assertTestbotName((await row.locator('.team-name').textContent())?.trim());
    await expect(row.locator('.origin-tag')).toHaveText('Expense');
    await expect(row.locator('.ap-status-tag')).toHaveText('Provisioned');
    await expect(row.locator('button[data-action="mark-paid"]')).toBeVisible();
  });

  test('mark the expense as paid', async ({ page }) => {
    await page.goto('accounts-payable.html');
    await expect(page.locator('#add-expense')).toBeEnabled({ timeout: 15_000 });
    const row = page.locator('#ap-body tr', { hasText: expenseName });
    await expect(row).toHaveCount(1, { timeout: 10_000 });
    await row.locator('button[data-action="mark-paid"]').click();
    await expect(page.locator('#message')).toContainText('Expense marked as paid.', { timeout: 10_000 });

    const refreshedRow = page.locator('#ap-body tr', { hasText: expenseName });
    await expect(refreshedRow).toHaveCount(1, { timeout: 10_000 });
    await expect(refreshedRow.locator('.ap-status-tag')).toHaveText('Paid');
    await expect(refreshedRow.locator('button[data-action="mark-paid"]')).toHaveCount(0);
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
    // The consolidated view (accounts-payable.html) only ever shows one
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

    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    const to = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
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

test.describe('Accounts Payable: consolidated view interleaves despesas and payroll', () => {
  test('the current-week list shows both an expense and a payroll entry, correctly labeled', async ({ page }) => {
    // Uses a wide date window (whole current month, which always contains
    // the current payroll week) so this doesn't depend on the exact week
    // boundaries payment.spec.ts's payroll row landed in.
    await page.goto('accounts-payable.html');
    await expect(page.locator('#add-expense')).toBeEnabled({ timeout: 15_000 });
    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    const to = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
    await page.fill('#filter-data-inicio', from);
    await page.fill('#filter-data-fim', to);
    await page.selectOption('#filter-status', 'ALL');

    await expect(page.locator('#ap-body tr').filter({ hasText: 'Expense' }).first()).toBeVisible({ timeout: 10_000 });

    const payrollRows = page.locator('#ap-body tr').filter({ hasText: 'Payroll' });
    const payrollCount = await payrollRows.count();
    test.skip(payrollCount === 0, 'No payroll ("folha") row found for the current month -- payment.spec.ts likely has not run in this worker yet.');
    await expect(payrollRows.first()).toBeVisible();
  });
});
