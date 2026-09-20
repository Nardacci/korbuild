// mercadopago-checkout -- creates a Mercado Pago charge for the CALLER's
// own company (empresa_id resolved from their own session, same as every
// other self-service RPC in this codebase -- see loadProfile() in
// billing.js/home.js/etc: usuarios.empresa_id keyed by auth.uid()).
//
// Two flows, auto-selected server-side from the company's real
// subscriptions row -- the client never gets to pick or supply an amount:
//   - setup fee still pending  -> one-time Payment via a Mercado Pago
//     Preference (Checkout Pro), amount = base_setup_fee adjusted by
//     company_commercial_terms.setup_adjustment_percent (same formula as
//     get_workspace_access_status()/get_company_commercial_price()).
//   - setup already PAID/WAIVED -> recurring monthly subscription via
//     Mercado Pago's Preapproval (Assinaturas) API, amount =
//     commercial_pricing_settings.monthly_price (no per-company
//     adjustment column exists for the monthly price today).
// Both charges are always sent to Mercado Pago in BRL (that's the only
// currency it settles in) -- but commercial_pricing_settings.currency is
// NOT purely informational: if it isn't already BRL, the amount is
// converted using the most recent cached rate in public.exchange_rates
// (see convertToBrl() below) before being sent. This fixes a real billing
// bug found 2026-09-19: a $2,500 USD setup fee was being sent to Mercado
// Pago as unit_price:2500, currency_id:'BRL' -- charging R$2,500 instead
// of the correct BRL-converted amount. If no rate is cached yet for that
// currency, checkout now fails closed (error: exchange_rate_not_configured)
// rather than risk repeating that mistake.
//
// IMPORTANT: this conversion only affects the amount at the moment a NEW
// charge is created (a new setup-fee Preference, or a new monthly
// Preapproval). A Mercado Pago Preapproval fixes its transaction_amount
// in BRL at creation time and does NOT re-price itself on later monthly
// charges if the exchange rate moves afterward -- there is no periodic
// reajuste of an already-active subscription here. That would be a
// separate project (re-creating/updating the Preapproval on a schedule),
// intentionally not implemented as part of this fix.
//
// This function only READS commercial data and calls the Mercado Pago
// API; it does not write to public.subscriptions. Confirmation of setup
// payment / subscription activation is handled exclusively by
// mercadopago-webhook, which is the only place that trusts Mercado Pago
// state (this function's job ends at handing the user a checkout link).
//
// Deploy: supabase functions deploy mercadopago-checkout
// Required secret (STOP -- do not set this yourself, the operator does):
//   supabase secrets set MERCADOPAGO_ACCESS_TOKEN=<Mercado Pago access token>
// Optional secret (defaults to the known GitHub Pages URL if unset):
//   supabase secrets set APP_BASE_URL=<public app URL>
// Auto-injected by the platform: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MERCADOPAGO_ACCESS_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "https://nardacci.github.io/korbuild";
// Mercado Pago will not reliably call a webhook URL that's only configured
// manually in their panel (confirmed in practice: a real setup-fee
// Preference created without this field never triggered mercadopago-webhook
// -- payment_events showed notification_url: null on the created
// preference). Both the Preference and the Preapproval APIs accept this
// field directly on creation, so it's set explicitly on every request
// instead of relying on the panel-level default.
const NOTIFICATION_URL = `${SUPABASE_URL}/functions/v1/mercadopago-webhook`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

interface ConversionResult {
  amountBrl: number;
  conversion: {
    original_amount: number;
    original_currency: string;
    exchange_rate: number;
    rate_date: string;
    converted_amount_brl: number;
  } | null;
}

// deno-lint-ignore no-explicit-any
async function convertToBrl(admin: any, amount: number, currency: string): Promise<ConversionResult | { error: string; currency_pair: string }> {
  const normalized = currency.toUpperCase();
  if (normalized === "BRL") {
    return { amountBrl: amount, conversion: null };
  }

  const pair = `${normalized}/BRL`;
  const { data: rateRow } = await admin
    .from("exchange_rates")
    .select("rate, rate_date")
    .eq("currency_pair", pair)
    .order("rate_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!rateRow) {
    // Fail closed: never send an amount in the wrong currency to Mercado
    // Pago because a rate hasn't been fetched yet. This is exactly the bug
    // being fixed here, just moved from "silent" to "loud".
    return { error: "exchange_rate_not_configured", currency_pair: pair };
  }

  const amountBrl = Math.round(amount * Number(rateRow.rate) * 100) / 100;
  return {
    amountBrl,
    conversion: {
      original_amount: amount,
      original_currency: normalized,
      exchange_rate: Number(rateRow.rate),
      rate_date: rateRow.rate_date,
      converted_amount_brl: amountBrl,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Fail closed and obviously so: with no token configured, every checkout
  // attempt would otherwise reach Mercado Pago with `Authorization: Bearer
  // undefined` and fail with a confusing 401 from THEIR side.
  if (!MERCADOPAGO_ACCESS_TOKEN) return json({ error: "mercadopago_not_configured" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  // Client scoped by the caller's own JWT -- only used to resolve identity,
  // same pattern as every billing.js/home.js loadProfile().
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) return json({ error: "unauthorized" }, 401);
  const user = userData.user;

  const { data: profile, error: profileError } = await userClient
    .from("usuarios")
    .select("empresa_id")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) return json({ error: "profile_lookup_failed" }, 500);
  if (!profile?.empresa_id) return json({ error: "workspace_not_found" }, 404);
  const empresaId: string = profile.empresa_id;

  // subscriptions/commercial_pricing_settings/company_commercial_terms are
  // read via service_role from here on -- same reasoning as every other
  // commercial RPC in this codebase (get_workspace_access_status(),
  // get_company_commercial_price()): these are SECURITY DEFINER-only reads,
  // not meant to be queried by authenticated clients directly.
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: subscription, error: subError } = await admin
    .from("subscriptions")
    .select("setup_status, status")
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (subError) return json({ error: "subscription_lookup_failed" }, 500);
  if (!subscription) return json({ error: "subscription_not_found" }, 404);

  // Guard against creating a second recurring preapproval for a company
  // that already has an active (or currently past-due but still
  // recognized) subscription -- same check as KORbuild Finances'
  // mp-create-subscription.
  if (subscription.status === "ACTIVE" || subscription.status === "PAST_DUE") {
    return json({ error: "already_subscribed" }, 409);
  }

  const { data: pricing } = await admin
    .from("commercial_pricing_settings")
    .select("base_setup_fee, monthly_price, currency")
    .eq("id", true)
    .maybeSingle();
  if (!pricing) return json({ error: "pricing_not_configured" }, 500);

  const { data: terms } = await admin
    .from("company_commercial_terms")
    .select("setup_adjustment_percent")
    .eq("empresa_id", empresaId)
    .maybeSingle();

  const pricingCurrency = String(pricing.currency || "BRL");
  const setupAdjustmentPercent = Number(terms?.setup_adjustment_percent || 0);
  const setupFee = pricing.base_setup_fee == null
    ? 0
    : Math.max(0, Math.round(pricing.base_setup_fee * (1 + setupAdjustmentPercent / 100) * 100) / 100);

  const setupStatus = String(subscription.setup_status || "PENDING").toUpperCase();
  const setupRequired = setupFee > 0 && !["PAID", "WAIVED"].includes(setupStatus);

  if (setupRequired) {
    const setupConversion = await convertToBrl(admin, setupFee, pricingCurrency);
    if ("error" in setupConversion) {
      console.error("[mercadopago-checkout] setup fee conversion failed", setupConversion);
      return json(setupConversion, 500);
    }
    const setupFeeBrl = setupConversion.amountBrl;

    let mpResponse: Response;
    try {
      mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
        },
        body: JSON.stringify({
          items: [{
            title: "KORbuild - Setup fee",
            quantity: 1,
            unit_price: setupFeeBrl,
            currency_id: "BRL",
          }],
          external_reference: empresaId,
          metadata: { kind: "setup_fee", empresa_id: empresaId },
          notification_url: NOTIFICATION_URL,
          payer: user.email ? { email: user.email } : undefined,
          back_urls: {
            success: `${APP_BASE_URL}/billing.html`,
            failure: `${APP_BASE_URL}/billing.html`,
            pending: `${APP_BASE_URL}/billing.html`,
          },
          auto_return: "approved",
        }),
      });
    } catch (error) {
      console.error("[mercadopago-checkout] preference request threw", error instanceof Error ? error.message : String(error));
      return json({ error: "mercadopago_request_failed", message: error instanceof Error ? error.message : String(error) }, 502);
    }

    const mpBody = await mpResponse.json().catch(() => null);
    if (!mpResponse.ok || !mpBody?.id || !mpBody?.init_point) {
      // The response body itself never contains secrets (it's Mercado
      // Pago's own error description, not our token) -- safe to log in
      // full so it shows up in the Dashboard's Logs tab, not just
      // payment_events (which requires a SQL query to inspect).
      console.error("[mercadopago-checkout] preference creation failed", { status: mpResponse.status, body: mpBody });
      await admin.from("payment_events").insert({
        empresa_id: empresaId,
        provider_resource_type: "preference",
        provider_resource_id: mpBody?.id ? String(mpBody.id) : "unknown",
        event_type: "setup_checkout_create_failed",
        raw_payload: { ...(mpBody ?? { status: mpResponse.status }), _conversion: setupConversion.conversion },
        error_message: `Mercado Pago responded ${mpResponse.status}`,
      });
      return json({ error: "mercadopago_create_failed", status: mpResponse.status, details: mpBody }, 502);
    }

    await admin.from("payment_events").insert({
      empresa_id: empresaId,
      provider_resource_type: "preference",
      provider_resource_id: String(mpBody.id),
      event_type: "setup_checkout_created",
      raw_payload: { ...mpBody, _conversion: setupConversion.conversion },
    });

    return json({ type: "setup", init_point: mpBody.init_point, amount: setupFeeBrl, currency: "BRL", conversion: setupConversion.conversion });
  }

  // Monthly subscription flow -------------------------------------------
  const monthlyPrice = Number(pricing.monthly_price || 0);
  if (!monthlyPrice || monthlyPrice <= 0) {
    // Never invent a fallback price -- the super admin must configure it
    // first (commercial-admin.html, "Standard pricing" panel).
    return json({ error: "monthly_price_not_configured" }, 500);
  }

  const monthlyConversion = await convertToBrl(admin, monthlyPrice, pricingCurrency);
  if ("error" in monthlyConversion) {
    console.error("[mercadopago-checkout] monthly price conversion failed", monthlyConversion);
    return json(monthlyConversion, 500);
  }
  const monthlyPriceBrl = monthlyConversion.amountBrl;

  let mpResponse: Response;
  try {
    mpResponse = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        reason: "KORbuild - assinatura mensal",
        external_reference: empresaId,
        payer_email: user.email,
        notification_url: NOTIFICATION_URL,
        back_url: `${APP_BASE_URL}/billing.html`,
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: monthlyPriceBrl,
          currency_id: "BRL",
        },
      }),
    });
  } catch (error) {
    console.error("[mercadopago-checkout] preapproval request threw", error instanceof Error ? error.message : String(error));
    return json({ error: "mercadopago_request_failed", message: error instanceof Error ? error.message : String(error) }, 502);
  }

  const mpBody = await mpResponse.json().catch(() => null);
  if (!mpResponse.ok || !mpBody?.id || !mpBody?.init_point) {
    // The response body itself never contains secrets (it's Mercado Pago's
    // own error description, not our token) -- safe to log in full so it
    // shows up in the Dashboard's Logs tab, not just payment_events (which
    // requires a SQL query to inspect). A common one here in sandbox: "Both
    // payer and collector must be real or test users" -- a TEST access
    // token requires payer_email to belong to a registered Mercado Pago
    // Test User, not an arbitrary real email.
    console.error("[mercadopago-checkout] preapproval creation failed", { status: mpResponse.status, body: mpBody });
    await admin.from("payment_events").insert({
      empresa_id: empresaId,
      provider_resource_type: "preapproval",
      provider_resource_id: mpBody?.id ? String(mpBody.id) : "unknown",
      event_type: "subscription_checkout_create_failed",
      raw_payload: { ...(mpBody ?? { status: mpResponse.status }), _conversion: monthlyConversion.conversion },
      error_message: `Mercado Pago responded ${mpResponse.status}`,
    });
    return json({ error: "mercadopago_create_failed", status: mpResponse.status, details: mpBody }, 502);
  }

  await admin.from("payment_events").insert({
    empresa_id: empresaId,
    provider_resource_type: "preapproval",
    provider_resource_id: String(mpBody.id),
    event_type: "subscription_checkout_created",
    raw_payload: { ...mpBody, _conversion: monthlyConversion.conversion },
  });

  return json({ type: "monthly", init_point: mpBody.init_point, amount: monthlyPriceBrl, currency: "BRL", conversion: monthlyConversion.conversion });
});
