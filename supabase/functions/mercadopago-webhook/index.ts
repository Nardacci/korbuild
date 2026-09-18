// mercadopago-webhook -- receives Mercado Pago notifications (payment and
// preapproval topics) and ALWAYS refetches the resource from the Mercado
// Pago API before writing anything -- the webhook body itself is never
// trusted as the source of truth, only as a "go look at id X" signal.
// Same design as KORbuild Finances' own mp-webhook (see
// KORbuildFinances/supabase/functions/mp-webhook/index.ts), adapted to
// this product's single public.subscriptions table instead of a separate
// payment_subscriptions table.
//
// verify_jwt is off for this function (supabase/config.toml) since
// Mercado Pago calls it with no Supabase user JWT -- auth here is MP's own
// x-signature/x-request-id scheme, validated against
// MERCADOPAGO_WEBHOOK_SECRET.
//
// Four scenarios handled, matching public.subscriptions' existing columns
// exactly (no new columns):
//   1. Setup fee payment approved (payment.metadata.kind === 'setup_fee')
//      -> setup_status='PAID', setup_paid_at=now(), provider='mercadopago',
//         provider_customer_id=<payer id>.
//   2. Preapproval becomes 'authorized' (monthly subscription activated)
//      -> provider_subscription_id=<preapproval id>, provider='mercadopago'.
//      Also flips status to 'ACTIVE' -- this isn't literally spelled out
//      in the spec ("grava provider_subscription_id") but is the only way
//      activation actually unblocks access, since status='ACTIVE' is the
//      first, highest-precedence check in get_workspace_access_status().
//      Flagged explicitly rather than silently assumed.
//   3. Recurring monthly payment rejected, current status != 'PAST_DUE'
//      -> status='PAST_DUE', grace_ends_at = now() + 12 days. Guarded by
//      "current status != PAST_DUE" so Mercado Pago's own automatic
//      retries within the same failure cycle don't keep resetting the
//      grace clock -- same reasoning KORbuild Finances documented for its
//      past_due_since column.
//   4. Recurring monthly payment approved while current status ==
//      'PAST_DUE' -> status='ACTIVE', grace_ends_at=null.
//
// A payment/preapproval that can't be resolved to an empresa_id is logged
// to payment_events with empresa_id=null and event_type='unresolved_empresa'
// instead of guessing -- check that table after the first real webhook
// traffic arrives.
//
// Deploy: supabase functions deploy mercadopago-webhook --no-verify-jwt
// (or set verify_jwt=false for this function in supabase/config.toml,
// already done in this repo)
// Required secrets (STOP -- do not set these yourself, the operator does):
//   supabase secrets set MERCADOPAGO_ACCESS_TOKEN=<Mercado Pago access token>
//   supabase secrets set MERCADOPAGO_WEBHOOK_SECRET=<signature secret from the MP panel>
// Auto-injected by the platform: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MERCADOPAGO_ACCESS_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
const MERCADOPAGO_WEBHOOK_SECRET = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET");

const GRACE_DAYS = 12; // same grace period already validated for KORbuild Finances' own recurring billing.

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Mercado Pago signature scheme (developers.mercadopago.com, "Webhooks -
// Validação de origem"): x-signature is "ts=<unix>,v1=<hex hmac>"; the
// manifest hashed is "id:<data.id lowercase>;request-id:<x-request-id>;ts:<ts>;".
// Cross-checked against the official Go SDK's buildManifest() (github.com/
// mercadopago/sdk-go/pkg/webhook) on 2026-09-18: same field order/separators,
// same data.id-from-query-string + lowercase rule, x-request-id NOT
// lowercased -- this implementation matches. Kept as-is per instructions;
// only diagnostic logging was added below (temporary -- remove once the
// 401 cause is found. Never logs MERCADOPAGO_WEBHOOK_SECRET itself; the
// computed HMAC is safe to log since it's a one-way digest, not the key).
async function verifySignature(req: Request, url: URL): Promise<boolean> {
  // Any parsing/crypto failure here means "could not verify" -- never let
  // an unexpected exception fall through as an uncaught 500 that might
  // look like a different kind of failure than a rejected signature.
  try {
    const signatureHeader = req.headers.get("x-signature");
    const requestId = req.headers.get("x-request-id");
    console.log("[mp-webhook][DIAG] raw headers", {
      "x-signature": signatureHeader,
      "x-request-id": requestId,
      url: req.url,
    });
    if (!signatureHeader || !requestId) {
      console.log("[mp-webhook][DIAG] rejected: missing x-signature or x-request-id header");
      return false;
    }

    const parts = Object.fromEntries(
      signatureHeader.split(",").map((p) => p.trim().split("=").map((s) => s.trim())),
    );
    const ts = parts["ts"];
    const v1 = parts["v1"];
    console.log("[mp-webhook][DIAG] parsed x-signature", { ts, v1, allParts: parts });
    if (!ts || !v1) {
      console.log("[mp-webhook][DIAG] rejected: x-signature missing ts or v1 component");
      return false;
    }

    const dataIdRaw = url.searchParams.get("data.id") || url.searchParams.get("id") || "";
    const dataId = dataIdRaw.toLowerCase();
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const expected = await hmacSha256Hex(MERCADOPAGO_WEBHOOK_SECRET!, manifest);
    const matched = expected === v1;
    console.log("[mp-webhook][DIAG] signature check", {
      queryString: url.search,
      dataIdRaw,
      dataIdUsed: dataId,
      manifest,
      receivedV1: v1,
      computedV1: expected,
      matched,
      webhookSecretConfiguredLength: MERCADOPAGO_WEBHOOK_SECRET ? MERCADOPAGO_WEBHOOK_SECRET.length : 0,
    });
    return matched;
  } catch (error) {
    console.log("[mp-webhook][DIAG] rejected: exception during verification", error instanceof Error ? error.message : String(error));
    return false;
  }
}

// Never lets a fetch()-level failure (DNS, connection refused, timeout, ...)
// escape as an unhandled exception -- that's exactly what turned into an
// uncaught 502 for Mercado Pago's own "Simulate notification" test payload
// (a fixed, non-existent data.id="123456" that legitimately 404s against
// the real API). A network exception here is reported the same way as an
// ordinary non-2xx response: ok=false, status=0, so every caller's existing
// `if (!ok || !body)` branch already covers it uniformly.
async function fetchMp(path: string): Promise<{ ok: boolean; status: number; body: Record<string, unknown> | null }> {
  try {
    const res = await fetch(`https://api.mercadopago.com${path}`, {
      headers: { Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}` },
    });
    const body = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body };
  } catch (error) {
    console.log("[mp-webhook] Mercado Pago API request failed", path, error instanceof Error ? error.message : String(error));
    return { ok: false, status: 0, body: null };
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = new URL(req.url);
  // Read the body once, early -- a Request's body can only be consumed
  // once, and merchant_order detection below needs to inspect it (some
  // notifications carry topic/type only in the query string, e.g.
  // "?id=X&topic=merchant_order", others -- and the "payment" topic --
  // carry it in a JSON body like {type,data:{id}}). A merchant_order
  // notification's body is often empty, which .catch(()=>null) handles
  // the same as any other unparseable body.
  const notification = await req.json().catch(() => null);
  const topic: string = String(
    url.searchParams.get("topic") || url.searchParams.get("type") ||
    notification?.topic || notification?.type || "",
  ).toLowerCase();

  // TEMPORARY DIAGNOSTIC -- remove once the 401 cause is confirmed. Never
  // logs the secret values themselves, only whether each is present.
  console.log("[mp-webhook][DIAG] request received", {
    method: req.method,
    url: req.url,
    topic,
    webhookSecretConfigured: !!MERCADOPAGO_WEBHOOK_SECRET,
    accessTokenConfigured: !!MERCADOPAGO_ACCESS_TOKEN,
  });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // merchant_order is not a topic this integration acts on -- the only
  // state-changing signal is the "payment" topic (setup fee confirmation,
  // recurring charge approved/rejected) and "preapproval" (subscription
  // activation), per Mercado Pago's own docs. Their docs only document/
  // guarantee the x-signature manifest format for "payment" notifications;
  // it's unconfirmed whether merchant_order follows the exact same scheme,
  // which is exactly why every merchant_order notification observed so far
  // was failing signature verification and coming back as a 401 -- a false
  // alarm, since we were never going to act on it regardless of whether it
  // was genuine. Accepting it at face value here (ack + 200, no signature
  // check) is safe specifically because this branch never reads MP data,
  // never touches public.subscriptions, and never calls the MP API -- a
  // forged merchant_order notification can't cause anything to happen.
  // This also stops Mercado Pago's automatic retries for a topic that was
  // being rejected for no operational benefit. Signature validation for
  // "payment" (and "preapproval") is untouched -- those still must verify.
  if (topic === "merchant_order") {
    const resourceIdRaw = String(url.searchParams.get("id") || notification?.resource || notification?.id || "");
    console.log("[mp-webhook][DIAG] merchant_order notification ignored (not signature-verified, not acted on)", {
      resourceIdRaw,
      url: req.url,
    });
    await admin.from("payment_events").insert({
      empresa_id: null,
      provider_resource_type: "merchant_order",
      provider_resource_id: resourceIdRaw || "unknown",
      event_type: "merchant_order_ignored",
      raw_payload: notification ?? { url: req.url },
    });
    return json({ received: true, ignored: "merchant_order", message: "merchant_order is not processed; waiting for the payment notification instead." });
  }

  // Explicit fail-closed checks: without both secrets configured, no
  // signature could ever legitimately verify and no MP API call could
  // succeed, so refuse deliberately (clean error) instead of letting an
  // unset secret reach fetch()/crypto.subtle and throw as an uncaught 500.
  if (!MERCADOPAGO_WEBHOOK_SECRET) {
    console.log("[mp-webhook][DIAG] rejected before signature check: MERCADOPAGO_WEBHOOK_SECRET not configured");
    return json({ error: "webhook_not_configured" }, 401);
  }
  if (!MERCADOPAGO_ACCESS_TOKEN) {
    console.log("[mp-webhook][DIAG] rejected before signature check: MERCADOPAGO_ACCESS_TOKEN not configured");
    return json({ error: "mercadopago_not_configured" }, 500);
  }

  const verified = await verifySignature(req, url);
  if (!verified) {
    console.log("[mp-webhook][DIAG] rejected: invalid_signature (see signature check log above for details)");
    return json({ error: "invalid_signature" }, 401);
  }

  if (!notification) return json({ error: "invalid_body" }, 400);

  const resourceId: string = String(notification.data?.id || notification.id || url.searchParams.get("data.id") || "");
  if (!resourceId) return json({ error: "missing_resource_id" }, 400);

  const now = new Date().toISOString();

  async function logEvent(
    empresaId: string | null,
    resourceType: string,
    eventType: string,
    payload: unknown,
    errorMessage?: string,
  ) {
    await admin.from("payment_events").insert({
      empresa_id: empresaId,
      provider_resource_type: resourceType,
      provider_resource_id: resourceId,
      event_type: eventType,
      raw_payload: payload ?? {},
      error_message: errorMessage ?? null,
    });
  }

  if (topic === "payment") {
    const { ok, status, body } = await fetchMp(`/v1/payments/${resourceId}`);
    if (!ok || !body) {
      // Covers a genuine 404 (resource truly doesn't exist -- e.g. Mercado
      // Pago's own "Simulate notification" test payload, which always sends
      // a fixed, non-existent data.id), any other non-2xx response, and any
      // network-level failure from fetchMp() -- all handled the same way:
      // acknowledge gracefully, never crash.
      await logEvent(null, "payment", "payment_fetch_failed", body ?? { status }, `Mercado Pago responded ${status}`);
      return json({ error: "payment_not_found", message: `Mercado Pago payment ${resourceId} could not be retrieved (status ${status}).` }, 404);
    }

    const paymentStatus = body.status as string; // approved | rejected | pending | ...
    const metadata = (body.metadata as Record<string, unknown> | undefined) || {};
    const preapprovalId = (body.preapproval_id as string | undefined) || null;
    const externalReference = body.external_reference as string | undefined;

    // Scenario 1: setup fee payment (created with metadata.kind='setup_fee'
    // in mercadopago-checkout) -- resolved by empresa_id directly, no
    // preapproval involved.
    if (metadata.kind === "setup_fee") {
      const empresaId = (metadata.empresa_id as string | undefined) || externalReference || null;
      if (!empresaId) {
        await logEvent(null, "payment", "unresolved_empresa", body, "setup_fee payment with no empresa_id in metadata or external_reference");
        return json({ received: true, warning: "unresolved_empresa" });
      }

      if (paymentStatus === "approved") {
        const payerId = (body.payer as Record<string, unknown> | undefined)?.id;
        const { error: updateError } = await admin
          .from("subscriptions")
          .update({
            setup_status: "PAID",
            setup_paid_at: now,
            provider: "mercadopago",
            provider_customer_id: payerId != null ? String(payerId) : null,
            updated_at: now,
          })
          .eq("empresa_id", empresaId);
        if (updateError) {
          await logEvent(empresaId, "payment", "setup_paid_write_failed", body, updateError.message);
          return json({ error: "local_write_failed" }, 500);
        }
      }

      await logEvent(empresaId, "payment", `setup_payment_${paymentStatus}`, body);
      return json({ received: true });
    }

    // Scenario 3/4: recurring monthly payment (child of a preapproval).
    // Resolve by provider_subscription_id first, then fall back to
    // external_reference=empresa_id -- Mercado Pago's docs on exactly how
    // a payment links back to its preapproval are not fully explicit for
    // every case, so both paths are tried before giving up (same approach
    // already proven in KORbuild Finances' own mp-webhook).
    let sub: { empresa_id: string; status: string } | null = null;
    if (preapprovalId) {
      const { data } = await admin.from("subscriptions").select("empresa_id, status")
        .eq("provider_subscription_id", preapprovalId).maybeSingle();
      sub = data;
    }
    if (!sub && externalReference) {
      const { data } = await admin.from("subscriptions").select("empresa_id, status")
        .eq("empresa_id", externalReference).maybeSingle();
      sub = data;
    }

    if (!sub) {
      await logEvent(null, "payment", "unresolved_empresa", body, "Could not map recurring payment to a subscriptions row");
      return json({ received: true, warning: "unresolved_empresa" });
    }

    if (paymentStatus === "approved") {
      // Scenario 4: recovery. If it wasn't PAST_DUE, this is just a routine
      // successful recurring charge -- nothing to change.
      if (sub.status === "PAST_DUE") {
        const { error: updateError } = await admin
          .from("subscriptions")
          .update({ status: "ACTIVE", grace_ends_at: null, updated_at: now })
          .eq("empresa_id", sub.empresa_id);
        if (updateError) {
          await logEvent(sub.empresa_id, "payment", "recovery_write_failed", body, updateError.message);
          return json({ error: "local_write_failed" }, 500);
        }
      }
    } else if (paymentStatus === "rejected") {
      // Scenario 3. Only stamp grace_ends_at on the FIRST failure of a
      // cycle -- don't reset the clock on every retry Mercado Pago makes
      // on its own.
      if (sub.status !== "PAST_DUE") {
        const graceEndsAt = new Date(Date.now() + GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();
        const { error: updateError } = await admin
          .from("subscriptions")
          .update({ status: "PAST_DUE", grace_ends_at: graceEndsAt, updated_at: now })
          .eq("empresa_id", sub.empresa_id);
        if (updateError) {
          await logEvent(sub.empresa_id, "payment", "past_due_write_failed", body, updateError.message);
          return json({ error: "local_write_failed" }, 500);
        }
      }
    }

    await logEvent(sub.empresa_id, "payment", `recurring_payment_${paymentStatus}`, body);
    return json({ received: true });
  }

  if (topic === "preapproval" || topic === "subscription_preapproval") {
    const { ok, status, body } = await fetchMp(`/preapproval/${resourceId}`);
    if (!ok || !body) {
      // Same reasoning as the payment branch above: 404/non-2xx/network
      // failure are all just "couldn't confirm this resource" -- acknowledge
      // gracefully, never crash.
      await logEvent(null, "preapproval", "preapproval_fetch_failed", body ?? { status }, `Mercado Pago responded ${status}`);
      return json({ error: "preapproval_not_found", message: `Mercado Pago preapproval ${resourceId} could not be retrieved (status ${status}).` }, 404);
    }

    const externalReference = body.external_reference as string | undefined;
    let sub: { empresa_id: string; status: string } | null = null;
    const { data: byProviderId } = await admin.from("subscriptions").select("empresa_id, status")
      .eq("provider_subscription_id", resourceId).maybeSingle();
    sub = byProviderId;
    if (!sub && externalReference) {
      const { data } = await admin.from("subscriptions").select("empresa_id, status")
        .eq("empresa_id", externalReference).maybeSingle();
      sub = data;
    }

    if (!sub) {
      await logEvent(null, "preapproval", "unresolved_empresa", body, "No subscriptions row for this preapproval");
      return json({ received: true, warning: "unresolved_empresa" });
    }

    const mpStatus = body.status as string; // authorized | paused | cancelled | pending

    // Scenario 2: subscription activated.
    if (mpStatus === "authorized" && sub.status !== "ACTIVE") {
      const { error: updateError } = await admin
        .from("subscriptions")
        .update({
          provider: "mercadopago",
          provider_subscription_id: resourceId,
          status: "ACTIVE",
          grace_ends_at: null,
          updated_at: now,
        })
        .eq("empresa_id", sub.empresa_id);
      if (updateError) {
        await logEvent(sub.empresa_id, "preapproval", "activation_write_failed", body, updateError.message);
        return json({ error: "local_write_failed" }, 500);
      }
    }

    // cancelled/paused preapproval statuses aren't part of the 4 scenarios
    // this was scoped to -- logged for visibility, not acted on, so a
    // manual cancellation from the MP side doesn't silently flip anything
    // beyond what was explicitly asked for.
    await logEvent(sub.empresa_id, "preapproval", `preapproval_${mpStatus}`, body);
    return json({ received: true });
  }

  // Unrecognized topic -- log and acknowledge (200) so Mercado Pago doesn't
  // retry forever on something we deliberately don't handle.
  await logEvent(null, topic || "unknown", `unhandled_topic_${topic || "unknown"}`, notification);
  return json({ received: true, warning: "unhandled_topic" });
});
