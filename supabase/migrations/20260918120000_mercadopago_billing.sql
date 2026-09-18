-- Mercado Pago billing integration (setup fee + recurring monthly
-- subscription), replacing the manual-PIX-only flow.
--
-- public.subscriptions already has every column this needs (provider,
-- provider_customer_id, provider_subscription_id, setup_status,
-- setup_paid_at, status, grace_ends_at) -- confirmed via
-- information_schema.columns before writing this migration. No new
-- columns are added to it.
--
-- 'PAST_DUE' is a genuinely new subscriptions.status value (a failed
-- recurring monthly charge), so subscriptions_status_check must be widened
-- to allow it -- the four existing values (TRIALING/ACTIVE/SUSPENDED/
-- CANCELLED) are otherwise untouched.
--
-- grace_ends_at is reused for the PAST_DUE grace window (12 days, same
-- period already validated in KORbuild Finances' own Mercado Pago
-- integration -- see KORbuildFinances/supabase/migrations/
-- 20260916160000_mercadopago_recurring_billing.sql). This does not
-- collide with the column's other use (SETUP_PAYMENT_REQUIRED's trial-era
-- grace window, further down in get_workspace_access_status()): by the
-- time a row can ever reach status='PAST_DUE', it has already gone
-- through setup_status='PAID' and an authorized recurring subscription,
-- so the two uses of grace_ends_at are sequential lifecycle phases of the
-- same subscription, never simultaneous.

-- 1. Allow the new status value ------------------------------------------

alter table public.subscriptions drop constraint subscriptions_status_check;
alter table public.subscriptions add constraint subscriptions_status_check
  check (status = any (array['TRIALING','ACTIVE','SUSPENDED','CANCELLED','PAST_DUE']));

-- 2. Webhook audit log, append-only ---------------------------------------
--
-- Same reasoning as KORbuild Finances' payment_events: every inbound MP
-- notification is refetched from the MP API and logged here regardless of
-- outcome, so a payment that couldn't be matched to an empresa_id (or any
-- MP-side failure) is still visible for debugging instead of silently
-- dropped. RLS enabled, no policies -- only the mercadopago-webhook Edge
-- Function (service_role) ever touches this table.

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id) on delete cascade,
  provider text not null default 'mercadopago',
  provider_resource_type text not null,
  provider_resource_id text not null,
  event_type text not null,
  raw_payload jsonb not null,
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.payment_events enable row level security;

create index if not exists payment_events_empresa_id_idx on public.payment_events (empresa_id);
create index if not exists payment_events_provider_resource_id_idx on public.payment_events (provider_resource_id);

-- 3. get_workspace_access_status() -- add the PAST_DUE branch -------------
--
-- Only one block is new (marked below). Everything else in this function
-- body is byte-for-byte identical to the version confirmed live via
-- pg_get_functiondef(18312::oid) before this migration was written (oid
-- 18312 = public.get_workspace_access_status(); a same-named function
-- also exists at oid 19896 in the unrelated `finances` schema -- confirmed
-- distinct, not touched by this migration).
--
-- New block placed right after the ACTIVE check and before SUSPENDED/
-- CANCELLED, same precedence: a commercial status set by webhook/admin
-- always wins over the trial/setup lifecycle further down. While
-- v_now < grace_ends_at, access stays ALLOWED (grace period, frontend
-- shows a warning); once grace_ends_at passes, access flips to BLOCKED.

create or replace function public.get_workspace_access_status()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_empresa_id uuid;
  v_subscription public.subscriptions%rowtype;
  v_now timestamptz := timezone('utc', now());
  v_days_remaining integer;
  v_setup_fee numeric;
  v_monthly_starts_at timestamptz;
begin
  if auth.uid() is null then
    return jsonb_build_object('status','UNAUTHENTICATED','access','BLOCKED');
  end if;

  v_empresa_id := public.get_current_empresa_id();
  if v_empresa_id is null then
    return jsonb_build_object('status','NO_WORKSPACE','access','BLOCKED');
  end if;

  select * into v_subscription from public.subscriptions where empresa_id = v_empresa_id;
  if not found then
    return jsonb_build_object('status','SETUP_REQUIRED','access','ALLOWED');
  end if;

  -- Commercial status always has precedence over trial rules.
  if v_subscription.status = 'ACTIVE' then
    return jsonb_build_object(
      'status','ACTIVE','phase','ACTIVE','access','ALLOWED','plan',v_subscription.plan,
      'trial_enabled',coalesce(v_subscription.trial_enabled,true),
      'activation_source',v_subscription.activation_source,
      'monthly_starts_at',v_subscription.monthly_starts_at,
      'setup_status',v_subscription.setup_status
    );
  end if;

  -- NEW: recurring monthly charge failed (Mercado Pago webhook). Same
  -- precedence as ACTIVE/SUSPENDED/CANCELLED -- checked before falling
  -- through to the trial/setup lifecycle below.
  if v_subscription.status = 'PAST_DUE' then
    if v_subscription.grace_ends_at is not null and v_now < v_subscription.grace_ends_at then
      v_days_remaining := greatest(1, ceil(extract(epoch from (v_subscription.grace_ends_at - v_now))/86400.0)::integer);
      return jsonb_build_object(
        'status','PAST_DUE','phase','GRACE_PERIOD','access','ALLOWED','plan',v_subscription.plan,
        'trial_enabled',coalesce(v_subscription.trial_enabled,true),
        'days_remaining',v_days_remaining,'grace_ends_at',v_subscription.grace_ends_at
      );
    end if;
    return jsonb_build_object(
      'status','PAST_DUE','phase','PAST_DUE','access','BLOCKED',
      'plan',v_subscription.plan,'trial_enabled',coalesce(v_subscription.trial_enabled,true)
    );
  end if;

  if v_subscription.status in ('SUSPENDED','CANCELLED') then
    return jsonb_build_object(
      'status',v_subscription.status,'phase',v_subscription.status,'access','BLOCKED',
      'plan',v_subscription.plan,'trial_enabled',coalesce(v_subscription.trial_enabled,true)
    );
  end if;

  -- Trial disabled means trial UI and trial expiration rules are completely bypassed.
  if not coalesce(v_subscription.trial_enabled,true) then
    return jsonb_build_object(
      'status','TRIAL_DISABLED','phase','NO_TRIAL','access','ALLOWED',
      'plan',v_subscription.plan,'trial_enabled',false,
      'activation_source',v_subscription.activation_source
    );
  end if;

  if v_subscription.trial_started_at is null then
    return jsonb_build_object('status','SETUP_REQUIRED','access','ALLOWED','plan',v_subscription.plan,'trial_enabled',true);
  end if;

  if v_now < v_subscription.trial_ends_at then
    v_days_remaining := greatest(1, ceil(extract(epoch from (v_subscription.trial_ends_at - v_now))/86400.0)::integer);
    return jsonb_build_object(
      'status','TRIALING','phase','TRIAL','access','ALLOWED','plan','TRIAL',
      'trial_enabled',true,'days_remaining',v_days_remaining,
      'trial_started_at',v_subscription.trial_started_at,
      'trial_ends_at',v_subscription.trial_ends_at,
      'grace_ends_at',v_subscription.grace_ends_at
    );
  end if;

  select greatest(0, s.base_setup_fee * (1 + coalesce(t.setup_adjustment_percent,0)/100.0))
    into v_setup_fee
  from public.commercial_pricing_settings s
  left join public.company_commercial_terms t on t.empresa_id = v_empresa_id
  where s.id = true;

  if coalesce(v_subscription.setup_status,'PENDING') = 'PAID' then
    v_monthly_starts_at := coalesce(v_subscription.monthly_starts_at, v_subscription.setup_paid_at + interval '30 days');
    if v_now < v_monthly_starts_at then
      v_days_remaining := greatest(1, ceil(extract(epoch from (v_monthly_starts_at - v_now))/86400.0)::integer);
      return jsonb_build_object(
        'status','SETUP_ACTIVE','phase','POST_SETUP','access','ALLOWED','plan','TRIAL',
        'trial_enabled',true,'days_remaining',v_days_remaining,'setup_status','PAID',
        'monthly_starts_at',v_monthly_starts_at
      );
    end if;
  elsif coalesce(v_setup_fee,0) = 0 or coalesce(v_subscription.setup_status,'PENDING') = 'WAIVED' then
    return jsonb_build_object(
      'status','PAYMENT_REQUIRED','phase','MONTHLY_PAYMENT','access','BLOCKED','plan','MONTHLY',
      'trial_enabled',true,'setup_status','WAIVED','monthly_starts_at',v_subscription.trial_ends_at
    );
  elsif v_now < coalesce(v_subscription.grace_ends_at, v_subscription.trial_started_at + interval '20 days') then
    v_days_remaining := greatest(1, ceil(extract(epoch from (coalesce(v_subscription.grace_ends_at, v_subscription.trial_started_at + interval '20 days') - v_now))/86400.0)::integer);
    return jsonb_build_object(
      'status','SETUP_PAYMENT_REQUIRED','phase','SETUP_PAYMENT','access','ALLOWED','plan','TRIAL',
      'trial_enabled',true,'days_remaining',v_days_remaining,'setup_status','PENDING','setup_fee',v_setup_fee
    );
  end if;

  return jsonb_build_object(
    'status','BLOCKED','access','BLOCKED','plan','TRIAL','trial_enabled',true,'days_remaining',0,
    'setup_status',coalesce(v_subscription.setup_status,'PENDING'),'setup_fee',v_setup_fee
  );
end;
$function$;

grant execute on function public.get_workspace_access_status() to authenticated;
