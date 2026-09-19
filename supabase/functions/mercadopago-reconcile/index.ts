// mercadopago-reconcile -- manual + future-cron reconciliation for Mercado
// Pago state that the signed webhook never confirmed.
//
// Context (see mercadopago-webhook): every inbound notification observed
// so far has been topic=merchant_order via the legacy IPN mechanism
// (triggered by notification_url on the Preference/Preapproval), never the
// signed "payment"/"preapproval" Webhook configured in the MP developer
// panel -- these appear to be two separate Mercado Pago notification
// systems, and why the real webhook isn't firing is a SEPARATE, still-open
// investigation. This function is a stopgap that doesn't depend on that
// investigation being resolved: it asks Mercado Pago directly instead of
// waiting for a notification that may never arrive.
//
// Two resources are reconciled, mirroring mercadopago-checkout/webhook's
// own resource-refetch pattern (never trust anything not confirmed
// straight from the MP API):
//
//   SETUP FEE (one-time payment):
//     - payment_id given -> GET /v1/payments/{payment_id} (exact resource).
//     - empresa_id given (no explicit id) -> GET /v1/payments/search?
//       external_reference={empresa_id}, most recent first, filtered to
//       metadata.kind==='setup_fee' so a monthly charge under the same
//       empresa_id is never mistaken for the setup fee.
//     approved -> setup_status='PAID', setup_paid_at, provider,
//     provider_customer_id (unchanged from before this file was extended).
//
//   RECURRING SUBSCRIPTION (preapproval):
//     - preapproval_id given -> GET /preapproval/{preapproval_id}.
//     - empresa_id given (no explicit id) -> /preapproval/search does NOT
//       support external_reference as a filter (confirmed against the
//       official API reference, and empirically: it 400s) -- unlike
//       payments/search. Resolved instead from OUR OWN payment_events
//       audit log (mercadopago-checkout logs the preapproval id there at
//       creation time), then GET /preapproval/{id} directly. See
//       findPreapproval() below for the full reasoning.
//     Real status values confirmed against Mercado Pago's own Go SDK docs
//     (pkg.go.dev/github.com/mercadopago/sdk-go/pkg/preapproval) before
//     writing this: authorized | pending | paused | cancelled -- there is
//     no separate "failed" status; a struggling subscription still shows
//     authorized while Mercado Pago auto-retries the charge, and only
//     moves to paused if that keeps failing (same reasoning already
//     documented for KORbuild Finances' own recurring billing: "past_due
//     is driven by payment-level events, not preapproval status" --
//     followed here as closely as a preapproval-only reconciliation can,
//     since this path has no payment-level event to look at).
//       - authorized -> provider, provider_subscription_id, status='ACTIVE',
//         current_period_start/end (start = auto_recurring.start_date or
//         date_created, end = start + 1 month -- this integration only
//         ever creates monthly preapprovals), grace_ends_at cleared.
//       - paused -> status='PAST_DUE', grace_ends_at = now + 12 days (same
//         grace period as the PAST_DUE block already in
//         get_workspace_access_status()).
//       - cancelled -> status='CANCELLED' (already a valid value on
//         subscriptions_status_check, no migration needed).
//       - pending -> skipped, nothing actionable yet.
//
// With no payment_id/preapproval_id/empresa_id given: BATCH mode, two
// independent sweeps (not wired to a schedule yet -- structurally ready
// for one, same "service-role, no per-request auth, callable with an
// empty body" shape as send-appointment-reminders):
//   1. subscriptions with setup_status='PENDING' idle for more than
//      `minutes` (default 15) -> setup-fee reconciliation by empresa_id.
//   2. subscriptions with status='ACTIVE' and a provider_subscription_id
//      on file -> re-check that exact preapproval to catch a
//      paused/cancelled subscription Mercado Pago never notified about.
//
// Safety: `dry_run` defaults to true for every path. A dry run reports
// exactly what was found and what WOULD happen, without writing to
// public.subscriptions or payment_events. Pass dry_run:false to commit.
//
// This is an internal ops tool, not exposed to end users -- call it with
// any valid Supabase JWT as the Authorization bearer (it uses the
// service_role key internally regardless of who calls it, same as any
// trusted background job in this codebase). Never call it from billing.html.
//
// Deploy: supabase functions deploy mercadopago-reconcile
// Required secret (already configured, shared with mercadopago-checkout/webhook):
//   MERCADOPAGO_ACCESS_TOKEN
// Auto-injected by the platform: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MERCADOPAGO_ACCESS_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");

const GRACE_DAYS = 12; // same grace period as get_workspace_access_status()'s PAST_DUE block.

type MpResource = Record<string, unknown>;
type SupabaseAdmin = ReturnType<typeof createClient>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function fetchMp(path: string): Promise<{ ok: boolean; status: number; body: MpResource | null }> {
  try {
    const res = await fetch(`https://api.mercadopago.com${path}`, {
      headers: { Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}` },
    });
    const body = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body };
  } catch (error) {
    console.log("[mp-reconcile] Mercado Pago API request failed", path, error instanceof Error ? error.message : String(error));
    return { ok: false, status: 0, body: null };
  }
}

// -- Setup fee (payment) reconciliation --------------------------------

type PaymentLookup =
  | { found: false; reason: string }
  | { found: true; payment: MpResource; empresaId: string };

// Read-only -- never writes anything, regardless of dry_run.
async function findSetupFeePayment(opts: { paymentId?: string; empresaId?: string }): Promise<PaymentLookup> {
  if (opts.paymentId) {
    const { ok, status, body } = await fetchMp(`/v1/payments/${opts.paymentId}`);
    if (!ok || !body) return { found: false, reason: `Mercado Pago responded ${status} for payment ${opts.paymentId}` };
    const metadata = (body.metadata as MpResource) || {};
    const empresaId = (metadata.empresa_id as string) || (body.external_reference as string) || opts.empresaId || "";
    if (!empresaId) return { found: false, reason: `payment ${opts.paymentId} has no empresa_id in metadata or external_reference` };
    return { found: true, payment: body, empresaId };
  }

  if (opts.empresaId) {
    const { ok, status, body } = await fetchMp(
      `/v1/payments/search?external_reference=${encodeURIComponent(opts.empresaId)}&sort=date_created&criteria=desc`,
    );
    if (!ok || !body) return { found: false, reason: `Mercado Pago search responded ${status} for empresa_id ${opts.empresaId}` };
    const results = (body.results as MpResource[]) || [];
    const setupFeePayment = results.find((p) => (p.metadata as MpResource | undefined)?.kind === "setup_fee");
    if (!setupFeePayment) {
      return { found: false, reason: `No setup_fee payment found for empresa_id ${opts.empresaId} (${results.length} payment(s) on file)` };
    }
    return { found: true, payment: setupFeePayment, empresaId: opts.empresaId };
  }

  return { found: false, reason: "no payment_id or empresa_id provided" };
}

async function reconcileSetupOne(
  admin: SupabaseAdmin,
  opts: { paymentId?: string; empresaId?: string; dryRun: boolean },
): Promise<Record<string, unknown>> {
  const lookup = await findSetupFeePayment(opts);
  if (!lookup.found) return { empresa_id: opts.empresaId ?? null, payment_id: opts.paymentId ?? null, target: "setup", action: "skipped", reason: lookup.reason };

  const payment = lookup.payment;
  const paymentStatus = payment.status as string;
  const base = {
    target: "setup",
    empresa_id: lookup.empresaId,
    payment_id: String(payment.id),
    payment_status: paymentStatus,
    metadata: payment.metadata ?? null,
    dry_run: opts.dryRun,
  };

  if (paymentStatus !== "approved") {
    return { ...base, action: "skipped", reason: `payment status is '${paymentStatus}', not 'approved'` };
  }

  if (opts.dryRun) {
    return { ...base, action: "would_reconcile" };
  }

  const payerId = (payment.payer as MpResource | undefined)?.id;
  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("subscriptions")
    .update({
      setup_status: "PAID",
      setup_paid_at: (payment.date_approved as string) || now,
      provider: "mercadopago",
      provider_customer_id: payerId != null ? String(payerId) : null,
      updated_at: now,
    })
    .eq("empresa_id", lookup.empresaId);

  if (updateError) return { ...base, action: "failed", reason: updateError.message };

  await admin.from("payment_events").insert({
    empresa_id: lookup.empresaId,
    provider_resource_type: "payment",
    provider_resource_id: String(payment.id),
    event_type: "setup_reconciled_manual",
    raw_payload: payment,
  });

  return { ...base, action: "reconciled" };
}

// -- Recurring subscription (preapproval) reconciliation -----------------

type PreapprovalLookup =
  | { found: false; reason: string }
  | { found: true; preapproval: MpResource; empresaId: string };

// Read-only -- never writes anything, regardless of dry_run.
//
// Unlike /v1/payments/search (which does document external_reference as a
// filter -- confirmed against Mercado Pago's own Go SDK, which explicitly
// supports it, before writing the setup-fee side of this file),
// /preapproval/search does NOT: its only documented filters are q,
// payer_id, payer_email and preapproval_plan_id (confirmed against the
// official API reference before writing this -- external_reference only
// appears in the response shape, not as a request filter). Empirically
// confirmed too: calling it with external_reference returned a 400 during
// testing. So for the empresa_id case, this resolves the preapproval id
// from OUR OWN payment_events audit log instead (mercadopago-checkout
// already records it there at creation time, event_type
// 'subscription_checkout_created') -- we created the preapproval, so we
// don't need Mercado Pago's search API to find it again.
async function findPreapproval(
  admin: SupabaseAdmin,
  opts: { preapprovalId?: string; empresaId?: string },
): Promise<PreapprovalLookup> {
  if (opts.preapprovalId) {
    const { ok, status, body } = await fetchMp(`/preapproval/${opts.preapprovalId}`);
    if (!ok || !body) return { found: false, reason: `Mercado Pago responded ${status} for preapproval ${opts.preapprovalId}` };
    const empresaId = (body.external_reference as string) || opts.empresaId || "";
    if (!empresaId) return { found: false, reason: `preapproval ${opts.preapprovalId} has no external_reference` };
    return { found: true, preapproval: body, empresaId };
  }

  if (opts.empresaId) {
    const { data: events, error: eventsError } = await admin
      .from("payment_events")
      .select("provider_resource_id")
      .eq("empresa_id", opts.empresaId)
      .eq("event_type", "subscription_checkout_created")
      .order("created_at", { ascending: false })
      .limit(1);
    if (eventsError) return { found: false, reason: `payment_events lookup failed: ${eventsError.message}` };
    const preapprovalId = events?.[0]?.provider_resource_id as string | undefined;
    if (!preapprovalId) return { found: false, reason: `No subscription_checkout_created event on file for empresa_id ${opts.empresaId} -- the company hasn't started a monthly subscription checkout yet` };

    const { ok, status, body } = await fetchMp(`/preapproval/${preapprovalId}`);
    if (!ok || !body) return { found: false, reason: `Mercado Pago responded ${status} for preapproval ${preapprovalId}` };
    return { found: true, preapproval: body, empresaId: opts.empresaId };
  }

  return { found: false, reason: "no preapproval_id or empresa_id provided" };
}

async function reconcileSubscriptionOne(
  admin: SupabaseAdmin,
  opts: { preapprovalId?: string; empresaId?: string; dryRun: boolean },
): Promise<Record<string, unknown>> {
  const lookup = await findPreapproval(admin, opts);
  if (!lookup.found) return { empresa_id: opts.empresaId ?? null, preapproval_id: opts.preapprovalId ?? null, target: "subscription", action: "skipped", reason: lookup.reason };

  const preapproval = lookup.preapproval;
  const mpStatus = preapproval.status as string; // authorized | pending | paused | cancelled
  const base = {
    target: "subscription",
    empresa_id: lookup.empresaId,
    preapproval_id: String(preapproval.id),
    preapproval_status: mpStatus,
    dry_run: opts.dryRun,
  };

  const commit = async (updates: Record<string, unknown>, eventType: string, action: string) => {
    if (opts.dryRun) return { ...base, action: `would_${action}` };
    const { error: updateError } = await admin.from("subscriptions").update(updates).eq("empresa_id", lookup.empresaId);
    if (updateError) return { ...base, action: "failed", reason: updateError.message };
    await admin.from("payment_events").insert({
      empresa_id: lookup.empresaId,
      provider_resource_type: "preapproval",
      provider_resource_id: String(preapproval.id),
      event_type: eventType,
      raw_payload: preapproval,
    });
    return { ...base, action };
  };

  const now = new Date().toISOString();

  if (mpStatus === "authorized") {
    const autoRecurring = (preapproval.auto_recurring as MpResource | undefined) || {};
    const startRaw = (autoRecurring.start_date as string) || (preapproval.date_created as string) || now;
    const start = new Date(startRaw);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1); // this integration only ever creates monthly (frequency_type='months') preapprovals.
    return await commit(
      {
        provider: "mercadopago",
        provider_subscription_id: String(preapproval.id),
        status: "ACTIVE",
        current_period_start: start.toISOString(),
        current_period_end: end.toISOString(),
        grace_ends_at: null,
        updated_at: now,
      },
      "subscription_reconciled_manual",
      "activated",
    );
  }

  if (mpStatus === "paused") {
    const graceEndsAt = new Date(Date.now() + GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    return await commit(
      { status: "PAST_DUE", grace_ends_at: graceEndsAt, updated_at: now },
      "subscription_reconciled_manual",
      "marked_past_due",
    );
  }

  if (mpStatus === "cancelled") {
    return await commit({ status: "CANCELLED", updated_at: now }, "subscription_reconciled_manual", "cancelled");
  }

  // "pending" (not yet authorized) or any future/unknown value -- nothing
  // actionable, never guess.
  return { ...base, action: "skipped", reason: `preapproval status is '${mpStatus}', no action defined for it` };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!MERCADOPAGO_ACCESS_TOKEN) return json({ error: "mercadopago_not_configured" }, 500);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const payload = await req.json().catch(() => ({}));
  // Explicit false required to actually write -- any other value (missing,
  // true, truthy) stays a dry run.
  const dryRun = payload?.dry_run !== false;

  // Explicit resource ids -- unambiguous which flow applies.
  if (payload?.payment_id) {
    return json(await reconcileSetupOne(admin, { paymentId: String(payload.payment_id), dryRun }));
  }
  if (payload?.preapproval_id) {
    return json(await reconcileSubscriptionOne(admin, { preapprovalId: String(payload.preapproval_id), dryRun }));
  }

  // empresa_id given, no explicit resource id -- auto-detect which flow
  // applies from the company's own current state, same logic
  // mercadopago-checkout uses to decide setup-fee vs monthly-subscription.
  if (payload?.empresa_id) {
    const empresaId = String(payload.empresa_id);
    const { data: sub, error: subError } = await admin
      .from("subscriptions")
      .select("setup_status")
      .eq("empresa_id", empresaId)
      .maybeSingle();
    if (subError) return json({ error: "subscription_lookup_failed", message: subError.message }, 500);
    if (!sub) return json({ empresa_id: empresaId, action: "skipped", reason: "no subscriptions row found for this empresa_id" });

    const setupStatus = String(sub.setup_status || "PENDING").toUpperCase();
    if (!["PAID", "WAIVED"].includes(setupStatus)) {
      return json(await reconcileSetupOne(admin, { empresaId, dryRun }));
    }
    return json(await reconcileSubscriptionOne(admin, { empresaId, dryRun }));
  }

  // Batch mode: nothing given -- two independent sweeps, same shape a
  // periodic cron can call with an empty (or {}) body.
  const minutes = Number(payload?.minutes) > 0 ? Number(payload.minutes) : 15;
  const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString();

  const { data: pendingSetups, error: pendingError } = await admin
    .from("subscriptions")
    .select("empresa_id")
    .eq("setup_status", "PENDING")
    .lt("updated_at", cutoff);
  if (pendingError) return json({ error: "pending_lookup_failed", message: pendingError.message }, 500);

  const setupResults: Record<string, unknown>[] = [];
  for (const row of (pendingSetups || []) as { empresa_id: string }[]) {
    setupResults.push(await reconcileSetupOne(admin, { empresaId: row.empresa_id, dryRun }));
  }

  // Second sweep: companies already ACTIVE with a known preapproval --
  // re-check it to catch a paused/cancelled subscription Mercado Pago
  // never notified about. Not filtered by idle time (there's no
  // "checked_at" column to filter on) -- fine for a manual call; a future
  // cron wiring this up would want to add one, out of scope for now.
  const { data: activeSubs, error: activeError } = await admin
    .from("subscriptions")
    .select("empresa_id, provider_subscription_id")
    .eq("status", "ACTIVE")
    .not("provider_subscription_id", "is", null);
  if (activeError) return json({ error: "active_lookup_failed", message: activeError.message }, 500);

  const subscriptionResults: Record<string, unknown>[] = [];
  for (const row of (activeSubs || []) as { empresa_id: string; provider_subscription_id: string }[]) {
    subscriptionResults.push(await reconcileSubscriptionOne(admin, { preapprovalId: row.provider_subscription_id, empresaId: row.empresa_id, dryRun }));
  }

  return json({
    dry_run: dryRun,
    minutes,
    setup: { checked: (pendingSetups || []).length, results: setupResults },
    subscription: { checked: (activeSubs || []).length, results: subscriptionResults },
  });
});
