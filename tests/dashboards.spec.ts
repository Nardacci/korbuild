import { test, expect } from '@playwright/test';
import { STORAGE_STATE_PATH } from './config';

// Dashboards domain: the 3-way switcher (Visão Geral / Pessoas & Operação /
// Financeiro) and the two new analytics dashboards built on top of the
// 11-month historical backfill for the suite workspace. Read-only --
// nothing here creates, edits or deletes data, so the TESTBOT_ naming
// safety gate doesn't apply to this file.

test.describe.configure({ mode: 'serial' });
test.use({ storageState: STORAGE_STATE_PATH });

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
