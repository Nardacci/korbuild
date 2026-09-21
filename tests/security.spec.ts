import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';

// Negative security tests: prove that an ATTACK is blocked, not just that the
// legitimate flow works.
//
// The attack -- a user of company A referencing a collaborator / client /
// service that belongs to company B through a SECURITY DEFINER RPC -- can not be
// driven from the browser: the suite user (company A) has no way to read
// company B's IDs (RLS hides them), and creating a second company for the
// purpose would fire the subscription trigger and add a company to the billing
// / admin views. So the authoritative test is SQL:
// supabase/tests/cross_tenant_related_ids.sql. It picks real foreign IDs at
// run time, impersonates the suite user (JWT claims + `authenticated` role),
// fires every attack, requires the specific "... not found in this company"
// error (a bare foreign-key error would not prove the ownership check), runs a
// positive control per RPC with the caller's own IDs, and ROLLS BACK -- no data
// is left behind.
//
// This spec just runs that file through the Supabase CLI so it is part of the
// regular suite. It needs the CLI installed, logged in and linked to the
// project (supabase/.temp/project-ref), which is the case on the dev machine.
// A missing CLI skips the test with an explicit reason; any other failure --
// including "the attack was accepted" -- fails it.

const SQL_FILE = 'supabase/tests/cross_tenant_related_ids.sql';

test('cross-tenant related IDs are rejected by the RPCs (SQL negative test, rolled back)', async () => {
  test.setTimeout(180_000);
  const run = spawnSync('supabase', ['db', 'query', '--linked', '-f', SQL_FILE], {
    encoding: 'utf8',
    shell: true, // supabase.cmd on Windows
    timeout: 150_000,
  });
  const output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;

  const cliMissing =
    run.error?.message?.includes('ENOENT') ||
    /not recognized as an internal or external command|command not found/i.test(output);
  test.skip(cliMissing, 'Supabase CLI is not installed on this machine -- run the SQL file manually.');

  expect(run.status, `SQL negative test failed:\n${output}`).toBe(0);
  expect(output).not.toMatch(/FAIL/);
});
