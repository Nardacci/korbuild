import { test, expect } from '@playwright/test';
import { STORAGE_STATE_PATH, testbotName, assertTestbotName } from './config';

// Customer Service > Services catalog (servicos_catalogo): create, edit
// (via atualizar_servico RPC), deactivate (no real delete in the UI --
// same pattern as People/Teams/Work Units/Occurrences).

test.describe.configure({ mode: 'serial' });
test.use({ storageState: STORAGE_STATE_PATH });

const serviceName = testbotName('CatalogService');

test('create Service', async ({ page }) => {
  await page.goto('service-form.html');
  await page.fill('#nome', serviceName);
  await page.fill('#duracao', '45');
  await page.fill('#preco', '99.90');
  await page.click('#save-btn');
  await page.waitForURL(/services\.html/, { timeout: 10_000 });
  await expect(page.locator('#services-body')).toContainText(serviceName, { timeout: 10_000 });
  const row = page.locator('#services-body tr', { hasText: serviceName });
  await expect(row).toContainText('45 min');
  await expect(row).toContainText('99.90');
});

test('edit Service', async ({ page }) => {
  await page.goto('services.html');
  const row = page.locator('#services-body tr', { hasText: serviceName });
  await expect(row).toHaveCount(1, { timeout: 10_000 });
  assertTestbotName((await row.locator('.team-name').textContent())?.trim());
  await row.locator('a.small-btn', { hasText: 'Edit' }).click();
  await page.waitForURL(/service-form\.html\?id=/, { timeout: 10_000 });
  await expect(page.locator('#nome')).toHaveValue(serviceName, { timeout: 10_000 });
  await page.fill('#preco', '120');
  await page.click('#save-btn');
  await page.waitForURL(/services\.html/, { timeout: 10_000 });
  const editedRow = page.locator('#services-body tr', { hasText: serviceName });
  await expect(editedRow).toContainText('120.00', { timeout: 10_000 });
});

test('deactivate Service (no real delete exists in the UI)', async ({ page }) => {
  await page.goto('services.html');
  const row = page.locator('#services-body tr', { hasText: serviceName });
  await expect(row).toHaveCount(1, { timeout: 10_000 });
  const toggleBtn = row.locator('button[data-action="toggle"]');
  await expect(toggleBtn).toHaveText('Deactivate');
  await toggleBtn.click();
  await expect(page.locator('#message')).toContainText('inactive', { timeout: 10_000 });
});
