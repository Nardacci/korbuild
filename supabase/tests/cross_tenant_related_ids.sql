-- Negative tests: a user of company A must NOT be able to create a record that
-- references a collaborator / client / service of company B through the
-- SECURITY DEFINER RPCs (see migration 20260921120000).
--
-- Runs entirely inside a transaction that is ROLLED BACK, so it leaves no data
-- behind. It impersonates the dedicated E2E suite user (company A) by setting
-- the JWT claims and switching to the `authenticated` role, then:
--   * for every RPC, ATTACKS with a real ID that belongs to another company and
--     expects the specific "... not found in this company" error (not just any
--     error: a plain foreign-key failure would not prove the ownership check);
--   * runs a POSITIVE CONTROL with the caller's own IDs to prove each call is
--     otherwise valid, so an attack can not be "blocked" by an unrelated reason.
-- Any failure raises an exception, so the command exits non-zero.
--
-- Run: supabase db query --linked -f supabase/tests/cross_tenant_related_ids.sql

begin;

do $$
declare
  v_user uuid;
  v_empresa uuid;
  f_colab uuid; f_cli uuid; f_srv uuid;      -- foreign (other company)
  o_colab uuid; o_cli uuid; o_srv uuid; o_tipo uuid;  -- own (company A)
  v_msg text;
  v_accepted boolean;
  v_leaks int;
begin
  -- ---- setup (as the privileged role, before impersonating) ---------------
  select u.id, u.empresa_id into v_user, v_empresa
  from public.usuarios u join auth.users a on a.id = u.id
  where a.email = 'korbuild.e2e.suite@testuser.com';
  if v_user is null then raise exception 'SETUP: suite user not found'; end if;

  select id into f_colab from public.colaboradores where empresa_id <> v_empresa limit 1;
  select id into f_cli   from public.clientes where empresa_id <> v_empresa limit 1;
  select id into f_srv   from public.servicos_catalogo where empresa_id <> v_empresa limit 1;
  select id into o_colab from public.colaboradores where empresa_id = v_empresa and active = true limit 1;
  select id into o_cli   from public.clientes where empresa_id = v_empresa limit 1;
  select id into o_srv   from public.servicos_catalogo where empresa_id = v_empresa limit 1;
  select id into o_tipo  from public.tipos_escala where empresa_id = v_empresa and codigo = 'turno' limit 1;
  if f_colab is null or f_cli is null or f_srv is null then
    raise exception 'SETUP: need a collaborator, client and service in another company (got %, %, %)', f_colab, f_cli, f_srv;
  end if;
  if o_colab is null or o_cli is null or o_srv is null or o_tipo is null then
    raise exception 'SETUP: need own collaborator, client, service and tipo_escala';
  end if;

  -- ---- impersonate the suite user -----------------------------------------
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.get_current_empresa_id() is distinct from v_empresa then
    raise exception 'SETUP: impersonation failed (empresa %, expected %)', public.get_current_empresa_id(), v_empresa;
  end if;

  -- ======================= criar_escala ====================================
  v_accepted := false; v_msg := null;
  begin
    perform public.criar_escala(v_empresa, f_colab, o_tipo, date '2099-01-01', date '2099-01-01', time '08:00', time '12:00');
    v_accepted := true;
  exception when others then v_msg := sqlerrm; end;
  if v_accepted then raise exception 'FAIL criar_escala: accepted a collaborator of another company'; end if;
  if v_msg not like '%collaborator not found in this company%' then raise exception 'FAIL criar_escala: wrong error: %', v_msg; end if;
  perform public.criar_escala(v_empresa, o_colab, o_tipo, date '2099-01-01', date '2099-01-01', time '08:00', time '12:00');  -- control

  -- ======================= registrar_valor_hora ============================
  v_accepted := false; v_msg := null;
  begin
    perform public.registrar_valor_hora(v_empresa, f_colab, 10, date '2099-01-01');
    v_accepted := true;
  exception when others then v_msg := sqlerrm; end;
  if v_accepted then raise exception 'FAIL registrar_valor_hora: accepted a collaborator of another company'; end if;
  if v_msg not like '%collaborator not found in this company%' then raise exception 'FAIL registrar_valor_hora: wrong error: %', v_msg; end if;
  perform public.registrar_valor_hora(v_empresa, o_colab, 10, date '2099-01-01');  -- control

  -- ======================= registrar_pagamento =============================
  -- p_valor_hora_aplicado is given so the call does not depend on rate history.
  v_accepted := false; v_msg := null;
  begin
    perform public.registrar_pagamento(v_empresa, f_colab, date '2099-01-05', date '2099-01-11', 8, 10);
    v_accepted := true;
  exception when others then v_msg := sqlerrm; end;
  if v_accepted then raise exception 'FAIL registrar_pagamento: accepted a collaborator of another company'; end if;
  if v_msg not like '%collaborator not found in this company%' then raise exception 'FAIL registrar_pagamento: wrong error: %', v_msg; end if;
  perform public.registrar_pagamento(v_empresa, o_colab, date '2099-01-05', date '2099-01-11', 8, 10);  -- control

  -- ======================= criar_agendamento ===============================
  v_accepted := false; v_msg := null;
  begin
    perform public.criar_agendamento(v_empresa, o_cli, f_colab, o_srv, date '2099-01-02', time '09:00', time '10:00');
    v_accepted := true;
  exception when others then v_msg := sqlerrm; end;
  if v_accepted then raise exception 'FAIL criar_agendamento: accepted a collaborator of another company'; end if;
  if v_msg not like '%collaborator not found in this company%' then raise exception 'FAIL criar_agendamento (colaborador): wrong error: %', v_msg; end if;

  v_accepted := false; v_msg := null;
  begin
    perform public.criar_agendamento(v_empresa, f_cli, o_colab, o_srv, date '2099-01-02', time '09:00', time '10:00');
    v_accepted := true;
  exception when others then v_msg := sqlerrm; end;
  if v_accepted then raise exception 'FAIL criar_agendamento: accepted a client of another company'; end if;
  if v_msg not like '%client not found in this company%' then raise exception 'FAIL criar_agendamento (cliente): wrong error: %', v_msg; end if;

  v_accepted := false; v_msg := null;
  begin
    perform public.criar_agendamento(v_empresa, o_cli, o_colab, f_srv, date '2099-01-02', time '09:00', time '10:00');
    v_accepted := true;
  exception when others then v_msg := sqlerrm; end;
  if v_accepted then raise exception 'FAIL criar_agendamento: accepted a service of another company'; end if;
  if v_msg not like '%service not found in this company%' then raise exception 'FAIL criar_agendamento (servico): wrong error: %', v_msg; end if;

  perform public.criar_agendamento(v_empresa, o_cli, o_colab, o_srv, date '2099-01-02', time '09:00', time '10:00');  -- control

  -- ---- nothing referencing a foreign entity may have been written ---------
  execute 'reset role';
  select (select count(*) from public.escalas where empresa_id = v_empresa and colaborador_id = f_colab)
       + (select count(*) from public.historico_valor_hora where empresa_id = v_empresa and colaborador_id = f_colab)
       + (select count(*) from public.pagamentos_semanais where empresa_id = v_empresa and colaborador_id = f_colab)
       + (select count(*) from public.agendamentos_servico where empresa_id = v_empresa and (colaborador_id = f_colab or cliente_id = f_cli or servico_id = f_srv))
    into v_leaks;
  if v_leaks <> 0 then raise exception 'FAIL: % rows of company A reference an entity of another company', v_leaks; end if;

  raise notice 'PASS: 7 attacks blocked with the ownership error, 4 positive controls succeeded, 0 cross-tenant rows written';
end
$$;

rollback;
