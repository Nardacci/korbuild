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

// Date.toISOString() always reads the UTC calendar date, not the local
// one -- in a UTC-behind timezone this silently returns "tomorrow" for
// part of the local evening (root-caused and fixed the same way in
// schedule.spec.ts's todayIso() on 2026-09-20, after it made a same-day
// calendar appointment invisible to the app's own local-dated view).
// None of the dates built here are currently compared against a
// local-dated app view the way that one was, but they're all meant to be
// local calendar dates, so they're built the same safe way on principle.
function isoDateLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function currentMonthRange(): { from: string; to: string } {
  const today = new Date();
  const from = isoDateLocal(new Date(today.getFullYear(), today.getMonth(), 1));
  const to = isoDateLocal(new Date(today.getFullYear(), today.getMonth() + 1, 0));
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

test.describe('Accounts Payable: editing a despesa (single occurrence only)', () => {
  const editExpenseName = testbotName('AP_EditExpense');
  const editedExpenseName = testbotName('AP_EditExpense_Updated');

  test('create a one-time expense to edit', async ({ page }) => {
    await page.goto('accounts-payable.html');
    await expect(page.locator('#add-expense')).toBeEnabled({ timeout: 15_000 });
    const { from, to } = currentMonthRange();
    await page.fill('#filter-data-inicio', from);
    await page.fill('#filter-data-fim', to);

    await page.click('#add-expense');
    await expect(page.locator('#expense-modal')).toBeVisible({ timeout: 10_000 });
    await page.selectOption('#expense-categoria', { label: categoryName });
    await page.fill('#expense-descricao', editExpenseName);
    await page.fill('#expense-valor', '300.00');
    await page.click('#expense-save');
    await expect(page.locator('#message')).toContainText('Expense created successfully.', { timeout: 10_000 });
  });

  test('editing it changes category, description, amount and due date', async ({ page }) => {
    await page.goto('accounts-payable.html');
    await expect(page.locator('#add-expense')).toBeEnabled({ timeout: 15_000 });

    const groupRow = page.locator('#ap-groups-body tr', { hasText: categoryName });
    await expect(groupRow).toHaveCount(1, { timeout: 10_000 });
    await groupRow.click();
    await expect(page.locator('#detail-view')).toBeVisible({ timeout: 10_000 });

    const row = page.locator('#ap-detail-body tr', { hasText: editExpenseName });
    await expect(row).toHaveCount(1, { timeout: 10_000 });
    await row.locator('button[data-action="edit-despesa"]').click();

    await expect(page.locator('#expense-modal')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#expense-modal-title')).toHaveText('Edit Expense');
    await expect(page.locator('#expense-save')).toHaveText('Save Changes');
    // Prefilled with the existing values.
    await expect(page.locator('#expense-descricao')).toHaveValue(editExpenseName);
    await expect(page.locator('#expense-valor')).toHaveValue('300');
    const selectedCategoryLabel = await page.locator('#expense-categoria').locator('option:checked').textContent();
    expect(selectedCategoryLabel?.trim()).toBe(categoryName);
    // A single occurrence's tipo/frequencia can't change here -- the
    // recurring-expense controls are hidden entirely while editing.
    await expect(page.locator('#expense-recurring-section')).toBeHidden();
    // No warning banner for a still-provisioned expense.
    await expect(page.locator('#expense-message')).toBeHidden();

    const newDueDate = new Date();
    newDueDate.setDate(newDueDate.getDate() + 1);
    const newDueDateIso = isoDateLocal(newDueDate);

    await page.selectOption('#expense-categoria', ''); // switch to "No category" -- moves it to the Uncategorized group
    await page.fill('#expense-descricao', editedExpenseName);
    await page.fill('#expense-valor', '425.50');
    await page.fill('#expense-data-prevista', newDueDateIso);
    await page.click('#expense-save');
    await expect(page.locator('#detail-message')).toContainText('Expense updated successfully.', { timeout: 10_000 });

    // Changing its category moved it out of the group currently open here.
    await expect(page.locator('#ap-detail-body tr', { hasText: editedExpenseName })).toHaveCount(0);

    await page.click('#back-to-summary');
    const uncategorizedRow = page.locator('#ap-groups-body tr', { hasText: 'Uncategorized' });
    await expect(uncategorizedRow).toHaveCount(1, { timeout: 10_000 });
    await uncategorizedRow.click();

    const updatedRow = page.locator('#ap-detail-body tr', { hasText: editedExpenseName });
    await expect(updatedRow).toHaveCount(1, { timeout: 10_000 });
    await expect(updatedRow.locator('.pay-money')).toContainText('425');
    await expect(page.locator('#ap-detail-body tr', { hasText: editExpenseName })).toHaveCount(0); // old name is gone
  });

  test('editing an already-paid expense shows a non-blocking audit warning', async ({ page }) => {
    // expenseName was marked paid earlier in this suite -- reuse it rather
    // than paying off another one just for this check.
    await page.goto('accounts-payable.html');
    await expect(page.locator('#add-expense')).toBeEnabled({ timeout: 15_000 });

    const groupRow = page.locator('#ap-groups-body tr', { hasText: categoryName });
    await expect(groupRow).toHaveCount(1, { timeout: 10_000 });
    await groupRow.click();
    await expect(page.locator('#detail-view')).toBeVisible({ timeout: 10_000 });

    const row = page.locator('#ap-detail-body tr', { hasText: expenseName });
    await expect(row).toHaveCount(1, { timeout: 10_000 });
    await expect(row.locator('.ap-status-tag')).toHaveText('Paid');
    await row.locator('button[data-action="edit-despesa"]').click();

    await expect(page.locator('#expense-modal')).toBeVisible({ timeout: 10_000 });
    // Warned, but not blocked -- the form is still fully usable.
    await expect(page.locator('#expense-message')).toBeVisible();
    await expect(page.locator('#expense-message')).toContainText('already marked as paid');
    await expect(page.locator('#expense-save')).toBeEnabled();
    await page.click('#expense-cancel');
  });
});

test.describe('Accounts Payable: editing one recurring occurrence never touches its siblings', () => {
  test('editing the current occurrence leaves the other 12 in the series unchanged', async ({ page }) => {
    await page.goto('accounts-payable.html');
    await expect(page.locator('#add-expense')).toBeEnabled({ timeout: 15_000 });

    // Find this series' occurrences directly, the same technique the
    // "confirm 13 occurrences" test uses -- the one due today (created
    // directly, not one of the 12 generated future ones) is the one
    // visible in the current month's drill-down.
    const occurrences = await page.evaluate(async (descricao) => {
      const cfg = (window as any).KORBUILD_SUPABASE;
      const supabase = (window as any).supabase;
      const db = supabase.createClient(cfg.url, cfg.publishableKey, { auth: { persistSession: true } });
      const { data: { session } } = await db.auth.getSession();
      const { data: profile } = await db.from('usuarios').select('empresa_id').eq('id', session.user.id).maybeSingle();
      const { data, error } = await db.rpc('obter_despesas', { p_empresa_id: profile.empresa_id });
      if (error) throw new Error(error.message);
      return (data || []).filter((d: any) => d.descricao === descricao).sort((a: any, b: any) => a.data_prevista.localeCompare(b.data_prevista));
    }, recurringExpenseName);
    expect(occurrences.length).toBe(13);
    const targetId = occurrences[0].id; // the earliest -- the one entered directly, due this month

    const groupRow = page.locator('#ap-groups-body tr', { hasText: 'Uncategorized' });
    await expect(groupRow).toHaveCount(1, { timeout: 10_000 });
    await groupRow.click();
    await expect(page.locator('#detail-view')).toBeVisible({ timeout: 10_000 });

    const row = page.locator(`#ap-detail-body tr[data-id="${targetId}"]`);
    await expect(row).toHaveCount(1, { timeout: 10_000 });
    await row.locator('button[data-action="edit-despesa"]').click();
    await expect(page.locator('#expense-modal')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#expense-recurring-section')).toBeHidden(); // can't turn a single occurrence into its own series here

    await page.fill('#expense-valor', '150.00');
    await page.click('#expense-save');
    await expect(page.locator('#detail-message')).toContainText('Expense updated successfully.', { timeout: 10_000 });

    const after = await page.evaluate(async (id) => {
      const cfg = (window as any).KORBUILD_SUPABASE;
      const supabase = (window as any).supabase;
      const db = supabase.createClient(cfg.url, cfg.publishableKey, { auth: { persistSession: true } });
      const { data } = await db.from('despesas').select('id,valor').eq('id', id).maybeSingle();
      return data;
    }, targetId);
    expect(Number(after.valor)).toBe(150);

    const siblingIds = occurrences.slice(1).map((o: any) => o.id);
    const siblings = await page.evaluate(async (ids) => {
      const cfg = (window as any).KORBUILD_SUPABASE;
      const supabase = (window as any).supabase;
      const db = supabase.createClient(cfg.url, cfg.publishableKey, { auth: { persistSession: true } });
      const { data } = await db.from('despesas').select('id,valor').in('id', ids);
      return data;
    }, siblingIds);
    expect(siblings.length).toBe(12);
    for (const sibling of siblings) expect(Number(sibling.valor)).toBe(100); // untouched
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

test.describe('Accounts Receivable: receivable lifecycle (grouped summary + drill-down)', () => {
  test('create a receivable, then drill into its client group', async ({ page }) => {
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

    // The main screen now shows one summarized row per client, not the
    // receivable itself -- assert the group exists, then drill into it.
    const groupRow = page.locator('#ar-groups-body tr', { hasText: clientName });
    await expect(groupRow).toHaveCount(1, { timeout: 10_000 });
    await groupRow.click();

    await expect(page.locator('#detail-view')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#summary-view')).toBeHidden();
    await expect(page.locator('#detail-heading')).toHaveText(clientName);

    const row = page.locator('#ar-detail-body tr', { hasText: receivableName });
    await expect(row).toHaveCount(1, { timeout: 10_000 });
    assertTestbotName((await row.locator('.team-name').textContent())?.trim());
    await expect(row.locator('.ap-status-tag')).toHaveText('Pending');
    await expect(row.locator('button[data-action="mark-received"]')).toBeVisible();
    await expect(row.locator('button[data-action="edit-receivable"]')).toBeVisible();

    await page.click('#back-to-summary');
    await expect(page.locator('#summary-view')).toBeVisible({ timeout: 10_000 });
  });

  test('mark the receivable as received from inside the drill-down', async ({ page }) => {
    await page.goto('accounts-receivable.html');
    await expect(page.locator('#add-receivable')).toBeEnabled({ timeout: 15_000 });

    const groupRow = page.locator('#ar-groups-body tr', { hasText: clientName });
    await expect(groupRow).toHaveCount(1, { timeout: 10_000 });
    await groupRow.click();
    await expect(page.locator('#detail-view')).toBeVisible({ timeout: 10_000 });

    const row = page.locator('#ar-detail-body tr', { hasText: receivableName });
    await expect(row).toHaveCount(1, { timeout: 10_000 });
    await row.locator('button[data-action="mark-received"]').click();
    await expect(page.locator('#detail-message')).toContainText('Receivable marked as received.', { timeout: 10_000 });

    const refreshedRow = page.locator('#ar-detail-body tr', { hasText: receivableName });
    await expect(refreshedRow).toHaveCount(1, { timeout: 10_000 });
    await expect(refreshedRow.locator('.ap-status-tag')).toHaveText('Received');
    await expect(refreshedRow.locator('button[data-action="mark-received"]')).toHaveCount(0);
  });
});

test.describe('Accounts Receivable: editing a receivable (client is locked)', () => {
  const editReceivableName = testbotName('AR_EditReceivable');
  const editedReceivableName = testbotName('AR_EditReceivable_Updated');

  test('create a receivable to edit', async ({ page }) => {
    await page.goto('accounts-receivable.html');
    await expect(page.locator('#add-receivable')).toBeEnabled({ timeout: 15_000 });
    const { from, to } = currentMonthRange();
    await page.fill('#filter-data-inicio', from);
    await page.fill('#filter-data-fim', to);

    await page.click('#add-receivable');
    await expect(page.locator('#receivable-modal')).toBeVisible({ timeout: 10_000 });
    await page.selectOption('#receivable-cliente', { label: clientName });
    await page.fill('#receivable-descricao', editReceivableName);
    await page.fill('#receivable-valor', '300.00');
    await page.click('#receivable-save');
    await expect(page.locator('#message')).toContainText('Receivable created successfully.', { timeout: 10_000 });
  });

  test('editing it changes description, amount and due date -- the client stays locked', async ({ page }) => {
    await page.goto('accounts-receivable.html');
    await expect(page.locator('#add-receivable')).toBeEnabled({ timeout: 15_000 });

    const groupRow = page.locator('#ar-groups-body tr', { hasText: clientName });
    await expect(groupRow).toHaveCount(1, { timeout: 10_000 });
    await groupRow.click();
    await expect(page.locator('#detail-view')).toBeVisible({ timeout: 10_000 });

    const row = page.locator('#ar-detail-body tr', { hasText: editReceivableName });
    await expect(row).toHaveCount(1, { timeout: 10_000 });
    await row.locator('button[data-action="edit-receivable"]').click();

    await expect(page.locator('#receivable-modal')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#receivable-modal-title')).toHaveText('Edit Receivable');
    await expect(page.locator('#receivable-save')).toHaveText('Save Changes');
    // Prefilled with the existing values; the client select shows the
    // right client but is locked -- editing a receivable can't reassign
    // whose debt it is.
    await expect(page.locator('#receivable-descricao')).toHaveValue(editReceivableName);
    await expect(page.locator('#receivable-valor')).toHaveValue('300');
    await expect(page.locator('#receivable-cliente')).toBeDisabled();
    const selectedClientLabel = await page.locator('#receivable-cliente').locator('option:checked').textContent();
    expect(selectedClientLabel?.trim()).toBe(clientName);

    const newDueDate = new Date();
    newDueDate.setDate(newDueDate.getDate() + 1);
    const newDueDateIso = isoDateLocal(newDueDate);

    await page.fill('#receivable-descricao', editedReceivableName);
    await page.fill('#receivable-valor', '450.00');
    await page.fill('#receivable-data-prevista', newDueDateIso);
    await page.click('#receivable-save');
    await expect(page.locator('#detail-message')).toContainText('Receivable updated successfully.', { timeout: 10_000 });

    // Unchanged client -- still shows up in the same client's group.
    const updatedRow = page.locator('#ar-detail-body tr', { hasText: editedReceivableName });
    await expect(updatedRow).toHaveCount(1, { timeout: 10_000 });
    await expect(updatedRow.locator('.pay-money')).toContainText('450');
    await expect(page.locator('#ar-detail-body tr', { hasText: editReceivableName })).toHaveCount(0); // old name is gone
  });
});

test.describe('Accounts Receivable: multiple receivables from the same client summarize into one group', () => {
  const multiReceivableA = testbotName('AR_Receivable_Multi_A');
  const multiReceivableB = testbotName('AR_Receivable_Multi_B');

  test('create two receivables for the same client', async ({ page }) => {
    await page.goto('accounts-receivable.html');
    await expect(page.locator('#add-receivable')).toBeEnabled({ timeout: 15_000 });
    const { from, to } = currentMonthRange();
    await page.fill('#filter-data-inicio', from);
    await page.fill('#filter-data-fim', to);

    for (const name of [multiReceivableA, multiReceivableB]) {
      await page.click('#add-receivable');
      await expect(page.locator('#receivable-modal')).toBeVisible({ timeout: 10_000 });
      await page.selectOption('#receivable-cliente', { label: clientName });
      await page.fill('#receivable-descricao', name);
      await page.fill('#receivable-valor', '200.00');
      await page.click('#receivable-save');
      await expect(page.locator('#message')).toContainText('Receivable created successfully.', { timeout: 10_000 });
    }
  });

  test('the client group is a single summarized row, and drill-down lists both new items', async ({ page }) => {
    await page.goto('accounts-receivable.html');
    await expect(page.locator('#add-receivable')).toBeEnabled({ timeout: 15_000 });
    const { from, to } = currentMonthRange();
    await page.fill('#filter-data-inicio', from);
    await page.fill('#filter-data-fim', to);

    // Exactly one summarized row for this client -- never one per receivable.
    const clientRow = page.locator('#ar-groups-body tr', { hasText: clientName });
    await expect(clientRow).toHaveCount(1, { timeout: 10_000 });

    const itemCount = Number((await clientRow.locator('td').nth(3).textContent())?.trim());
    expect(itemCount).toBeGreaterThanOrEqual(2); // at least this test's own two receivables

    await clientRow.click();
    await expect(page.locator('#detail-view')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#detail-heading')).toHaveText(clientName);

    for (const name of [multiReceivableA, multiReceivableB]) {
      await expect(page.locator('#ar-detail-body tr', { hasText: name })).toHaveCount(1, { timeout: 10_000 });
    }
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
      // Payroll rows have no Edit action at all (not just disabled) -- a
      // colaborador's payment data has exactly one source of truth,
      // weekly-payments.html.
      await expect(itemRow.locator('button[data-action="edit-despesa"]')).toHaveCount(0);
    }

    await page.click('#back-to-summary');
    await expect(page.locator('#summary-view')).toBeVisible({ timeout: 10_000 });
  });
});
