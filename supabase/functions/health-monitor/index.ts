// KORbuild · health-monitor
//
// Runs on a schedule (every 20 minutes, a bit more than the 15-minute
// mercadopago-reconcile interval for tolerance -- see the pg_cron job in
// the migrations) and checks:
//
//   (a) Is the mercadopago-reconcile-batch cron job actually running on
//       schedule, and did its last dispatch succeed?
//   (b) Elevated recent failures in payment_events (mercadopago-webhook +
//       mercadopago-checkout) or lembretes_enviados (send-appointment-
//       reminders) in the last 20 minutes.
//   (c) A company's setup fee stuck PENDING for 2+ hours, or a monthly
//       Preapproval checkout that was created 2+ hours ago and never got
//       reconciled -- both suggest the signed webhook AND the
//       reconciliation cron missed that specific case.
//
// All the raw data comes from one RPC, get_health_monitor_snapshot()
// (SECURITY DEFINER, service_role-only) -- it exists because
// cron.job_run_details lives in the `cron` schema, which PostgREST doesn't
// expose, so it can't be queried with a normal .from() call here.
//
// Sends at most one email per distinct alert per 60-minute cooldown
// window (tracked in health_alerts_sent), reusing the exact
// EmailProvider/HostingerEmailProvider abstraction from
// send-appointment-reminders. Safe to invoke with no
// HOSTINGER_MAIL_API_KEY/HOSTINGER_MAILBOX_ID/HEALTH_ALERT_EMAIL set --
// each missing piece shows up as a controlled, reported failure, not a
// crash.
//
// Supports a dry-run mode (POST body {"dry_run": true}, or ?dry_run=true
// in the URL) that evaluates every check and reports what WOULD be sent,
// without actually sending email or writing to health_alerts_sent -- used
// to validate the logic against real data without waiting for (or
// forcing) a real failure.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { EmailProvider } from './email-provider.ts';
import { HostingerEmailProvider } from './hostinger-provider.ts';

// pg_cron's net.http_post call carries no Supabase user JWT -- auth is a
// dedicated x-cron-secret header instead, same pattern (and same reason
// for using a NEW dedicated secret instead of the shared CRON_SECRET) as
// mercadopago-reconcile/index.ts.
const CRON_SECRET = Deno.env.get('HEALTH_MONITOR_CRON_SECRET');

const RECONCILE_STALE_MINUTES = 20;
const ERROR_RATE_THRESHOLD = 3;
const ALERT_COOLDOWN_MINUTES = 60;

interface Snapshot {
  generated_at: string;
  reconcile_cron: { last_run_at: string | null; last_status: string | null; minutes_since: number | null };
  recent_errors: { payment_events: number; lembretes_enviados: number };
  stale_setup_pending: Array<{ empresa_id: string; created_at: string; hours_pending: number }>;
  stale_preapprovals: Array<{ empresa_id: string; event_created_at: string; hours_since: number }>;
}

interface CandidateAlert {
  type: string;
  subject: string;
  body: string;
  details: Record<string, unknown>;
}

function buildAlerts(snapshot: Snapshot): CandidateAlert[] {
  const alerts: CandidateAlert[] = [];
  const { reconcile_cron, recent_errors, stale_setup_pending, stale_preapprovals } = snapshot;

  // (a) Reconciliation cron stale or its last dispatch failed.
  const neverRan = reconcile_cron.last_run_at === null;
  const isStale = reconcile_cron.minutes_since !== null && reconcile_cron.minutes_since > RECONCILE_STALE_MINUTES;
  const lastFailed = reconcile_cron.last_status !== null && reconcile_cron.last_status !== 'succeeded';
  if (neverRan || isStale || lastFailed) {
    alerts.push({
      type: 'reconcile_cron_stale',
      subject: '[KORbuild Alert] Mercado Pago reconciliation cron appears stuck',
      body: neverRan
        ? `The mercadopago-reconcile-batch cron job (jobid 3, every 15 minutes) has no recorded runs at all in cron.job_run_details.`
        : `The mercadopago-reconcile-batch cron job's last run was ${reconcile_cron.minutes_since} minutes ago (expected every 15 minutes)`
          + (lastFailed ? `, and its last dispatch status was "${reconcile_cron.last_status}" (expected "succeeded").` : '.')
          + `\n\nLast run at: ${reconcile_cron.last_run_at}\nLast status: ${reconcile_cron.last_status}\n\n`
          + `Check: SELECT * FROM cron.job_run_details WHERE jobid = 3 ORDER BY start_time DESC LIMIT 5;\n\n`
          + `Note: this status only reflects whether the cron's HTTP dispatch to the Edge Function succeeded (pg_net is fire-and-forget), not whether mercadopago-reconcile itself returned 2xx.`,
      details: reconcile_cron as unknown as Record<string, unknown>
    });
  }

  // (b) Elevated error rate in the last 20 minutes.
  if (recent_errors.payment_events >= ERROR_RATE_THRESHOLD) {
    alerts.push({
      type: 'payment_events_error_rate',
      subject: `[KORbuild Alert] ${recent_errors.payment_events} Mercado Pago webhook/checkout failures in the last 20 minutes`,
      body: `${recent_errors.payment_events} rows were written to payment_events with a non-null error_message in the last 20 minutes (threshold: ${ERROR_RATE_THRESHOLD}). This table is written to by both mercadopago-webhook and mercadopago-checkout.\n\n`
        + `Check: SELECT * FROM payment_events WHERE error_message IS NOT NULL AND created_at > now() - interval '20 minutes' ORDER BY created_at DESC;`,
      details: { count: recent_errors.payment_events, threshold: ERROR_RATE_THRESHOLD }
    });
  }
  if (recent_errors.lembretes_enviados >= ERROR_RATE_THRESHOLD) {
    alerts.push({
      type: 'lembretes_error_rate',
      subject: `[KORbuild Alert] ${recent_errors.lembretes_enviados} appointment reminder failures in the last 20 minutes`,
      body: `${recent_errors.lembretes_enviados} rows were written to lembretes_enviados with status_envio='falhou' in the last 20 minutes (threshold: ${ERROR_RATE_THRESHOLD}). This table is written to by send-appointment-reminders.\n\n`
        + `Check: SELECT * FROM lembretes_enviados WHERE status_envio = 'falhou' AND criado_em > now() - interval '20 minutes' ORDER BY criado_em DESC;`,
      details: { count: recent_errors.lembretes_enviados, threshold: ERROR_RATE_THRESHOLD }
    });
  }

  // (c1) Setup fee pending too long -- one alert per affected company, so
  // a new company going stale isn't silenced by an older one's cooldown.
  for (const row of stale_setup_pending) {
    alerts.push({
      type: `stale_setup_pending:${row.empresa_id}`,
      subject: `[KORbuild Alert] Setup fee still pending after ${row.hours_pending}h`,
      body: `empresa_id ${row.empresa_id} has had subscriptions.setup_status = 'PENDING' since ${row.created_at} (${row.hours_pending} hours ago). This can mean the setup-fee Mercado Pago webhook AND the reconciliation cron both missed this company's payment.\n\n`
        + `Check: SELECT * FROM subscriptions WHERE empresa_id = '${row.empresa_id}';\nSELECT * FROM payment_events WHERE empresa_id = '${row.empresa_id}' ORDER BY created_at DESC;`,
      details: row as unknown as Record<string, unknown>
    });
  }

  // (c2) Preapproval created but never reconciled -- same per-company granularity.
  for (const row of stale_preapprovals) {
    alerts.push({
      type: `stale_preapproval:${row.empresa_id}`,
      subject: `[KORbuild Alert] Monthly subscription preapproval never reconciled after ${row.hours_since}h`,
      body: `empresa_id ${row.empresa_id} created a Mercado Pago Preapproval (subscription_checkout_created) at ${row.event_created_at} (${row.hours_since} hours ago), but the subscription still has no provider_subscription_id or hasn't reached ACTIVE/PAST_DUE/CANCELLED. This can mean the signed webhook AND the reconciliation cron both missed it.\n\n`
        + `Check: SELECT * FROM subscriptions WHERE empresa_id = '${row.empresa_id}';\nSELECT * FROM payment_events WHERE empresa_id = '${row.empresa_id}' AND event_type = 'subscription_checkout_created' ORDER BY created_at DESC;`,
      details: row as unknown as Record<string, unknown>
    });
  }

  return alerts;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return json({ error: 'unauthorized' }, 401);
  }

  let dryRun = new URL(req.url).searchParams.get('dry_run') === 'true';
  try {
    const body = await req.json();
    if (body?.dry_run === true) dryRun = true;
  } catch {
    // No/invalid JSON body -- fine, dryRun already resolved from the query string.
  }

  const summary = {
    dry_run: dryRun,
    snapshot: null as Snapshot | null,
    alerts_evaluated: 0,
    alerts_triggered: [] as string[],
    alerts_sent: [] as string[],
    alerts_skipped_cooldown: [] as string[],
    email_errors: [] as string[],
    errors: [] as string[]
  };

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in the function environment', ...summary }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: snapshot, error: snapshotError } = await supabase.rpc('get_health_monitor_snapshot');
    if (snapshotError) throw snapshotError;
    summary.snapshot = snapshot as Snapshot;

    const alertEmail = Deno.env.get('HEALTH_ALERT_EMAIL');
    const emailProvider: EmailProvider = new HostingerEmailProvider(
      Deno.env.get('HOSTINGER_MAIL_API_KEY'),
      Deno.env.get('HOSTINGER_MAILBOX_ID'),
      Deno.env.get('HEALTH_ALERT_FROM_NAME') || 'KORbuild Health Monitor'
    );

    const candidates = buildAlerts(snapshot as Snapshot);
    summary.alerts_evaluated = candidates.length;

    for (const alert of candidates) {
      summary.alerts_triggered.push(alert.type);

      const { data: recent, error: recentError } = await supabase
        .from('health_alerts_sent')
        .select('id, sent_at')
        .eq('alert_type', alert.type)
        .gte('sent_at', new Date(Date.now() - ALERT_COOLDOWN_MINUTES * 60 * 1000).toISOString())
        .limit(1)
        .maybeSingle();

      if (recentError) {
        summary.errors.push(`cooldown check for ${alert.type}: ${recentError.message}`);
        continue;
      }
      if (recent) {
        summary.alerts_skipped_cooldown.push(alert.type);
        continue;
      }

      if (dryRun) {
        summary.alerts_sent.push(`${alert.type} (dry-run, not actually sent)`);
        continue;
      }

      if (!alertEmail) {
        summary.email_errors.push(`${alert.type}: HEALTH_ALERT_EMAIL is not configured`);
        continue;
      }

      const result = await emailProvider.send(alertEmail, alert.subject, alert.body.replace(/\n/g, '<br>'));
      if (!result.success) {
        summary.email_errors.push(`${alert.type}: ${result.error}`);
        continue;
      }

      summary.alerts_sent.push(alert.type);
      const { error: insertError } = await supabase.from('health_alerts_sent').insert({
        alert_type: alert.type,
        details: alert.details
      });
      if (insertError) summary.errors.push(`recording alert ${alert.type}: ${insertError.message}`);
    }

    return new Response(JSON.stringify(summary, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[health-monitor] unhandled error', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'unknown error', ...summary }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
