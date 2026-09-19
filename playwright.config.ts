import { defineConfig, devices } from '@playwright/test';

// KORbuild has no staging environment -- this suite runs against the real
// GitHub Pages production site, backed by the real Supabase database.
// See tests/README.md for the safety rules this depends on: every record
// these tests create is prefixed "TESTBOT_", every delete test double-checks
// that prefix before deleting anything, and no test ever touches
// pre-existing data (the "testando" company, the manual test users, etc.).
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // serial by design: shared production DB, one domain at a time.
  workers: 1,
  retries: 0, // no silent retries against production -- a flaky run should be visible, not hidden.
  reporter: [['list']],
  use: {
    baseURL: 'https://nardacci.github.io/korbuild/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
