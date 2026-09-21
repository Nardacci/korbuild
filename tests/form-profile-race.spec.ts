import { test, expect, type Page } from '@playwright/test';
import { STORAGE_STATE_PATH } from './config';

// Regression test for one class of bug: a form whose submit handler reads the
// company id (empresa_id) from a variable that is only filled once the user
// profile has loaded. Clicking Save before that happened posted
// `empresa_id: null` and the RLS policy answered 403 (seen on
// work-units-form.html, twice, in the E2E suite).
//
// The test is deterministic, not a race: it HOLDS the profile request
// (GET usuarios) until the test releases it, fills the form, clicks Save, and
// checks that
//   1. no write request leaves the page while the profile is still pending, and
//   2. once the profile is released, the write goes out with the real
//      empresa_id (never null).
// The write endpoint is intercepted and answered with a fake success, so the
// test creates NO data in the database.

test.use({ storageState: STORAGE_STATE_PATH });

const FAKE_ID = '00000000-0000-4000-8000-000000000001';

type FormCase = {
  name: string;
  path: string;
  save: string; // save button
  write: RegExp; // the request that persists the record
  isRpc: boolean;
  fill: (page: Page) => Promise<void>;
};

// Teams / People can only be saved after picking a Work Unit / Team, and those
// lists are filled AFTER the profile loads. To exercise the handler anyway, the
// test plants an option in the select, as if the lists had already loaded.
const plantOption = (page: Page, selectId: string) =>
  page.evaluate(
    ([id, value]) => {
      const select = document.getElementById(id) as HTMLSelectElement;
      select.innerHTML = `<option value="${value}" selected>planted</option>`;
      select.value = value;
    },
    [selectId, FAKE_ID],
  );

const FORMS: FormCase[] = [
  {
    name: 'work-units-form',
    path: 'work-units-form.html',
    save: '#save-unit',
    write: /\/rest\/v1\/unidades_trabalho/,
    isRpc: false,
    fill: async (page) => {
      await page.fill('#unit-name', 'TESTBOT_race_workunit');
    },
  },
  {
    name: 'teams-form',
    path: 'teams-form.html',
    save: '#save-team',
    write: /\/rest\/v1\/equipes/,
    isRpc: false,
    fill: async (page) => {
      await page.fill('#team-name', 'TESTBOT_race_team');
      await plantOption(page, 'team-work-unit');
    },
  },
  {
    name: 'people-form',
    path: 'people-form.html',
    save: '#save-person',
    write: /\/rest\/v1\/colaboradores/,
    isRpc: false,
    fill: async (page) => {
      await page.fill('#person-name', 'TESTBOT_race_person');
      await plantOption(page, 'person-team');
    },
  },
  {
    name: 'occurrence-form',
    path: 'occurrence-form.html',
    save: '#save-btn',
    write: /\/rest\/v1\/tipos_ocorrencia/,
    isRpc: false,
    fill: async (page) => {
      await page.fill('#name', 'TESTBOT_race_occurrence');
      await page.fill('#points', '1');
    },
  },
  {
    name: 'service-form',
    path: 'service-form.html',
    save: '#save-btn',
    write: /\/rest\/v1\/rpc\/criar_servico/,
    isRpc: true,
    fill: async (page) => {
      await page.fill('#nome', 'TESTBOT_race_service');
      await page.fill('#duracao', '30');
      await page.fill('#preco', '10');
    },
  },
  {
    name: 'customer-form',
    path: 'customer-form.html',
    save: '#save-btn',
    write: /\/rest\/v1\/rpc\/criar_cliente/,
    isRpc: true,
    fill: async (page) => {
      await page.fill('#nome', 'TESTBOT_race_client');
      await page.fill('#email', 'testbot.race@example.com');
    },
  },
];

for (const form of FORMS) {
  test(`${form.name}: Save waits for the profile (no write with empresa_id null)`, async ({ page }) => {
    let releaseProfile!: () => void;
    const gate = new Promise<void>((resolve) => (releaseProfile = resolve));
    let profileEmpresaId: string | null = null;

    // Hold every GET on usuarios (the profile lookup) until released.
    await page.route(/\/rest\/v1\/usuarios/, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await gate;
      const response = await route.fetch();
      try {
        const json = await response.json();
        const row = Array.isArray(json) ? json[0] : json;
        if (row?.empresa_id) profileEmpresaId = row.empresa_id;
      } catch {
        /* not JSON -- nothing to capture */
      }
      await route.fulfill({ response });
    });

    // Record the write and answer it with a fake success (nothing is stored).
    const writes: Record<string, unknown>[] = [];
    await page.route(form.write, async (route) => {
      const request = route.request();
      if (request.method() !== 'POST') return route.continue();
      writes.push(request.postDataJSON() ?? {});
      if (form.isRpc) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_ID) });
      } else {
        await route.fulfill({ status: 201, body: '' });
      }
    });

    await page.goto(form.path);
    await page.locator(form.save).waitFor({ state: 'visible' });
    await form.fill(page);
    await page.click(form.save);

    // Profile is still pending: nothing may have been sent.
    await page.waitForTimeout(1500);
    expect(writes, `${form.name} sent a write before the profile loaded: ${JSON.stringify(writes)}`).toEqual([]);

    // Release the profile: the write must now go out with the real company id.
    releaseProfile();
    await expect.poll(() => writes.length, { timeout: 15_000 }).toBe(1);
    expect(profileEmpresaId, 'profile lookup did not return an empresa_id').toBeTruthy();
    const sent = writes[0];
    const sentEmpresaId = (sent.empresa_id ?? sent.p_empresa_id) as string | null | undefined;
    expect(sentEmpresaId, `write body: ${JSON.stringify(sent)}`).toBe(profileEmpresaId);
  });
}
