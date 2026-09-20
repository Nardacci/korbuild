// fetch-exchange-rate -- daily USD/BRL quotation fetch for KORbuild's
// billing conversion (see mercadopago-checkout, which is the actual place
// that applies this rate before charging).
//
// Source: Brazilian Central Bank (BCB) PTAX, via its public Olinda OData
// API -- free, official, no API key required. Confirmed live format
// (2026-09-19):
//   GET https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/
//       CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)
//       ?@dataInicial='MM-DD-YYYY'&@dataFinalCotacao='MM-DD-YYYY'&$format=json
//   -> { value: [{ cotacaoCompra, cotacaoVenda, dataHoraCotacao }, ...] }
//
// A single-day query (CotacaoDolarDia) was tried first and confirmed
// fragile: it returns an EMPTY value[] on weekends, holidays, and any time
// before ~1pm BRT on a business day (PTAX hasn't published yet). Querying
// a trailing window instead and taking the most recent entry handles all
// three cases uniformly, at the cost of one extra field to read
// (dataHoraCotacao) to find the latest row -- the API does not appear to
// guarantee response ordering.
//
// cotacaoVenda ("sell" rate) is used, not cotacaoCompra ("buy") -- the
// conventional PTAX rate for converting a foreign-currency-denominated
// obligation (our USD price list) into BRL for collection.
//
// Only USD/BRL is fetched today. commercial_pricing_settings.currency
// becoming EUR (or anything else) with no matching row in exchange_rates
// is handled by mercadopago-checkout failing closed -- it will refuse to
// charge rather than guess, not silently treat EUR as BRL. Add another
// BCB series (e.g. CotacaoEuroPeriodo) here if EUR support is needed later.
//
// Deploy: supabase functions deploy fetch-exchange-rate --no-verify-jwt
// Required secret (STOP -- do not set this yourself, the operator does):
//   supabase secrets set FETCH_EXCHANGE_RATE_CRON_SECRET=<random value>
// Auto-injected by the platform: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "npm:@supabase/supabase-js@2";

const CRON_SECRET = Deno.env.get("FETCH_EXCHANGE_RATE_CRON_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BCB_BASE = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata";
const LOOKBACK_DAYS = 10; // comfortably covers any holiday run + a weekend

interface BcbCotacao {
  cotacaoCompra: number;
  cotacaoVenda: number;
  dataHoraCotacao: string; // e.g. "2026-09-18 13:03:34.742036"
}

function mmddyyyy(d: Date): string {
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}-${dd}-${d.getUTCFullYear()}`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function fetchLatestUsdBrl(): Promise<{ rate: number; rateDate: string; raw: BcbCotacao }> {
  const end = new Date();
  const start = new Date(end.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const url = `${BCB_BASE}/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)` +
    `?@dataInicial='${mmddyyyy(start)}'&@dataFinalCotacao='${mmddyyyy(end)}'&$format=json`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`BCB PTAX responded HTTP ${response.status}`);
  }

  const body = await response.json().catch(() => null) as { value?: BcbCotacao[] } | null;
  const rows = body?.value ?? [];
  if (rows.length === 0) {
    throw new Error(`BCB PTAX returned no quotations in the last ${LOOKBACK_DAYS} days`);
  }

  const latest = rows.reduce((a, b) => (a.dataHoraCotacao > b.dataHoraCotacao ? a : b));
  const rateDate = latest.dataHoraCotacao.slice(0, 10); // "YYYY-MM-DD" prefix of "YYYY-MM-DD HH:MM:SS.ffffff"

  return { rate: latest.cotacaoVenda, rateDate, raw: latest };
}

Deno.serve(async (req: Request) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  let dryRun = new URL(req.url).searchParams.get("dry_run") === "true";
  try {
    const body = await req.json();
    if (body?.dry_run === true) dryRun = true;
  } catch {
    // no JSON body (e.g. a plain cron POST) -- fine, dryRun stays as set by the query string
  }

  try {
    const { rate, rateDate, raw } = await fetchLatestUsdBrl();

    if (dryRun) {
      return json({ dry_run: true, currency_pair: "USD/BRL", rate, rate_date: rateDate, source_row: raw });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await supabase
      .from("exchange_rates")
      .upsert(
        { currency_pair: "USD/BRL", rate, rate_date: rateDate, source: "BCB_PTAX" },
        { onConflict: "currency_pair,rate_date" },
      );

    if (error) {
      console.error("[fetch-exchange-rate] upsert failed", error.message);
      return json({ error: "upsert_failed", message: error.message }, 500);
    }

    return json({ dry_run: false, currency_pair: "USD/BRL", rate, rate_date: rateDate, stored: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[fetch-exchange-rate] failed", message);
    return json({ error: "fetch_failed", message }, 502);
  }
});
