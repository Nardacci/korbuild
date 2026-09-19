-- Health monitor support: a SECURITY DEFINER snapshot RPC (cron.job_run_details
-- lives in the `cron` schema, which isn't exposed over PostgREST/REST API, so
-- health-monitor can't query it with the normal client -- this function reads
-- it internally and returns a plain jsonb summary) plus a small table to
-- avoid re-alerting on the same problem within the cooldown window.

CREATE TABLE IF NOT EXISTS public.health_alerts_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  details jsonb
);
CREATE INDEX IF NOT EXISTS idx_health_alerts_sent_type_sent_at ON public.health_alerts_sent (alert_type, sent_at DESC);
ALTER TABLE public.health_alerts_sent ENABLE ROW LEVEL SECURITY;
-- No policies granted: only the health-monitor Edge Function (service_role,
-- which bypasses RLS entirely) ever reads or writes this table.

CREATE OR REPLACE FUNCTION public.get_health_monitor_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reconcile_cron jsonb;
  v_recent_errors jsonb;
  v_stale_setup_pending jsonb;
  v_stale_preapprovals jsonb;
begin
  -- (a) Most recent run of the mercadopago-reconcile-batch cron job.
  -- NOTE: cron.job_run_details' status only reflects whether the
  -- net.http_post *dispatch* succeeded (pg_net is fire-and-forget), not
  -- whether the downstream Edge Function itself returned 2xx -- this is a
  -- known, pre-existing limitation, not something this function can see
  -- past, and matches exactly what was asked for (last run time + status).
  select jsonb_build_object(
    'last_run_at', jrd.start_time,
    'last_status', jrd.status,
    'minutes_since', round((extract(epoch from (timezone('utc', now()) - jrd.start_time)) / 60.0)::numeric, 1)
  )
  into v_reconcile_cron
  from cron.job j
  join cron.job_run_details jrd on jrd.jobid = j.jobid
  where j.jobname = 'mercadopago-reconcile-batch'
  order by jrd.start_time desc
  limit 1;

  -- (b) Recent failures in the last 20 minutes. payment_events covers both
  -- mercadopago-webhook and mercadopago-checkout (both log error_message
  -- there); lembretes_enviados covers send-appointment-reminders.
  -- mercadopago-reconcile itself has no equivalent per-invocation error log
  -- separate from its own cron dispatch status, already covered by (a).
  select jsonb_build_object(
    'payment_events', (
      select count(*) from public.payment_events
      where error_message is not null and created_at > timezone('utc', now()) - interval '20 minutes'
    ),
    'lembretes_enviados', (
      select count(*) from public.lembretes_enviados
      where status_envio = 'falhou' and criado_em > timezone('utc', now()) - interval '20 minutes'
    )
  )
  into v_recent_errors;

  -- (c1) Setup fee still PENDING more than 2 hours after the subscription
  -- row was created. Excludes subscriptions whose overall status already
  -- resolved to ACTIVE/CANCELLED/SUSPENDED (e.g. manually activated by a
  -- super admin without ever touching setup_status) -- those aren't a
  -- live problem even though the field itself is stale.
  select coalesce(jsonb_agg(jsonb_build_object(
    'empresa_id', s.empresa_id,
    'created_at', s.created_at,
    'hours_pending', round((extract(epoch from (timezone('utc', now()) - s.created_at)) / 3600.0)::numeric, 1)
  )), '[]'::jsonb)
  into v_stale_setup_pending
  from public.subscriptions s
  where s.setup_status = 'PENDING'
    and s.created_at < timezone('utc', now()) - interval '2 hours'
    and s.status not in ('ACTIVE', 'CANCELLED', 'SUSPENDED');

  -- (c2) A Preapproval (monthly subscription) checkout was created more
  -- than 2 hours ago but never got reconciled (no provider_subscription_id
  -- yet, or subscription status never reached ACTIVE/PAST_DUE/CANCELLED) --
  -- suggests both the signed webhook and the reconciliation cron missed it.
  -- Only the most recent subscription_checkout_created event per company
  -- is considered, so an old event doesn't keep alerting after a retry.
  select coalesce(jsonb_agg(jsonb_build_object(
    'empresa_id', pe.empresa_id,
    'event_created_at', pe.created_at,
    'hours_since', round((extract(epoch from (timezone('utc', now()) - pe.created_at)) / 3600.0)::numeric, 1)
  )), '[]'::jsonb)
  into v_stale_preapprovals
  from public.payment_events pe
  join public.subscriptions s on s.empresa_id = pe.empresa_id
  where pe.event_type = 'subscription_checkout_created'
    and pe.created_at < timezone('utc', now()) - interval '2 hours'
    and (s.provider_subscription_id is null or s.status not in ('ACTIVE', 'PAST_DUE', 'CANCELLED'))
    and pe.created_at = (
      select max(pe2.created_at) from public.payment_events pe2
      where pe2.empresa_id = pe.empresa_id and pe2.event_type = 'subscription_checkout_created'
    );

  return jsonb_build_object(
    'generated_at', timezone('utc', now()),
    'reconcile_cron', coalesce(v_reconcile_cron, jsonb_build_object('last_run_at', null, 'last_status', null, 'minutes_since', null)),
    'recent_errors', v_recent_errors,
    'stale_setup_pending', v_stale_setup_pending,
    'stale_preapprovals', v_stale_preapprovals
  );
end;
$function$;

-- Global, cross-tenant health data -- not something a regular signed-in
-- company user should ever be able to call. Only service_role (used
-- internally by the health-monitor Edge Function) may execute it.
REVOKE EXECUTE ON FUNCTION public.get_health_monitor_snapshot() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_health_monitor_snapshot() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_health_monitor_snapshot() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_health_monitor_snapshot() TO service_role;
