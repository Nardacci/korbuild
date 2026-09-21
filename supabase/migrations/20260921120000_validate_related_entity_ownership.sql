-- Related-entity ownership validation.
--
-- These SECURITY DEFINER RPCs validated p_empresa_id against
-- get_current_empresa_id() but accepted an ID of a related entity
-- (collaborator / client / service) without checking that it belongs to the
-- same company. RLS does not apply inside SECURITY DEFINER, and the foreign
-- keys only require the row to exist, so a user of company A could reference
-- a collaborator / client / service of company B. For agendamentos_servico
-- this also let A occupy a slot of B's collaborator in the
-- agendamentos_servico_sem_sobreposicao EXCLUDE constraint (which is keyed on
-- colaborador_id only) and probe B's calendar through the "schedule conflict"
-- error.
--
-- Same pattern already used by criar_emprestimo / criar_despesa /
-- criar_recebimento / mover_agendamento. Only the ownership check is added;
-- every function below is otherwise identical to the definition that was live
-- when this migration was written. The check runs right after the
-- p_empresa_id authorization, before any other validation, so a foreign ID
-- can not be probed through other error messages.
--
-- Negative tests: supabase/tests/cross_tenant_related_ids.sql and
-- tests/security.spec.ts.
--
-- NOTE: the local migrations are not registered in the remote
-- supabase_migrations history, so do NOT use "supabase db push" for this file;
-- apply it with "supabase db query --linked -f <this file>".

CREATE OR REPLACE FUNCTION public.criar_escala(p_empresa_id uuid, p_colaborador_id uuid, p_tipo_escala_id uuid, p_data_inicio date, p_data_fim date, p_hora_inicio time without time zone DEFAULT NULL::time without time zone, p_hora_fim time without time zone DEFAULT NULL::time without time zone, p_observacoes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_requer_aprovacao boolean;
  v_status text;
  v_id uuid;
begin
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;
  if not exists (select 1 from public.colaboradores where id = p_colaborador_id and empresa_id = p_empresa_id) then
    raise exception 'collaborator not found in this company';
  end if;

  if p_data_fim < p_data_inicio then
    raise exception 'data_fim must be on or after data_inicio';
  end if;

  select requer_aprovacao into v_requer_aprovacao
  from public.tipos_escala
  where id = p_tipo_escala_id and empresa_id = p_empresa_id;

  if v_requer_aprovacao is null then
    raise exception 'tipo_escala not found for this company';
  end if;

  -- Categories that don't require approval are usable immediately;
  -- everything else starts pendente and waits on aprovar_escala().
  v_status := case when v_requer_aprovacao then 'pendente' else 'confirmado' end;

  insert into public.escalas (
    empresa_id, colaborador_id, tipo_escala_id, data_inicio, data_fim,
    hora_inicio, hora_fim, status, observacoes, criado_por
  ) values (
    p_empresa_id, p_colaborador_id, p_tipo_escala_id, p_data_inicio, p_data_fim,
    p_hora_inicio, p_hora_fim, v_status, p_observacoes, auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_valor_hora(p_empresa_id uuid, p_colaborador_id uuid, p_valor_hora numeric, p_vigente_de date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;
  if not exists (select 1 from public.colaboradores where id = p_colaborador_id and empresa_id = p_empresa_id) then
    raise exception 'collaborator not found in this company';
  end if;

  if p_valor_hora < 0 then
    raise exception 'valor_hora must be zero or greater';
  end if;

  update public.historico_valor_hora
  set vigente_ate = p_vigente_de - 1
  where empresa_id = p_empresa_id
    and colaborador_id = p_colaborador_id
    and vigente_ate is null
    and vigente_de < p_vigente_de;

  insert into public.historico_valor_hora (
    empresa_id, colaborador_id, valor_hora, vigente_de, criado_por
  ) values (
    p_empresa_id, p_colaborador_id, p_valor_hora, p_vigente_de, auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_pagamento(p_empresa_id uuid, p_colaborador_id uuid, p_semana_inicio date, p_semana_fim date, p_horas_trabalhadas numeric, p_valor_hora_aplicado numeric DEFAULT NULL::numeric, p_adiantamento numeric DEFAULT 0, p_status_pagamento text DEFAULT 'pendente'::text, p_observacoes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_valor_hora numeric;
  v_valor_bruto numeric;
  v_valor_liquido numeric;
  v_id uuid;
begin
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;
  if not exists (select 1 from public.colaboradores where id = p_colaborador_id and empresa_id = p_empresa_id) then
    raise exception 'collaborator not found in this company';
  end if;

  if p_status_pagamento not in ('pendente','pago','parcial') then
    raise exception 'invalid status_pagamento: %', p_status_pagamento;
  end if;

  if p_semana_fim < p_semana_inicio then
    raise exception 'semana_fim must be on or after semana_inicio';
  end if;

  if p_horas_trabalhadas < 0 then
    raise exception 'horas_trabalhadas must be zero or greater';
  end if;

  v_valor_hora := p_valor_hora_aplicado;
  if v_valor_hora is null then
    select h.valor_hora into v_valor_hora
    from public.historico_valor_hora h
    where h.empresa_id = p_empresa_id
      and h.colaborador_id = p_colaborador_id
      and h.vigente_de <= p_semana_inicio
      and (h.vigente_ate is null or h.vigente_ate >= p_semana_inicio)
    order by h.vigente_de desc
    limit 1;
  end if;

  if v_valor_hora is null then
    raise exception 'no hourly rate registered for this collaborator as of %', p_semana_inicio;
  end if;

  v_valor_bruto := round(p_horas_trabalhadas * v_valor_hora, 2);
  v_valor_liquido := v_valor_bruto - coalesce(p_adiantamento, 0);

  insert into public.pagamentos_semanais (
    empresa_id, colaborador_id, semana_inicio, semana_fim, horas_trabalhadas,
    valor_hora_aplicado, valor_bruto, adiantamento, valor_liquido,
    status_pagamento, pago_em, observacoes, criado_por
  ) values (
    p_empresa_id, p_colaborador_id, p_semana_inicio, p_semana_fim, p_horas_trabalhadas,
    v_valor_hora, v_valor_bruto, coalesce(p_adiantamento, 0), v_valor_liquido,
    p_status_pagamento, case when p_status_pagamento = 'pago' then timezone('utc'::text, now()) else null end,
    p_observacoes, auth.uid()
  )
  on conflict (empresa_id, colaborador_id, semana_inicio) do update set
    semana_fim = excluded.semana_fim,
    horas_trabalhadas = excluded.horas_trabalhadas,
    valor_hora_aplicado = excluded.valor_hora_aplicado,
    valor_bruto = excluded.valor_bruto,
    adiantamento = excluded.adiantamento,
    valor_liquido = excluded.valor_liquido,
    status_pagamento = excluded.status_pagamento,
    pago_em = excluded.pago_em,
    observacoes = excluded.observacoes
  returning id into v_id;

  update public.emprestimo_parcelas
  set status = 'descontado', pagamento_semanal_id = v_id, descontado_em = timezone('utc', now())
  where empresa_id = p_empresa_id
    and colaborador_id = p_colaborador_id
    and semana_desconto = p_semana_inicio
    and status = 'pendente';

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.criar_agendamento(p_empresa_id uuid, p_cliente_id uuid, p_colaborador_id uuid, p_servico_id uuid, p_data date, p_hora_inicio time without time zone, p_hora_fim time without time zone, p_observacoes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;
  if not exists (select 1 from public.clientes where id = p_cliente_id and empresa_id = p_empresa_id) then
    raise exception 'client not found in this company';
  end if;
  if not exists (select 1 from public.colaboradores where id = p_colaborador_id and empresa_id = p_empresa_id) then
    raise exception 'collaborator not found in this company';
  end if;
  if not exists (select 1 from public.servicos_catalogo where id = p_servico_id and empresa_id = p_empresa_id) then
    raise exception 'service not found in this company';
  end if;

  if p_hora_fim <= p_hora_inicio then
    raise exception 'hora_fim must be after hora_inicio';
  end if;

  -- Friendly pre-check so the common case returns a clear message quickly;
  -- the EXCLUDE constraint on agendamentos_servico is the real, unconditional
  -- guarantee (see exception handler below for the race-condition case).
  if public._agendamento_conflito(p_empresa_id, p_colaborador_id, p_data, p_hora_inicio, p_hora_fim, null) then
    raise exception 'schedule conflict: this collaborator already has an appointment overlapping this time';
  end if;

  begin
    insert into public.agendamentos_servico (
      empresa_id, cliente_id, colaborador_id, servico_id, data, hora_inicio, hora_fim, status, observacoes, criado_por
    ) values (
      p_empresa_id, p_cliente_id, p_colaborador_id, p_servico_id, p_data, p_hora_inicio, p_hora_fim, 'agendado', p_observacoes, auth.uid()
    )
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'schedule conflict: this collaborator already has an appointment overlapping this time';
  end;

  return v_id;
end;
$function$;

