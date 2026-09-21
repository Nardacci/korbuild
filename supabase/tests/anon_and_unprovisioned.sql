-- Negative tests: callers WITHOUT a company must be rejected by every
-- tenant-scoped RPC (migration 20260921130000).
--
-- get_current_empresa_id() is NULL for an anonymous caller, an authenticated
-- user with no provisioned company, and a KORbuild super-admin. The old guard
-- `p_empresa_id <> get_current_empresa_id()` evaluates to NULL in that case and
-- therefore never raised, so such callers could read/write any company's data
-- by passing its id.
--
-- The set of functions under test is ENUMERATED from pg_proc (every
-- SECURITY DEFINER function whose body uses get_current_empresa_id()), so a
-- future RPC that forgets the guard is caught too. Deliberate exceptions are
-- listed in `excluded` below with the reason.
--
-- Each function is called with NULL arguments of the right types: the
-- rejection must happen BEFORE the arguments are looked at, which is exactly
-- what the fix guarantees.
--
-- Checks (any failure is collected; the script raises at the end listing all):
--   1. EXECUTE: anon/PUBLIC have no privilege, authenticated + service_role do.
--   2. ANON calls        -> insufficient_privilege (42501).
--   3. AUTHENTICATED user without company (unknown sub) -> 'not authorized'.
--   4. SUPER-ADMIN (a real korbuild_admins user)         -> 'not authorized'.
--   5. audit_company_subscriptions / try_acquire_job_lock: service_role only.
--   6. Positive control: the suite user still reads its own company.
-- Runs inside a transaction that is ROLLED BACK.
--
-- Run: supabase db query --linked -f supabase/tests/anon_and_unprovisioned.sql

begin;

do $$
declare
  -- Not tenant-scoped data RPCs: they answer a caller without company with a
  -- harmless "denied" JSON / NULL by design (access-status checks used by every
  -- page guard, and helpers).
  excluded text[] := array[
    'get_current_empresa_id',        -- the helper itself
    'get_workspace_access_status',   -- returns {access,status} for the page guard
    'activate_workspace_trial',      -- onboarding flow, has its own null check
    'get_company_commercial_price'   -- returns NULL when there is no company
  ];
  v_suite uuid; v_empresa uuid; v_admin uuid;
  fn record;
  names text[] := '{}'; calls text[] := '{}'; oids oid[] := '{}';
  i int; v_state text; v_msg text; v_ok boolean;
  failures text := ''; n_checked int := 0; n_super int := 0; n int;
begin
  -- ---- enumerate the functions under test (as the privileged role) --------
  for fn in
    select p.oid, p.proname,
           coalesce((select string_agg('null::' || format_type(t.typ, null), ',' order by t.ord)
                     from unnest(string_to_array(p.proargtypes::text, ' ')::oid[]) with ordinality as t(typ, ord)
                     where t.typ is not null), '') as args
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prokind = 'f' and p.prosecdef
      and p.prorettype::regtype::text <> 'trigger'
      and p.prosrc ilike '%get_current_empresa_id%'
      and p.proname <> all (excluded)
    order by p.proname
  loop
    names := names || fn.proname;
    oids  := oids  || fn.oid;
    calls := calls || format('select * from public.%I(%s)', fn.proname, fn.args);
  end loop;
  if coalesce(array_length(names, 1), 0) < 30 then
    raise exception 'SETUP: expected >= 30 tenant-scoped functions, found %', coalesce(array_length(names, 1), 0);
  end if;

  select u.id, u.empresa_id into v_suite, v_empresa
  from public.usuarios u join auth.users a on a.id = u.id
  where a.email = 'korbuild.e2e.suite@testuser.com';
  if v_suite is null then raise exception 'SETUP: suite user not found'; end if;
  select ka.user_id into v_admin from public.korbuild_admins ka where ka.active limit 1;

  -- ---- 1. EXECUTE privileges ----------------------------------------------
  for i in 1 .. array_length(names, 1) loop
    if has_function_privilege('anon', oids[i], 'execute') then
      failures := failures || format('  [1] %s: anon still has EXECUTE%s', names[i], E'\n'); end if;
    if not has_function_privilege('authenticated', oids[i], 'execute') then
      failures := failures || format('  [1] %s: authenticated lost EXECUTE%s', names[i], E'\n'); end if;
    if not has_function_privilege('service_role', oids[i], 'execute') then
      failures := failures || format('  [1] %s: service_role lost EXECUTE%s', names[i], E'\n'); end if;
  end loop;

  -- ---- 2. anonymous caller --------------------------------------------------
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  for i in 1 .. array_length(names, 1) loop
    v_ok := false; v_state := null; v_msg := null;
    begin execute calls[i]; v_ok := true;
    exception when others then get stacked diagnostics v_state = returned_sqlstate; v_msg := sqlerrm; end;
    if v_ok then failures := failures || format('  [2] anon: %s ACCEPTED the call%s', names[i], E'\n');
    elsif v_state <> '42501' then failures := failures || format('  [2] anon: %s wrong rejection (%s: %s)%s', names[i], v_state, v_msg, E'\n'); end if;
    n_checked := n_checked + 1;
  end loop;

  -- get_payment_instructions() has no company parameter (and no guard of its
  -- own): it is for signed-in users only, so anon must not be able to call it.
  v_ok := false; v_state := null; v_msg := null;
  begin perform public.get_payment_instructions(); v_ok := true;
  exception when others then get stacked diagnostics v_state = returned_sqlstate; v_msg := sqlerrm; end;
  if v_ok then failures := failures || format('  [2] anon: get_payment_instructions ACCEPTED the call%s', E'\n');
  elsif v_state <> '42501' then failures := failures || format('  [2] anon: get_payment_instructions wrong rejection (%s: %s)%s', v_state, v_msg, E'\n'); end if;
  execute 'reset role';

  -- ---- 3. authenticated user with NO company (valid JWT, no usuarios row) ---
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000dead', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000dead","role":"authenticated"}', true);
  execute 'set local role authenticated';
  for i in 1 .. array_length(names, 1) loop
    v_ok := false; v_state := null; v_msg := null;
    begin execute calls[i]; v_ok := true;
    exception when others then get stacked diagnostics v_state = returned_sqlstate; v_msg := sqlerrm; end;
    if v_ok then failures := failures || format('  [3] no-company user: %s ACCEPTED the call%s', names[i], E'\n');
    elsif v_msg <> 'not authorized' then failures := failures || format('  [3] no-company user: %s wrong rejection (%s: %s)%s', names[i], v_state, v_msg, E'\n'); end if;
    n_checked := n_checked + 1;
  end loop;
  execute 'reset role';

  -- ---- 4. super-admin (no company by design) --------------------------------
  if v_admin is not null then
    perform set_config('request.jwt.claim.sub', v_admin::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    if not public.is_korbuild_super_admin() then
      failures := failures || format('  [4] SETUP: %s is not recognised as super-admin%s', v_admin, E'\n');
    else
      for i in 1 .. array_length(names, 1) loop
        v_ok := false; v_state := null; v_msg := null;
        begin execute calls[i]; v_ok := true;
        exception when others then get stacked diagnostics v_state = returned_sqlstate; v_msg := sqlerrm; end;
        if v_ok then failures := failures || format('  [4] super-admin: %s ACCEPTED the call%s', names[i], E'\n');
        elsif v_msg <> 'not authorized' then failures := failures || format('  [4] super-admin: %s wrong rejection (%s: %s)%s', names[i], v_state, v_msg, E'\n'); end if;
        n_checked := n_checked + 1; n_super := n_super + 1;
      end loop;
    end if;
    execute 'reset role';
  end if;

  -- ---- 5. functions with no guard of their own: service_role only -----------
  for fn in select p.oid::regprocedure::text as sig, p.oid as o from pg_proc p
            where p.proname in ('audit_company_subscriptions', 'try_acquire_job_lock') and p.pronamespace = 'public'::regnamespace
  loop
    if has_function_privilege('anon', fn.o, 'execute') or has_function_privilege('authenticated', fn.o, 'execute') then
      failures := failures || format('  [5] %s is still executable by anon/authenticated%s', fn.sig, E'\n'); end if;
    if not has_function_privilege('service_role', fn.o, 'execute') then
      failures := failures || format('  [5] %s lost service_role EXECUTE%s', fn.sig, E'\n'); end if;
  end loop;

  -- get_payment_instructions(): signed-in users + service_role only.
  if has_function_privilege('anon', 'public.get_payment_instructions()'::regprocedure, 'execute') then
    failures := failures || format('  [5] get_payment_instructions is still executable by anon%s', E'\n'); end if;
  if not has_function_privilege('authenticated', 'public.get_payment_instructions()'::regprocedure, 'execute')
     or not has_function_privilege('service_role', 'public.get_payment_instructions()'::regprocedure, 'execute') then
    failures := failures || format('  [5] get_payment_instructions lost authenticated/service_role EXECUTE%s', E'\n'); end if;

  -- ---- 6. positive control: a real user still works ---------------------------
  perform set_config('request.jwt.claim.sub', v_suite::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_suite::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    select count(*) into n from public.obter_clientes(v_empresa);
    if n = 0 then failures := failures || format('  [6] control: obter_clientes returned 0 rows for the suite user%s', E'\n'); end if;
    select count(*) into n from public.obter_categorias_despesa(v_empresa);
    -- billing.js still gets the payment details once signed in
    if public.get_payment_instructions() is null then
      failures := failures || format('  [6] control: get_payment_instructions returned NULL for the suite user%s', E'\n'); end if;
  exception when others then
    failures := failures || format('  [6] control: legitimate call rejected: %s%s', sqlerrm, E'\n');
  end;
  execute 'reset role';

  if failures <> '' then
    raise exception E'FAIL: callers without a company are not fully blocked (% functions enumerated):\n%', array_length(names, 1), failures;
  end if;
  raise notice 'PASS: % tenant-scoped functions x (anon, no-company user%) = % rejections; EXECUTE revoked from anon; control call OK',
    array_length(names, 1), case when n_super > 0 then ', super-admin' else '' end, n_checked;
end
$$;

rollback;
