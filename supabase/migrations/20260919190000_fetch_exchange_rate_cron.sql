-- Schedules fetch-exchange-rate once a day, well after BCB PTAX's ~1pm BRT
-- publish time, so the day's own rate is available immediately (falls back
-- to the latest prior business day's rate regardless, via the trailing-window
-- query in the function itself). Same pg_cron + pg_net mechanism as
-- mercadopago-reconcile-batch / health-monitor-check.
--
-- Uses its own dedicated vault secret (fetch_exchange_rate_cron_secret),
-- for the same reason those two jobs do not reuse the shared 'cron_secret'.
--
-- PREREQUISITE (the operator does this, not this migration -- both are
-- secret-store writes):
--   1. supabase secrets set FETCH_EXCHANGE_RATE_CRON_SECRET=<random value> --project-ref nowbohxeqwlddbfnukva
--   2. In the SQL editor (or via `supabase db query`), store the SAME
--      value in Vault:
--        select vault.create_secret('<the same random value>', 'fetch_exchange_rate_cron_secret');
--   Both values must match exactly, or every run will 401.

select cron.schedule(
  'fetch-exchange-rate-daily',
  '0 17 * * *', -- 17:00 UTC = 14:00 BRT (BRT is UTC-3, no DST since 2019)
  $$
  select net.http_post(
    url := 'https://nowbohxeqwlddbfnukva.supabase.co/functions/v1/fetch-exchange-rate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'fetch_exchange_rate_cron_secret')
    ),
    body := jsonb_build_object('dry_run', false),
    timeout_milliseconds := 20000
  ) as request_id;
  $$
);
