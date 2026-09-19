-- Schedules mercadopago-reconcile's batch mode every 15 minutes, using the
-- same pg_cron + pg_net mechanism already live in this shared project for
-- daily-ai-insights/daily-exchange-rate-sync (KORbuild Finances).
--
-- Uses its OWN dedicated vault secret (mercadopago_reconcile_cron_secret),
-- NOT the shared 'cron_secret' those two jobs reference: live-tested
-- before writing this migration and found the shared CRON_SECRET Edge
-- Function secret and the vault 'cron_secret' value are currently out of
-- sync (even a net.http_post against the already-scheduled, "working"
-- compute-insights got 401 with vault's current 'cron_secret' value).
-- That's a separate, pre-existing bug in the shared Finances secret --
-- flagged separately, not fixed here, and not something this job should
-- risk inheriting by reusing the same name.
--
-- PREREQUISITE (the operator does this, not this migration -- both are
-- secret-store writes):
--   1. supabase secrets set MERCADOPAGO_RECONCILE_CRON_SECRET=<random value> --project-ref nowbohxeqwlddbfnukva
--   2. In the SQL editor (or via `supabase db query`), store the SAME
--      value in Vault:
--        select vault.create_secret('<the same random value>', 'mercadopago_reconcile_cron_secret');
--   Both values must match exactly, or every batch run will 401 the same
--   way the shared cron_secret currently does.

select cron.schedule(
  'mercadopago-reconcile-batch',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://nowbohxeqwlddbfnukva.supabase.co/functions/v1/mercadopago-reconcile',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'mercadopago_reconcile_cron_secret')
    ),
    body := jsonb_build_object('dry_run', false),
    timeout_milliseconds := 20000
  ) as request_id;
  $$
);
