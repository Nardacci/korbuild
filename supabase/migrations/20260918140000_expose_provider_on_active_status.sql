-- get_workspace_access_status() -- expose `provider` on the ACTIVE branch
-- only. home.js needs to tell apart status='ACTIVE' reached via a real
-- confirmed Mercado Pago subscription (provider='mercadopago', worth an
-- explicit "your subscription is active" confirmation) from status='ACTIVE'
-- set manually by a super admin (commercial-admin.html, provider still
-- null) -- the latter keeps hiding the trial/status card entirely,
-- unchanged from before this migration.
--
-- Every other line in this function body is byte-for-byte identical to the
-- version confirmed live via pg_get_functiondef() before this migration
-- was written -- only the ACTIVE branch's jsonb_build_object gains one key.

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
      'setup_status',v_subscription.setup_status,
      'provider',v_subscription.provider
    );
  end if;

  -- Recurring monthly charge failed (Mercado Pago webhook). Same
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
