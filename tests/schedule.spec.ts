import { test, expect } from '@playwright/test';
import { STORAGE_STATE_PATH, testbotName, assertTestbotName } from './config';

// Schedule domain: internal Schedule (schedule.html/schedule-form.html) and
// Customer Service (customer-schedule.html calendar, customers.html,
// customer-appointment-form.html).
//
// Scope finding from reading schedule.js before writing this suite: the
// Schedule list page has NO edit and NO delete action for any entry --
// only "Approve"/"Reject", and only for an admin, and only while an entry
// is still 'pendente'. Reading criar_escala()'s SQL confirms a type with
// requer_aprovacao = false (Shift/Commitment, seeded by
// garantir_tipos_escala_padrao) goes straight to status 'confirmado' and
// therefore NEVER shows any action button at all. So, per the task's own
// instruction to pick a non-approval type specifically to avoid depending
// on another admin, this test creates a Shift entry and then has nothing
// left to edit or delete through the UI -- that's not a gap in this test,
// it's the entire capability surface of this page. Reported as-is.
//
// Customer Service, by contrast, has real create/edit for Clients and a
// real drag-to-reschedule + cancel flow for Appointments (customer-
// schedule.js's handleReschedule()/cancelAppointment(), backed by the
// mover_agendamento/cancelar_agendamento RPCs) -- that part is exercised
// close to how the task asked.

test.describe.configure({ mode: 'serial' });
test.use({ storageState: STORAGE_STATE_PATH });

const workUnitName = testbotName('Sched_WorkUnit');
const teamName = testbotName('Sched_Team');
const personName = testbotName('Sched_Person');
const clientName = testbotName('Client');
const clientEmail = `${clientName.toLowerCase()}@example.com`;
const serviceName = testbotName('Service');

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
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

test.describe('Schedule (internal): create a no-approval entry', () => {
  test('create a Shift entry for the TESTBOT person', async ({ page }) => {
    await page.goto('schedule-form.html');
    await page.selectOption('#colaborador-id', { label: personName });
    await page.selectOption('#tipo-escala-id', { label: 'Shift' });
    await expect(page.locator('#approval-hint')).toBeHidden();
    const today = todayIso();
    await page.fill('#data-inicio', today);
    await page.fill('#data-fim', today);
    await page.fill('#hora-inicio', '08:00');
    await page.fill('#hora-fim', '17:00');
    await page.click('#save-btn');
    await page.waitForURL(/schedule\.html/, { timeout: 10_000 });
    const row = page.locator('#schedule-body tr', { hasText: personName });
    await expect(row).toHaveCount(1, { timeout: 10_000 });
    await expect(row).toContainText('Confirmed', { timeout: 10_000 });
    // Confirms the finding above: a confirmed entry has no action buttons
    // at all (no Edit, no Delete, no Approve/Reject) -- nothing further to
    // exercise here through the UI.
    await expect(row.locator('button')).toHaveCount(0);
  });
});

test.describe('Customer Service: Clients', () => {
  test('create Client', async ({ page }) => {
    await page.goto('customer-form.html');
    await page.fill('#nome', clientName);
    await page.fill('#email', clientEmail);
    await page.fill('#telefone', '+1 555 0100');
    await page.click('#save-btn');
    await page.waitForURL(/customers\.html/, { timeout: 10_000 });
    await expect(page.locator('#clients-body')).toContainText(clientName, { timeout: 10_000 });
  });

  test('edit Client', async ({ page }) => {
    await page.goto('customers.html');
    const row = page.locator('#clients-body tr', { hasText: clientName });
    await expect(row).toHaveCount(1, { timeout: 10_000 });
    assertTestbotName((await row.locator('td').first().textContent())?.trim());
    await row.locator('a.small-btn', { hasText: 'Edit' }).click();
    await page.waitForURL(/customer-form\.html\?id=/, { timeout: 10_000 });
    await expect(page.locator('#nome')).toHaveValue(clientName, { timeout: 10_000 });
    await page.fill('#telefone', '+1 555 0199');
    await page.click('#save-btn');
    await page.waitForURL(/customers\.html/, { timeout: 10_000 });
    const editedRow = page.locator('#clients-body tr', { hasText: clientName });
    await expect(editedRow).toContainText('+1 555 0199', { timeout: 10_000 });
  });
});

test.describe('Customer Service: Appointments (calendar)', () => {
  test('create Appointment for today (with a new TESTBOT service)', async ({ page }) => {
    await page.goto('customer-appointment-form.html');
    await page.selectOption('#cliente-id', { label: clientName });
    await page.click('#toggle-new-service');
    await page.fill('#new-service-nome', serviceName);
    await page.fill('#new-service-duracao', '60');
    await page.selectOption('#colaborador-id', { label: personName });
    await page.fill('#data', todayIso());
    await page.fill('#hora-inicio', '10:00');
    await page.fill('#hora-fim', '11:00');
    await page.click('#save-btn');
    await page.waitForURL(/customer-schedule\.html/, { timeout: 10_000 });
  });

  test('drag the appointment to a new time', async ({ page }) => {
    await page.goto('customer-schedule.html');
    const event = page.locator('.fc-event', { hasText: clientName });
    await expect(event).toHaveCount(1, { timeout: 15_000 });
    const box = await event.boundingBox();
    if (!box) throw new Error('Could not read the appointment event\'s bounding box.');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // Several intermediate moves: FullCalendar's drag detection needs real
    // pointermove steps, not a single jump, to register as a drag instead
    // of a click.
    for (let i = 1; i <= 5; i++) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + i * 40, { steps: 5 });
    }
    await page.mouse.up();
    await expect(page.locator('#message')).toContainText('Appointment moved successfully', { timeout: 10_000 });
  });

  test('cancel the appointment', async ({ page }) => {
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto('customer-schedule.html');
    const event = page.locator('.fc-event', { hasText: clientName });
    await expect(event).toHaveCount(1, { timeout: 15_000 });
    await event.click();
    await expect(page.locator('#detail-modal')).toHaveClass(/open/, { timeout: 10_000 });
    assertTestbotName(await page.locator('#detail-client').textContent());
    await page.click('#detail-cancel-appointment');
    await expect(page.locator('#message')).toContainText('Appointment cancelled', { timeout: 10_000 });
  });
});
