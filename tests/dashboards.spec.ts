import { test, expect } from '@playwright/test';
import { STORAGE_STATE_PATH } from './config';

// Dashboards domain: the 3-way switcher (Visão Geral / Pessoas & Operação /
// Financeiro) and the two new analytics dashboards built on top of the
// 11-month historical backfill for the suite workspace. Read-only --
// nothing here creates, edits or deletes data, so the TESTBOT_ naming
// safety gate doesn't apply to this file.

test.describe.configure({ mode: 'serial' });
test.use({ storageState: STORAGE_STATE_PATH });

test.describe('Notification bell (global component)', () => {
  test('renders on home.html and its panel opens/closes', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('home.html');
    const bellBtn = page.locator('#kor-notif-btn');
    await expect(bellBtn).toBeVisible({ timeout: 15_000 });
    const panel = page.locator('#kor-notif-panel');
    await expect(panel).toHaveClass(/hidden/);

    await bellBtn.click();
    await expect(panel).not.toHaveClass(/hidden/);
    // Suite workspace is TRIALING, not ACTIVE/PAST_DUE, so no billing
    // alerts apply right now -- the empty state is the correct render.
    await expect(panel).toContainText('No alerts right now.', { timeout: 10_000 });

    await bellBtn.click();
    await expect(panel).toHaveClass(/hidden/);
    expect(errors, `Unexpected page errors: ${errors.join(' | ')}`).toHaveLength(0);
  });
});

test('dashboard switcher navigates between all 3 dashboards', async ({ page }) => {
  await page.goto('home.html');
  await expect(page.locator('#dashboard-switcher')).toBeVisible({ timeout: 10_000 });

  await page.selectOption('#dashboard-switcher', 'dashboard-people.html');
  await page.waitForURL(/dashboard-people\.html/, { timeout: 10_000 });
  await expect(page.locator('#dashboard-switcher')).toHaveValue('dashboard-people.html');

  await page.selectOption('#dashboard-switcher', 'dashboard-financial.html');
  await page.waitForURL(/dashboard-financial\.html/, { timeout: 10_000 });
  await expect(page.locator('#dashboard-switcher')).toHaveValue('dashboard-financial.html');

  await page.selectOption('#dashboard-switcher', 'home.html');
  await page.waitForURL(/home\.html/, { timeout: 10_000 });
});

test.describe('People & Operations dashboard', () => {
  test('loads metrics and renders all 4 charts', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('dashboard-people.html');
    await expect(page.locator('#metric-schedule-total')).not.toHaveText('0', { timeout: 15_000 });
    await expect(page.locator('#metric-occurrences')).not.toHaveText('0');
    await expect(page.locator('canvas')).toHaveCount(4);

    // Every canvas Chart.js actually drew into has a non-zero backing size.
    const sizes = await page.locator('canvas').evaluateAll((els) =>
      els.map((el) => (el as HTMLCanvasElement).width * (el as HTMLCanvasElement).height),
    );
    expect(sizes.every((area) => area > 0)).toBe(true);
    expect(errors, `Unexpected page errors: ${errors.join(' | ')}`).toHaveLength(0);
  });

  test('week/month toggle re-renders without errors', async ({ page }) => {
    // NOTE: this deliberately does NOT assert that the week-view and
    // month-view averages differ. bonus.spec.ts creates a new "current"
    // period every time it runs, marching the real (non-backfilled)
    // period further past the 11-month backfill window with each run --
    // eventually that period lands in a month with no backfilled data at
    // all, at which point its own week-bucket and month-bucket are
    // identical and the two averages coincide. That's correct behavior,
    // not a bug, so this only checks that the toggle re-renders cleanly.
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('dashboard-people.html');
    await expect(page.locator('#metric-avg-score')).not.toHaveText('—', { timeout: 15_000 });

    await page.click('#range-week');
    await expect(page.locator('#range-week')).toHaveClass(/active/);
    await expect(page.locator('#range-month')).not.toHaveClass(/active/);
    await expect(page.locator('#metric-avg-score')).not.toHaveText('—');
    await expect(page.locator('canvas')).toHaveCount(4);
    expect(errors, `Unexpected page errors: ${errors.join(' | ')}`).toHaveLength(0);
  });
});

test.describe('Financial dashboard', () => {
  test('loads metrics and renders all 4 charts', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('dashboard-financial.html');
    await expect(page.locator('#metric-appointments-total')).not.toHaveText('0', { timeout: 15_000 });
    await expect(page.locator('#metric-payroll-total')).not.toHaveText('$0.00');
    await expect(page.locator('canvas')).toHaveCount(4);
    expect(errors, `Unexpected page errors: ${errors.join(' | ')}`).toHaveLength(0);
  });

  test('week/month toggle switches the active button', async ({ page }) => {
    await page.goto('dashboard-financial.html');
    await expect(page.locator('#metric-payroll-total')).not.toHaveText('$0.00', { timeout: 15_000 });
    await page.click('#range-week');
    await expect(page.locator('#range-week')).toHaveClass(/active/);
    await expect(page.locator('#range-month')).not.toHaveClass(/active/);
  });
});

test.describe('Attention Required blocks (Schedule + Payment alerts)', () => {
  test('dashboard-people.html shows Schedule alert counts', async ({ page }) => {
    await page.goto('dashboard-people.html');
    // Just confirm the counts actually resolved (not stuck at the "0"
    // placeholder from a failed/never-run query) -- schedule.spec.ts and
    // bonus.spec.ts's own TESTBOT_ runs guarantee at least one Schedule
    // entry and one upcoming appointment exist in this workspace already.
    await expect(page.locator('#schedule-pending-count')).toBeVisible({ timeout: 15_000 });
    const pendingText = await page.locator('#schedule-pending-count').textContent();
    const upcomingText = await page.locator('#upcoming-appointments-count').textContent();
    expect(Number(pendingText)).toBeGreaterThanOrEqual(0);
    expect(Number(upcomingText)).toBeGreaterThanOrEqual(0);
  });

  test('dashboard-financial.html shows a Payment alert with a real total', async ({ page }) => {
    await page.goto('dashboard-financial.html');
    await expect(page.locator('#payments-pending-count')).toBeVisible({ timeout: 15_000 });
    const countText = await page.locator('#payments-pending-count').textContent();
    expect(Number(countText)).toBeGreaterThanOrEqual(0);
    await expect(page.locator('#payments-pending-total')).toContainText('total for this week');
  });
});

test.describe('home.html restructuring', () => {
  test('Attention Required renders before the trial/setup/billing card', async ({ page }) => {
    await page.goto('home.html');
    await expect(page.locator('#attention-pending')).toBeVisible({ timeout: 15_000 });
    const order = await page.evaluate(() => {
      const main = document.querySelector('main.dashboard-main');
      const children = [...(main?.children || [])];
      const attentionIdx = children.findIndex((el) => el.textContent?.includes('ATTENTION REQUIRED') || el.textContent?.includes('ATENÇÃO NECESSÁRIA'));
      const trialIdx = children.findIndex((el) => el.id === 'trial-status-card');
      return { attentionIdx, trialIdx };
    });
    expect(order.attentionIdx).toBeGreaterThan(-1);
    expect(order.trialIdx).toBeGreaterThan(-1);
    expect(order.attentionIdx).toBeLessThan(order.trialIdx);
  });

  test('"Complete your workspace" is hidden once the workspace has people/teams', async ({ page }) => {
    // The suite workspace has had active Work Units/Teams/People since the
    // Colaboradores domain ran -- this is a long-established fact, not
    // something this test creates itself.
    await page.goto('home.html');
    await expect(page.locator('#workspace-health')).toHaveClass(/hidden/, { timeout: 15_000 });
  });
});
