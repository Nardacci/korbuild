import { test, expect, Page } from '@playwright/test';
import { STORAGE_STATE_PATH, testbotName, assertTestbotName } from './config';

// Bonus domain: Occurrences (the catalog of occurrence TYPES, e.g. "Late
// arrival" worth -5 points), Periods (weekly evaluation windows inside the
// workspace's Bonus Cycle), and Evaluations (per-person, per-period score
// sheets, auto-seeded from active People x active Occurrence types when a
// Period is prepared).
//
// Scope findings from reading the source before writing this suite (same
// approach as colaboradores.spec.ts):
//  - Occurrences: only "Edit" and "Activate/Deactivate" exist (occurrences.js)
//    -- no real delete, same pattern as People/Teams/Work Units.
//  - Periods: NO edit exists at all. The only actions are "Prepare Next
//    Period" (create, auto-numbered, no name field) and, conditionally,
//    "Delete" -- and periods.js's renderPeriods() only ever offers Delete
//    on the SINGLE most-recent OPEN period (`canDelete = open && p.id ===
//    latest.id`). This directly answers the task's safety question: the
//    UI makes it structurally impossible to delete a period that has
//    already been superseded by a later one (i.e. one whose evaluations
//    may already have fed into a bonus settlement) -- as soon as a newer
//    period is prepared, the older one's Delete action disappears. This
//    suite demonstrates that guardrail live (see 'Periods' describe block)
//    rather than trying to force a deletion the UI itself refuses to offer.
//  - Evaluations: NO manual "create" exists. Launches (one per active,
//    eligible person) and their occurrence rows are auto-seeded by the
//    `prepare_period_evaluations` RPC when a period is prepared. The UI
//    only supports editing the pre-seeded quantities and saving. So
//    "create and edit" for Evaluations is exercised as "prepare a period
//    (which creates the evaluation) and edit its quantities".
//
// Prerequisite data: the Colaboradores suite left its Work Unit/Team/Person
// deactivated (see colaboradores.spec.ts), and Periods requires at least
// one ACTIVE Team and one ACTIVE Person to unlock. This suite creates its
// own dedicated, active Work Unit/Team/Person instead of reactivating the
// Colaboradores ones, so it doesn't disturb that already-reported state.
// These are intentionally left ACTIVE at the end (deactivating them would
// also deactivate the Period/Evaluation data this suite created, which
// defeats the point of leaving it for review).

test.describe.configure({ mode: 'serial' });
test.use({ storageState: STORAGE_STATE_PATH });

const workUnitName = testbotName('Bonus_WorkUnit');
const teamName = testbotName('Bonus_Team');
const personName = testbotName('Bonus_Person');
const occurrenceName = testbotName('Occurrence');

async function assertRowNameThen(page: Page, bodyId: string, rowName: string) {
  const row = page.locator(`#${bodyId} tr`, { hasText: rowName });
  await expect(row).toHaveCount(1, { timeout: 10_000 });
  const nameCell = row.locator('td').first();
  assertTestbotName((await nameCell.textContent())?.trim());
  return row;
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
  });
});

test.describe('Occurrences (occurrence-type catalog)', () => {
  test('create Occurrence', async ({ page }) => {
    await page.goto('occurrence-form.html');
    await page.fill('#name', occurrenceName);
    await page.fill('#points', '10');
    await page.selectOption('#occurrence-type', 'POSITIVA');
    await page.click('#save-btn');
    await page.waitForURL(/occurrences\.html/, { timeout: 10_000 });
    await expect(page.locator('#occurrences-body')).toContainText(occurrenceName, { timeout: 10_000 });
  });

  test('edit Occurrence', async ({ page }) => {
    await page.goto('occurrences.html');
    const row = await assertRowNameThen(page, 'occurrences-body', occurrenceName);
    await row.locator('a.small-btn', { hasText: 'Edit' }).click();
    await page.waitForURL(/occurrence-form\.html\?id=/, { timeout: 10_000 });
    await expect(page.locator('#name')).toHaveValue(occurrenceName, { timeout: 10_000 });
    await page.fill('#points', '15');
    await page.click('#save-btn');
    await page.waitForURL(/occurrences\.html/, { timeout: 10_000 });
    const editedRow = page.locator('#occurrences-body tr', { hasText: occurrenceName });
    await expect(editedRow).toContainText('15', { timeout: 10_000 });
  });
});

// Week numbers are NOT reset per bonus cycle test run -- they're sequential
// across every period ever created for this cycle (see periods.js's
// weekNumber = max(existing)+1 logic). With 11 months of history backfilled
// into this same workspace, "the period this test creates" is never
// actually "Week 1" -- it's whatever comes next. These are captured live
// from the UI instead of hardcoded.
let firstWeekLabel = '';
let secondWeekLabel = '';

test.describe('Periods (auto-numbered, no name field, no edit -- see file header)', () => {
  test('prepare Period 1 (create)', async ({ page }) => {
    await page.goto('periods.html');
    // #prepare-btn isn't disabled by default in the HTML -- it's only
    // disabled once load() detects a genuine blocker (no active Team/
    // Person, or no Bonus Cycle). So waiting on its enabled state races
    // load()'s async profile/config/cycle fetch. Wait for the cycle name
    // to actually render instead.
    await expect(page.locator('#cycle-name')).toHaveText('Annual Performance', { timeout: 10_000 });
    await page.click('#prepare-btn');
    const messageLocator = page.locator('#message');
    await expect(messageLocator).toContainText('Period ready', { timeout: 15_000 });
    // showMessage() fires BEFORE prepareNextPeriod()'s awaited load() call
    // finishes re-rendering the table, so a one-shot read of the "first"
    // row right after the message appears can catch a stale render. The
    // success message embeds the new period's own start/end date range
    // (from the just-inserted row, not from a re-render) -- match the
    // table row on that exact text instead, and let Playwright's
    // auto-retrying locator wait however long the re-render actually takes.
    const dateRange = (await messageLocator.textContent())?.match(/Period ready: (.+?) · \d/)?.[1]?.trim();
    if (!dateRange) throw new Error(`Could not parse a date range out of the success message.`);
    const row = page.locator('#period-list tr', { hasText: dateRange });
    await expect(row).toHaveCount(1, { timeout: 10_000 });
    firstWeekLabel = (await row.locator('strong').first().textContent())?.trim() || '';
    expect(firstWeekLabel).toMatch(/^Week \d+$/);
    await expect(row.locator('button.delete-period-btn')).toBeVisible({ timeout: 10_000 });
  });

  test('Period 2 supersedes Period 1: Period 1 loses its Delete action', async ({ page }) => {
    await page.goto('periods.html');
    await expect(page.locator('#cycle-name')).toHaveText('Annual Performance', { timeout: 10_000 });
    await page.click('#prepare-btn');
    const messageLocator = page.locator('#message');
    await expect(messageLocator).toContainText('Period ready', { timeout: 15_000 });
    const dateRange = (await messageLocator.textContent())?.match(/Period ready: (.+?) · \d/)?.[1]?.trim();
    if (!dateRange) throw new Error(`Could not parse a date range out of the success message.`);
    const newRow = page.locator('#period-list tr', { hasText: dateRange });
    await expect(newRow).toHaveCount(1, { timeout: 10_000 });
    secondWeekLabel = (await newRow.locator('strong').first().textContent())?.trim() || '';
    expect(secondWeekLabel).toMatch(/^Week \d+$/);
    expect(secondWeekLabel).not.toBe(firstWeekLabel);

    const week1Row = page.locator('#period-list tr', { hasText: firstWeekLabel });
    await expect(week1Row.locator('button.delete-period-btn')).toHaveCount(0);
    await expect(week1Row).toContainText('—');

    const week2Row = page.locator('#period-list tr', { hasText: secondWeekLabel });
    await expect(week2Row.locator('button.delete-period-btn')).toBeVisible();
  });

  test('delete Period 2 (the only period the UI allows deleting)', async ({ page }) => {
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto('periods.html');
    const week2Row = page.locator('#period-list tr', { hasText: secondWeekLabel });
    await week2Row.locator('button.delete-period-btn').click();
    await expect(page.locator('#message')).toContainText(`${secondWeekLabel} deleted successfully`, { timeout: 10_000 });
    await expect(page.locator('#period-list')).not.toContainText(secondWeekLabel, { timeout: 10_000 });
    // Week 1 -- already used by an Evaluation -- must still be there, undeleted.
    await expect(page.locator('#period-list')).toContainText(firstWeekLabel, { timeout: 10_000 });
  });
});

test.describe('Evaluations (auto-seeded by Period preparation, edit only -- see file header)', () => {
  test('edit the TESTBOT person\'s evaluation for the newly-created period', async ({ page }) => {
    await page.goto('evaluations.html');
    await expect(page.locator('#current-period')).toContainText(firstWeekLabel, { timeout: 10_000 });
    const row = await assertRowNameThen(page, 'people-body', personName);
    await row.locator('button[data-action="edit"]').click();
    await expect(page.locator('#evaluation-area')).toContainText(occurrenceName, { timeout: 10_000 });
    // The Occurrence's points were edited to 15 earlier in this file (see
    // the "edit Occurrence" test), and prepare_period_evaluations() seeds
    // each occurrence row with the type's points value *at prep time* --
    // so 2 x 15 = 30 here, not 2 x the original 10.
    const qtyInput = page.locator('.eval-table .qty').first();
    await qtyInput.fill('2');
    await qtyInput.dispatchEvent('input');
    await expect(page.locator('#total-score')).toContainText('30', { timeout: 5_000 });
    await page.click('#save-btn');
    await expect(page.locator('#message')).toContainText('Evaluation saved successfully', { timeout: 10_000 });
    const listRow = page.locator('#people-body tr', { hasText: personName });
    await expect(listRow).toContainText('30 pts', { timeout: 10_000 });
  });
});
