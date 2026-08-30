/**
 * KORbuild Provisioning Service
 * Creates the application tenant after email confirmation.
 * Business provisioning is isolated from UI and authentication.
 */
(function (global) {
  'use strict';

  async function provisionTenant() {
    if (!global.supabase) throw new Error('Supabase client library is not loaded.');

    const client = global.supabase.createClient(
      'https://nowbohxeqwlddbfnukva.supabase.co',
      'sb_publishable_OTGYzEhQxckBa_8Xqu4Uog_Dm3RmTtD'
    );

    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    if (!sessionData.session) throw new Error('Your session is no longer available. Please sign in again.');

    const { data, error } = await client.rpc('provision_tenant');
    if (error) throw error;
    return data;
  }

  global.KORbuildProvisioning = Object.freeze({ provisionTenant });
})(window);