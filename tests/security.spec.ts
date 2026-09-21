import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';

// Negative security tests: prove that an ATTACK is blocked, not just that the
// legitimate flow works.
//
// These attacks can not be driven from the browser: the suite user (company A)
// has no way to read company B's IDs (RLS hides them), a signed-out or
// company-less caller has no page to click through, and creating a second
// company for the purpose would fire the subscription trigger and add a
// company to the billing / admin views. So the authoritative tests are SQL
// files under supabase/tests/. Each one impersonates the caller (JWT claims +
// role), fires every attack, requires the SPECIFIC rejection (a bare
// foreign-key or NOT NULL error would not prove the guard), runs a positive
// control, and ROLLS BACK -- no data is left behind.
//
// This spec runs those files through the Supabase CLI so they are part of the
// regular suite. It needs the CLI installed, logged in and linked to the
// project (supabase/.temp/project-ref), which is the case on the dev machine.
// A missing CLI skips the test with an explicit reason; any other failure --
// including "the attack was accepted" -- fails it.

const SQL_TESTS: { title: string; file: string }[] = [
  {
    // company A referencing a collaborator / client / service of company B
    title: 'cross-tenant related IDs are rejected by the RPCs',
    file: 'supabase/tests/cross_tenant_related_ids.sql',
  },
  {
    // anon / unprovisioned user / super-admin (get_current_empresa_id() IS NULL)
    // must be rejected by EVERY tenant-scoped RPC, and anon must have no EXECUTE
    // on them. The function list is enumerated from pg_proc, so a new RPC that
    // forgets the guard fails this test too.
    title: 'callers without a company (anon, unprovisioned, super-admin) are rejected by every tenant-scoped RPC',
    file: 'supabase/tests/anon_and_unprovisioned.sql',
  },
];

for (const { title, file } of SQL_TESTS) {
  test(`${title} (SQL negative test, rolled back)`, async () => {
    test.setTimeout(180_000);
    const run = spawnSync('supabase', ['db', 'query', '--linked', '-f', file], {
      encoding: 'utf8',
      shell: true, // supabase.cmd on Windows
      timeout: 150_000,
    });
    const output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;

    const cliMissing =
      run.error?.message?.includes('ENOENT') ||
      /not recognized as an internal or external command|command not found/i.test(output);
    test.skip(cliMissing, `Supabase CLI is not installed on this machine -- run ${file} manually.`);

    expect(run.status, `SQL negative test failed (${file}):\n${output}`).toBe(0);
    expect(output).not.toMatch(/FAIL/);
  });
}
