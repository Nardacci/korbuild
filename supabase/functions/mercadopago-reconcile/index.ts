// mercadopago-reconcile -- manual + future-cron reconciliation for setup-fee
// payments that Mercado Pago's signed "payment" Webhook never confirmed.
//
// Context (see mercadopago-webhook): every inbound notification observed
// so far has been topic=merchant_order via the legacy IPN mechanism
// (triggered by notification_url on the Preference), never the signed
// "payment" Webhook configured in the MP developer panel -- these appear
// to be two separate Mercado Pago notification systems, and why the real
// webhook isn't firing is a SEPARATE, still-open investigation. This
// function is a stopgap that doesn't depend on that investigation being
// resolved: it asks Mercado Pago directly instead of waiting for a
// notification that may never arrive.
//
// Two direct lookup modes, mirroring mercadopago-checkout/webhook's own
// resource-refetch pattern (never trust anything not confirmed straight
// from the MP API):
//   - payment_id given -> GET /v1/payments/{payment_id} (exact resource).
//   - empresa_id given (no payment_id) -> GET /v1/payments/search?
//     external_reference={empresa_id}, most recent first, filtered to
//     metadata.kind === 'setup_fee' so a monthly recurring charge under the
//     same empresa_id is never mistaken for the setup fee.
// With neither given: BATCH mode -- scans public.subscriptions for
// setup_status='PENDING' rows idle for more than `minutes` (default 15)
// and reconciles each by empresa_id search. Same "no per-request user
// auth, service-role, meant to run on a schedule with an empty body" shape
// as send-appointment-reminders, so this same function can later be wired
// to a periodic cron with no changes.
//
// Safety: `dry_run` defaults to true. A dry run reports exactly what was
// found and what WOULD happen, without writing to public.subscriptions or
// payment_events. Pass dry_run:false to actually commit.
//
// This is an internal ops tool, not exposed to end users -- call it with
// the project's service_role key as the Authorization bearer (same as any
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

type Lookup =
  | { found: false; reason: string }
  | { found: true; payment: MpResource; empresaId: string };

// Finds the best-matching setup-fee payment for a company. Read-only --
// never writes anything, regardless of dry_run.
async function findSetupFeePayment(opts: { paymentId?: string; empresaId?: string }): Promise<Lookup> {
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

async function reconcileOne(
  admin: SupabaseAdmin,
  opts: { paymentId?: string; empresaId?: string; dryRun: boolean },
): Promise<Record<string, unknown>> {
  const lookup = await findSetupFeePayment(opts);
  if (!lookup.found) return { empresa_id: opts.empresaId ?? null, payment_id: opts.paymentId ?? null, action: "skipped", reason: lookup.reason };

  const payment = lookup.payment;
  const paymentStatus = payment.status as string;
  const base = {
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

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!MERCADOPAGO_ACCESS_TOKEN) return json({ error: "mercadopago_not_configured" }, 500);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const payload = await req.json().catch(() => ({}));
  // Explicit false required to actually write -- any other value (missing,
  // true, truthy) stays a dry run.
  const dryRun = payload?.dry_run !== false;

  if (payload?.payment_id || payload?.empresa_id) {
    const result = await reconcileOne(admin, {
      paymentId: payload.payment_id ? String(payload.payment_id) : undefined,
      empresaId: payload.empresa_id ? String(payload.empresa_id) : undefined,
      dryRun,
    });
    return json(result);
  }

  // Batch mode: no payment_id/empresa_id given -- scan PENDING setups idle
  // for more than `minutes` (default 15). Same shape a periodic cron can
  // call with an empty (or {}) body.
  const minutes = Number(payload?.minutes) > 0 ? Number(payload.minutes) : 15;
  const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString();

  const { data: pending, error: pendingError } = await admin
    .from("subscriptions")
    .select("empresa_id")
    .eq("setup_status", "PENDING")
    .lt("updated_at", cutoff);

  if (pendingError) return json({ error: "pending_lookup_failed", message: pendingError.message }, 500);

  const results: Record<string, unknown>[] = [];
  for (const row of (pending || []) as { empresa_id: string }[]) {
    results.push(await reconcileOne(admin, { empresaId: row.empresa_id, dryRun }));
  }

  return json({ dry_run: dryRun, minutes, checked: (pending || []).length, results });
});
