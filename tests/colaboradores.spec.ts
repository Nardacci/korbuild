import { test, expect, Page } from '@playwright/test';
import { STORAGE_STATE_PATH, testbotName, assertTestbotName } from './config';

// Colaboradores domain: Work Units -> Teams -> People, in that dependency
// order (a Team requires an active Work Unit, a Person requires an active
// Team -- confirmed by reading work-units-form.html/teams-form.html/
// people-form.html). Deactivation is tested in the REVERSE order for the
// same reason: work-units.js and teams.js both refuse to deactivate a
// parent that still has active children (confirmed by reading
// toggleUnit()/toggleTeam()), so Person must be deactivated before Team,
// and Team before Work Unit.
//
// IMPORTANT, confirmed by reading people.js/teams.js/work-units.js: none of
// these three list pages have a real "delete" action -- only "Edit" and
// "Activate/Deactivate" (data-action="toggle"), which flips a boolean
// `active`/`status` column. There is no UI path that removes a row from
// the database. This test suite therefore exercises create -> edit ->
// deactivate instead of create -> edit -> delete, and this gap is called
// out in the domain report rather than worked around by deleting rows
// directly via SQL (that would not be "testing like a real user would").
// The TESTBOT_ rows are left in place, deactivated, for manual cleanup.
//
// assertTestbotName() is still called before every deactivate step, even
// though this isn't a destructive delete, as the cheapest possible extra
// guardrail against ever touching a non-TESTBOT_ row.

test.describe.configure({ mode: 'serial' });
test.use({ storageState: STORAGE_STATE_PATH });

const workUnitName = testbotName('WorkUnit');
const workUnitCode = `TB-${Date.now()}`; // unidades_trabalho.code has a unique constraint -- must differ across reruns.
const teamName = testbotName('Team');
const personName = testbotName('Person');

async function rowActionButton(page: Page, bodyId: string, rowName: string, action: 'edit' | 'toggle') {
  const row = page.locator(`#${bodyId} tr`, { hasText: rowName });
  await expect(row).toHaveCount(1, { timeout: 10_000 });
  const nameCell = row.locator('td').first();
  await expect(nameCell).toContainText(rowName);
  assertTestbotName((await nameCell.textContent())?.trim());
  return row.locator(`button[data-action="${action}"]`);
}

test('create Work Unit', async ({ page }) => {
  await page.goto('work-units-form.html');
  await page.fill('#unit-name', workUnitName);
  await page.fill('#unit-code', workUnitCode);
  await page.click('#save-unit');
  await page.waitForURL(/work-units\.html/, { timeout: 10_000 });
  await expect(page.locator('#units-body')).toContainText(workUnitName, { timeout: 10_000 });
});

test('create Team (linked to the TESTBOT_ Work Unit)', async ({ page }) => {
  await page.goto('teams-form.html');
  await page.fill('#team-name', teamName);
  await page.selectOption('#team-work-unit', { label: workUnitName });
  await page.click('#save-team');
  await page.waitForURL(/teams\.html/, { timeout: 10_000 });
  await expect(page.locator('#teams-body')).toContainText(teamName, { timeout: 10_000 });
});

test('create Person (linked to the TESTBOT_ Team)', async ({ page }) => {
  await page.goto('people-form.html');
  await page.fill('#person-name', personName);
  await page.selectOption('#person-team', { label: teamName });
  await page.fill('#person-specialty', 'TESTBOT Specialty');
  await page.click('#save-person');
  await page.waitForURL(/people\.html/, { timeout: 10_000 });
  await expect(page.locator('#people-body')).toContainText(personName, { timeout: 10_000 });
});

test('edit Person', async ({ page }) => {
  await page.goto('people.html');
  const editBtn = await rowActionButton(page, 'people-body', personName, 'edit');
  await editBtn.click();
  await page.waitForURL(/people-form\.html\?id=/, { timeout: 10_000 });
  await expect(page.locator('#person-name')).toHaveValue(personName, { timeout: 10_000 });
  await page.fill('#person-specialty', 'TESTBOT Specialty (edited)');
  await page.click('#save-person');
  await page.waitForURL(/people\.html/, { timeout: 10_000 });
  await expect(page.locator('#people-body')).toContainText('TESTBOT Specialty (edited)', { timeout: 10_000 });
});

test('edit Team', async ({ page }) => {
  await page.goto('teams.html');
  const editBtn = await rowActionButton(page, 'teams-body', teamName, 'edit');
  await editBtn.click();
  await page.waitForURL(/teams-form\.html\?id=/, { timeout: 10_000 });
  await expect(page.locator('#team-name')).toHaveValue(teamName, { timeout: 10_000 });
  const editedTeamName = `${teamName}_edited`;
  await page.fill('#team-name', editedTeamName);
  await page.click('#save-team');
  await page.waitForURL(/teams\.html/, { timeout: 10_000 });
  await expect(page.locator('#teams-body')).toContainText(editedTeamName, { timeout: 10_000 });
});

test('edit Work Unit', async ({ page }) => {
  await page.goto('work-units.html');
  const editBtn = await rowActionButton(page, 'units-body', workUnitName, 'edit');
  await editBtn.click();
  await page.waitForURL(/work-units-form\.html\?id=/, { timeout: 10_000 });
  await expect(page.locator('#unit-name')).toHaveValue(workUnitName, { timeout: 10_000 });
  const editedUnitName = `${workUnitName}_edited`;
  await page.fill('#unit-name', editedUnitName);
  await page.click('#save-unit');
  await page.waitForURL(/work-units\.html/, { timeout: 10_000 });
  await expect(page.locator('#units-body')).toContainText(editedUnitName, { timeout: 10_000 });
});

test('deactivate Person (no real delete exists in the UI -- see file header)', async ({ page }) => {
  await page.goto('people.html');
  const toggleBtn = await rowActionButton(page, 'people-body', personName, 'toggle');
  await expect(toggleBtn).toHaveText('Deactivate');
  await toggleBtn.click();
  await expect(page.locator('#message')).toContainText('inactive', { timeout: 10_000 });
});

test('deactivate Team (now that its only Person is inactive)', async ({ page }) => {
  const editedTeamName = `${teamName}_edited`;
  await page.goto('teams.html');
  const toggleBtn = await rowActionButton(page, 'teams-body', editedTeamName, 'toggle');
  await expect(toggleBtn).toHaveText('Deactivate');
  await toggleBtn.click();
  await expect(page.locator('#message')).not.toContainText('Cannot deactivate', { timeout: 10_000 });
});

test('deactivate Work Unit (now that its only Team is inactive)', async ({ page }) => {
  const editedUnitName = `${workUnitName}_edited`;
  await page.goto('work-units.html');
  const toggleBtn = await rowActionButton(page, 'units-body', editedUnitName, 'toggle');
  await expect(toggleBtn).toHaveText('Deactivate');
  await toggleBtn.click();
  await expect(page.locator('#message')).not.toContainText('Cannot deactivate', { timeout: 10_000 });
});
