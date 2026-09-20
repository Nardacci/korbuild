-- KORbuild · USD -> BRL conversion for billing.
--
-- Bug fixed here: mercadopago-checkout was sending
-- commercial_pricing_settings.base_setup_fee/monthly_price straight to
-- Mercado Pago with currency_id:'BRL', with no conversion -- so a $2,500
-- USD setup fee charged R$2,500 instead of the correct BRL amount. This
-- migration adds the exchange-rate cache table and a read-only RPC for the
-- frontend; the actual conversion logic lives in mercadopago-checkout
-- (see that function's own comments).
--
-- Deliberately isolated to the public schema -- the RLS audit
-- (2026-09-19) confirmed there is no bridge from finances to public or
-- vice versa other than two explicit, super-admin-gated functions, and
-- this table has nothing to do with that bridge. KORbuild Finances has
-- its own finances.exchange_rates with its own fetch job; this one is not
-- read by, or shared with, that schema.

create table public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  currency_pair text not null,          -- e.g. 'USD/BRL'
  rate numeric not null,                -- units of the second currency per one unit of the first
  rate_date date not null,              -- the date the quotation applies to (from the source, not necessarily today -- BCB PTAX has no quotation on weekends/holidays)
  fetched_at timestamptz not null default timezone('utc', now()),
  source text not null,                 -- e.g. 'BCB_PTAX'
  unique (currency_pair, rate_date)
);

comment on table public.exchange_rates is
  'Daily exchange-rate cache used to convert commercial_pricing_settings amounts to BRL before charging via Mercado Pago (which only settles in BRL). One row per currency_pair per rate_date; fetch-exchange-rate upserts into it once a day.';

alter table public.exchange_rates enable row level security;
-- No policies: same pattern as commercial_pricing_settings/company_commercial_terms
-- (this table is written only by fetch-exchange-rate via service_role, and
-- read only through the SECURITY DEFINER RPC below -- never queried
-- directly by authenticated clients).

create index exchange_rates_pair_date_idx on public.exchange_rates (currency_pair, rate_date desc);

-- Read-only RPC for the frontend (billing.html): returns the most recent
-- cached rate for a currency pair, or found:false if none has been
-- fetched yet (e.g. before the first cron run).
create or replace function public.obter_cotacao_atual(p_currency_pair text default 'USD/BRL')
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.exchange_rates%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
    into v_row
  from public.exchange_rates
  where currency_pair = p_currency_pair
  order by rate_date desc
  limit 1;

  if not found then
    return jsonb_build_object('found', false);
  end if;

  return jsonb_build_object(
    'found', true,
    'currency_pair', v_row.currency_pair,
    'rate', v_row.rate,
    'rate_date', v_row.rate_date,
    'fetched_at', v_row.fetched_at,
    'source', v_row.source
  );
end;
$$;

grant execute on function public.obter_cotacao_atual(text) to authenticated;
