-- Schedules health-monitor every 20 minutes -- slightly more than
-- mercadopago-reconcile's 15-minute interval, so a reconcile run has
-- always had a chance to complete before health-monitor checks its
-- last-run timestamp. Same pg_cron + pg_net mechanism as
-- mercadopago-reconcile-batch (see 20260919121500_mercadopago_reconcile_cron.sql).
--
-- Uses its OWN dedicated vault secret (health_monitor_cron_secret), for
-- the same reason mercadopago-reconcile-batch does not reuse the shared
-- 'cron_secret': keeping each job's secret independent avoids inheriting
-- the pre-existing Vault/Edge-secret desync bug on the shared one.
--
-- PREREQUISITE (the operator does this, not this migration -- both are
-- secret-store writes):
--   1. supabase secrets set HEALTH_MONITOR_CRON_SECRET=<random value> --project-ref nowbohxeqwlddbfnukva
--   2. In the SQL editor (or via `supabase db query`), store the SAME
--      value in Vault:
--        select vault.create_secret('<the same random value>', 'health_monitor_cron_secret');
--   Both values must match exactly, or every run will 401.

select cron.schedule(
  'health-monitor-check',
  '*/20 * * * *',
  $$
  select net.http_post(
    url := 'https://nowbohxeqwlddbfnukva.supabase.co/functions/v1/health-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'health_monitor_cron_secret')
    ),
    body := jsonb_build_object('dry_run', false),
    timeout_milliseconds := 20000
  ) as request_id;
  $$
);
