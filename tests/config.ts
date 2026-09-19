// Shared identity for the dedicated E2E test-suite user and its workspace.
// This is NOT the "testando" company (empresa_id 85db1564-cb16-4506-94a8-
// 399bf1f3fd68, already has an active Mercado Pago subscription) -- this is
// its own separate account, created by tests/setup/01-signup.spec.ts,
// specifically so this suite never has to touch "testando" or any other
// pre-existing data. See tests/README.md for the full safety rules.
export const SUITE_USER = {
  email: 'korbuild.e2e.suite@testuser.com',
  password: 'KORbuildE2E!2026Suite',
  fullName: 'TESTBOT E2E Suite User',
  companyName: 'TESTBOT_E2E_Suite_Company',
};

// Every record any test creates must use this prefix -- enforced by
// assertTestbotName() below, not just a convention.
export const TESTBOT_PREFIX = 'TESTBOT_';

export function testbotName(label: string): string {
  return `${TESTBOT_PREFIX}${label}_${Date.now()}`;
}

// Hard safety gate: call this immediately before ANY delete action in ANY
// test. Throws (aborting the test) instead of proceeding if the name
// doesn't carry the TESTBOT_ prefix -- this is the "dupla checagem" the
// task required, enforced in code, not just by convention.
export function assertTestbotName(name: string | null | undefined): void {
  if (!name || !name.startsWith(TESTBOT_PREFIX)) {
    throw new Error(
      `Refusing to delete a record whose name does not start with "${TESTBOT_PREFIX}": ${JSON.stringify(name)}`,
    );
  }
}

export const STORAGE_STATE_PATH = 'tests/.auth/suite-user.json';
