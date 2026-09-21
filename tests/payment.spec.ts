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

// Fixed 2026-09-20: Payment's "current week" used to be computed from
// configuracoes_folha.dia_inicio_semana (a separate, freely-editable
// Payroll Settings field, defaulting to Monday but changeable to any day)
// and always assumed a plain 7-day span. Bonus's periods.js instead
// treats a week as a FIXED 6-day span (Monday through Saturday by
// default, Sunday never counting) driven by configuracoes_operacionais.
// period_start_day/period_end_day. Whenever dia_inicio_semana had drifted
// from period_start_day (exactly what happened in production: dia_inicio_
// semana was Tuesday while period_start_day stayed Monday), Payment
// showed a Tuesday-to-Monday window instead of Monday-to-Saturday.
//
// This test does not read any fixed expected date (today changes on every
// run) -- it recomputes Bonus's own formula independently, inside the
// browser, from the same configuracoes_operacionais row the app itself
// reads, and asserts weekly-payments.html's displayed window is
// byte-for-byte that string.
test.describe("Payment's current week matches Bonus's period rule", () => {
  test('weekly-payments.html shows the same Monday-Saturday window Bonus would compute for today', async ({ page }) => {
    await page.goto('weekly-payments.html');
    await expect(page.locator('#week-range')).not.toHaveText('Week of —', { timeout: 15_000 });

    const expected = await page.evaluate(async () => {
      const cfg = (window as any).KORBUILD_SUPABASE;
      const supabase = (window as any).supabase;
      const db = supabase.createClient(cfg.url, cfg.publishableKey, { auth: { persistSession: true } });
      const { data: { session } } = await db.auth.getSession();
      const { data: profile } = await db.from('usuarios').select('empresa_id').eq('id', session.user.id).maybeSingle();
      const { data: opConfig } = await db
        .from('configuracoes_operacionais')
        .select('period_start_day,period_end_day')
        .eq('empresa_id', profile.empresa_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const startDay = opConfig?.period_start_day ?? 1;
      const endDay = opConfig?.period_end_day ?? 6;

      const isoDate = (d: Date) => d.toISOString().slice(0, 10);
      const fmtDate = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      // Bonus's own day-of-week math (periods.js's nextConfiguredPeriodStart/
      // prepareNextPeriod), adapted to find the week CONTAINING today
      // (Payment's need) instead of the next occurrence after today
      // (Bonus's need when starting a brand new period).
      const d = new Date(); d.setHours(0, 0, 0, 0);
      const startDelta = (d.getDay() - startDay + 7) % 7;
      d.setDate(d.getDate() - startDelta);
      const start = isoDate(d);

      // periods.js's own "end" calculation, verbatim: delta relative to
      // the end day, off of the period's actual start-of-week day.
      const endDelta = (endDay - startDay + 7) % 7;
      const endD = new Date(start + 'T00:00:00');
      endD.setDate(endD.getDate() + endDelta);
      const end = isoDate(endD);

      return `Week of ${fmtDate(start)} → ${fmtDate(end)}`;
    });

    await expect(page.locator('#week-range')).toHaveText(expected, { timeout: 10_000 });
  });
});

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

// "Week start day" was removed from this form 2026-09-20 -- it stopped
// doing anything the moment Payment's week math moved to configuracoes_
// operacionais.period_start_day/period_end_day (the same source Bonus
// uses), and left on-screen would have misled anyone into thinking it
// still controlled the pay week. dia_inicio_semana itself, and
// atualizar_configuracao_folha's p_dia_inicio_semana parameter, are still
// there (payroll-settings.js just round-trips whatever value is already
// stored, silently, since the RPC parameter has no SQL default) -- this
// suite no longer needs to touch it at all.
test.describe('Payroll Settings: edit without breaking existing config', () => {
  let originalSettings: { hours: string; multiplier: string; currency: string };

  test('read current settings', async ({ page }) => {
    await gotoPayrollSettings(page);
    await expect(page.locator('#dia-inicio-semana')).toHaveCount(0); // confirms the dead field is actually gone, not just hidden
    originalSettings = {
      hours: await page.locator('#horas-padrao-semana').inputValue(),
      multiplier: await page.locator('#multiplicador-hora-extra').inputValue(),
      currency: await page.locator('#currency').inputValue(),
    };
    console.log('[payroll-settings] original:', originalSettings);
    expect(originalSettings.hours).not.toBe('');
  });

  test('change settings (including currency) and verify it persisted', async ({ page }) => {
    await gotoPayrollSettings(page);
    const newCurrency = originalSettings.currency === 'USD' ? 'EUR' : 'USD';
    await page.fill('#horas-padrao-semana', '40');
    await page.fill('#multiplicador-hora-extra', '2');
    await page.selectOption('#currency', newCurrency);
    await page.click('#save-btn');
    await expect(page.locator('#message')).toContainText('Payroll settings updated successfully', { timeout: 10_000 });

    await gotoPayrollSettings(page);
    await expect(page.locator('#horas-padrao-semana')).toHaveValue('40');
    await expect(page.locator('#multiplicador-hora-extra')).toHaveValue('2');
    await expect(page.locator('#currency')).toHaveValue(newCurrency);
  });

  test('restore the original settings', async ({ page }) => {
    await gotoPayrollSettings(page);
    await page.fill('#horas-padrao-semana', originalSettings.hours);
    await page.fill('#multiplicador-hora-extra', originalSettings.multiplier);
    await page.selectOption('#currency', originalSettings.currency);
    await page.click('#save-btn');
    await expect(page.locator('#message')).toContainText('Payroll settings updated successfully', { timeout: 10_000 });

    await gotoPayrollSettings(page);
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

// Regression test for a real bug fixed 2026-09-20. It first looked like a
// weekly-payments.js rendering race (a brand-new person's payment row
// sometimes just didn't render on the very first page load), but tracing
// it end to end -- including confirming directly against
// pagamentos_semanais that the server-side upsert was never the
// problem -- found the actual cause one page earlier, in people-form.js:
// loadRateHistory() populates #rate-new-date with the current week's
// start only after 3 awaited network round trips, and saveRate() used to
// fall back to today's date whenever that field was still blank. Clicking
// "Save new rate" before that default finished loading (a real
// possibility on a slow connection, not just under test automation)
// silently registered the rate as effective today instead of the week
// start. Since calcular_pagamento_semanal/registrar_pagamento only treat
// a rate as effective for a week when vigente_de <= that week's start,
// a rate dated "today" (whenever today isn't itself the week-start day)
// fails that check for the week already in progress -- the person then
// never appeared in that week's Payment list, with no error anywhere.
//
// The fix: "Save new rate" now starts disabled and only enables once
// #rate-new-date's real default is in place. This test forces the race
// window wide open (delaying the exact fetch that default depends on)
// and asserts the button cannot be used inside it, then verifies the
// rate that does get saved lands on the shown default, not today, and
// that the person shows up in Payment on the very first visit.
test.describe('Hourly rate: "Save new rate" cannot fire before its date default is ready', () => {
  const raceProofPersonName = testbotName('Pay_RateRace');

  test('the button stays disabled through a slow date-default load, then saves the correct effective date', async ({ page }) => {
    await page.goto('people-form.html');
    await page.fill('#person-name', raceProofPersonName);
    await page.selectOption('#person-team', { label: teamName });
    await page.click('#save-person');
    await page.waitForURL(/people\.html/, { timeout: 10_000 });

    const row = page.locator('#people-body tr', { hasText: raceProofPersonName });
    await expect(row).toHaveCount(1, { timeout: 10_000 });
    await row.locator('button[data-action="edit"]').click();
    await page.waitForURL(/people-form\.html\?id=/, { timeout: 10_000 });

    // Slow down the exact read that populates #rate-new-date's default,
    // to force the original race window wide open.
    await page.route('**/configuracoes_operacionais**', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.continue();
    });
    await page.reload();

    // Immediately after reload, before that delayed read resolves, the
    // button must stay disabled -- this is the fix itself: it used to be
    // clickable here, which is exactly how a rate got silently registered
    // with today's date instead of the current week's start.
    await expect(page.locator('#rate-save-btn')).toBeDisabled();

    await expect(page.locator('#rate-save-btn')).toBeEnabled({ timeout: 10_000 });
    const shownDefault = await page.locator('#rate-new-date').inputValue();
    expect(shownDefault).not.toBe('');

    await page.fill('#rate-new-value', '20.00');
    await page.click('#rate-save-btn');
    await expect(page.locator('#message')).toContainText('Hourly rate registered', { timeout: 10_000 });

    // The registered rate's effective date must be the week-start default
    // the field showed -- never today's date sneaking in via the old
    // fallback (these only coincide when today happens to BE the
    // configured week-start day, which this assertion doesn't rely on).
    const vigenteDe = await page.evaluate(async (name) => {
      const cfg = (window as any).KORBUILD_SUPABASE;
      const supabase = (window as any).supabase;
      const db = supabase.createClient(cfg.url, cfg.publishableKey, { auth: { persistSession: true } });
      const { data: { session } } = await db.auth.getSession();
      const { data: profile } = await db.from('usuarios').select('empresa_id').eq('id', session.user.id).maybeSingle();
      const { data: person } = await db.from('colaboradores').select('id').eq('empresa_id', profile.empresa_id).eq('name', name).maybeSingle();
      const { data: rate } = await db.from('historico_valor_hora').select('vigente_de').eq('colaborador_id', person.id).order('vigente_de', { ascending: false }).limit(1).maybeSingle();
      return rate?.vigente_de;
    }, raceProofPersonName);
    expect(vigenteDe).toBe(shownDefault);

    // End-to-end guarantee: this person now shows up in the CURRENT
    // week's Payment list on the very first visit.
    await page.unroute('**/configuracoes_operacionais**');
    await page.goto('weekly-payments.html');
    await expect(page.locator('#payments-body tr', { hasText: raceProofPersonName })).toHaveCount(1, { timeout: 15_000 });
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
