-- Close the "no company" hole in the tenant-scoped RPCs.
--
-- get_current_empresa_id() returns NULL for an anonymous caller, an
-- authenticated user that has no provisioned company yet, and a KORbuild
-- super-admin. The guards
--     if p_empresa_id <> public.get_current_empresa_id() then raise ...
--     if v_empresa_id is null or v_empresa_id <> public.get_current_empresa_id() ...
-- evaluate to NULL (never TRUE) when the right-hand side is NULL, so they did
-- NOT raise: any caller without a company could read/write the data of ANY
-- company by passing its id (confirmed against the dev project).
--
-- 1) Every tenant-scoped RPC now starts with an explicit
--        if public.get_current_empresa_id() is null then raise 'not authorized'
--    BEFORE any comparison. This also blocks the super-admin on these RPCs; the
--    super-admin screens use other mechanisms (is_korbuild_super_admin() and
--    the get_korbuild_* / update_* admin RPCs). Whether the super-admin should
--    get cross-company access is a separate design decision, deliberately not
--    made here.
-- 2) EXECUTE is revoked from PUBLIC and anon on those functions (authenticated
--    and service_role keep it).
-- 3) audit_company_subscriptions() (id + name of EVERY company, no guard) and
--    try_acquire_job_lock() (job lock table, only used by the mercadopago-
--    reconcile Edge Function through service_role) are restricted to
--    service_role.
--
-- Bodies are otherwise identical to the definitions that were live when this
-- was written. Tests: supabase/tests/anon_and_unprovisioned.sql.
--
-- NOTE: local migrations are not in the remote history -- do NOT use
-- "supabase db push"; apply with "supabase db query --linked -f <this file>".

CREATE OR REPLACE FUNCTION public.aprovar_escala(p_escala_id uuid, p_status text, p_observacoes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_empresa_id uuid;
  v_current_status text;
begin
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
  if p_status not in ('aprovado','rejeitado','confirmado') then
    raise exception 'invalid status for approval: %', p_status;
  end if;

  select empresa_id, status into v_empresa_id, v_current_status
  from public.escalas
  where id = p_escala_id;

  if v_empresa_id is null or v_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  if not public.is_empresa_admin() then
    raise exception 'not authorized: approval permission required';
  end if;

  if v_current_status = 'confirmado' then
    raise exception 'this Schedule entry is already confirmed';
  end if;

  update public.escalas set
    status = p_status,
    aprovado_por = auth.uid(),
    observacoes = coalesce(p_observacoes, observacoes),
    atualizado_em = timezone('utc'::text, now())
  where id = p_escala_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.atualizar_categoria_despesa(p_categoria_id uuid, p_nome text, p_ativo boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_empresa_id uuid;
begin
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
  select empresa_id into v_empresa_id from public.categorias_despesa where id = p_categoria_id;

  if v_empresa_id is null or v_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'nome is required';
  end if;

  update public.categorias_despesa set
    nome = btrim(p_nome),
    ativo = coalesce(p_ativo, ativo)
  where id = p_categoria_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.atualizar_cliente(p_cliente_id uuid, p_nome text, p_email text, p_telefone text DEFAULT NULL::text, p_endereco text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_empresa_id uuid;
begin
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
  select empresa_id into v_empresa_id from public.clientes where id = p_cliente_id;

  if v_empresa_id is null or v_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'nome is required';
  end if;

  if p_email is null or btrim(p_email) = '' then
    raise exception 'email is required';
  end if;

  update public.clientes set
    nome = p_nome,
    email = p_email,
    telefone = p_telefone,
    endereco = p_endereco
  where id = p_cliente_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.atualizar_configuracao_folha(p_empresa_id uuid, p_dia_inicio_semana smallint, p_horas_padrao_semana numeric, p_multiplicador_hora_extra numeric, p_currency text DEFAULT 'BRL'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  if p_dia_inicio_semana not between 0 and 6 then
    raise exception 'dia_inicio_semana must be between 0 and 6';
  end if;

  if p_horas_padrao_semana <= 0 then
    raise exception 'horas_padrao_semana must be greater than zero';
  end if;

  if p_multiplicador_hora_extra < 1 then
    raise exception 'multiplicador_hora_extra must be 1 or greater';
  end if;

  if p_currency not in ('USD','EUR','BRL') then
    raise exception 'invalid currency: %', p_currency;
  end if;

  insert into public.configuracoes_folha (
    empresa_id, dia_inicio_semana, horas_padrao_semana, multiplicador_hora_extra, currency, atualizado_por, atualizado_em
  ) values (
    p_empresa_id, p_dia_inicio_semana, p_horas_padrao_semana, p_multiplicador_hora_extra, p_currency, auth.uid(), timezone('utc'::text, now())
  )
  on conflict (empresa_id) do update set
    dia_inicio_semana = excluded.dia_inicio_semana,
    horas_padrao_semana = excluded.horas_padrao_semana,
    multiplicador_hora_extra = excluded.multiplicador_hora_extra,
    currency = excluded.currency,
    atualizado_por = excluded.atualizado_por,
    atualizado_em = excluded.atualizado_em;
end;
$function$;

CREATE OR REPLACE FUNCTION public.atualizar_configuracao_lembrete(p_empresa_id uuid, p_canal text, p_horas_antes integer, p_template_assunto text, p_template_corpo text, p_ativo boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  if p_canal not in ('email','sms','whatsapp') then
    raise exception 'invalid canal: %', p_canal;
  end if;

  if p_horas_antes is null or p_horas_antes <= 0 then
    raise exception 'horas_antes must be greater than zero';
  end if;

  if p_template_assunto is null or btrim(p_template_assunto) = '' then
    raise exception 'template_assunto is required';
  end if;

  if p_template_corpo is null or btrim(p_template_corpo) = '' then
    raise exception 'template_corpo is required';
  end if;

  insert into public.configuracoes_lembrete (
    empresa_id, canal, horas_antes, template_assunto, template_corpo, ativo, atualizado_por, atualizado_em
  ) values (
    p_empresa_id, p_canal, p_horas_antes, p_template_assunto, p_template_corpo, coalesce(p_ativo, true), auth.uid(), timezone('utc'::text, now())
  )
  on conflict (empresa_id) do update set
    canal = excluded.canal,
    horas_antes = excluded.horas_antes,
    template_assunto = excluded.template_assunto,
    template_corpo = excluded.template_corpo,
    ativo = excluded.ativo,
    atualizado_por = excluded.atualizado_por,
    atualizado_em = excluded.atualizado_em;
end;
$function$;

CREATE OR REPLACE FUNCTION public.atualizar_despesa(p_despesa_id uuid, p_categoria_id uuid, p_descricao text, p_valor numeric, p_data_prevista date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_empresa_id uuid;
begin
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
  select empresa_id into v_empresa_id from public.despesas where id = p_despesa_id;

  if v_empresa_id is null or v_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  if p_categoria_id is not null and not exists (
    select 1 from public.categorias_despesa where id = p_categoria_id and empresa_id = v_empresa_id
  ) then
    raise exception 'category not found in this company';
  end if;

  if p_descricao is null or btrim(p_descricao) = '' then
    raise exception 'descricao is required';
  end if;

  if p_valor <= 0 then
    raise exception 'valor must be greater than zero';
  end if;

  update public.despesas set
    categoria_id = p_categoria_id,
    descricao = btrim(p_descricao),
    valor = p_valor,
    data_prevista = p_data_prevista
  where id = p_despesa_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.atualizar_escala(p_escala_id uuid, p_data_inicio date DEFAULT NULL::date, p_data_fim date DEFAULT NULL::date, p_hora_inicio time without time zone DEFAULT NULL::time without time zone, p_hora_fim time without time zone DEFAULT NULL::time without time zone, p_observacoes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_empresa_id uuid;
  v_status text;
  v_new_inicio date;
  v_new_fim date;
begin
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
  select empresa_id, status into v_empresa_id, v_status
  from public.escalas
  where id = p_escala_id;

  if v_empresa_id is null or v_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  if v_status <> 'pendente' then
    raise exception 'only pending Schedule entries can be edited; use aprovar_escala() for status changes';
  end if;

  v_new_inicio := coalesce(p_data_inicio, (select data_inicio from public.escalas where id = p_escala_id));
  v_new_fim := coalesce(p_data_fim, (select data_fim from public.escalas where id = p_escala_id));
  if v_new_fim < v_new_inicio then
    raise exception 'data_fim must be on or after data_inicio';
  end if;

  update public.escalas set
    data_inicio = v_new_inicio,
    data_fim = v_new_fim,
    hora_inicio = coalesce(p_hora_inicio, hora_inicio),
    hora_fim = coalesce(p_hora_fim, hora_fim),
    observacoes = coalesce(p_observacoes, observacoes),
    atualizado_em = timezone('utc'::text, now())
  where id = p_escala_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.atualizar_recebimento(p_recebimento_id uuid, p_cliente_id uuid, p_descricao text, p_valor numeric, p_data_prevista date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_empresa_id uuid;
begin
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
  select empresa_id into v_empresa_id from public.recebimentos where id = p_recebimento_id;

  if v_empresa_id is null or v_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  if not exists (select 1 from public.clientes where id = p_cliente_id and empresa_id = v_empresa_id) then
    raise exception 'client not found in this company';
  end if;

  if p_descricao is null or btrim(p_descricao) = '' then
    raise exception 'descricao is required';
  end if;

  if p_valor <= 0 then
    raise exception 'valor must be greater than zero';
  end if;

  update public.recebimentos set
    cliente_id = p_cliente_id,
    descricao = btrim(p_descricao),
    valor = p_valor,
    data_prevista = p_data_prevista
  where id = p_recebimento_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.atualizar_servico(p_servico_id uuid, p_nome text, p_duracao_padrao_minutos integer, p_preco_padrao numeric, p_ativo boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_empresa_id uuid;
begin
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
  select empresa_id into v_empresa_id from public.servicos_catalogo where id = p_servico_id;

  if v_empresa_id is null or v_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'nome is required';
  end if;

  if p_duracao_padrao_minutos is null or p_duracao_padrao_minutos <= 0 then
    raise exception 'duracao_padrao_minutos must be greater than zero';
  end if;

  if p_preco_padrao is null or p_preco_padrao < 0 then
    raise exception 'preco_padrao must be zero or greater';
  end if;

  update public.servicos_catalogo set
    nome = p_nome,
    duracao_padrao_minutos = p_duracao_padrao_minutos,
    preco_padrao = p_preco_padrao,
    ativo = coalesce(p_ativo, ativo)
  where id = p_servico_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.calcular_pagamento_semanal(p_empresa_id uuid, p_colaborador_id uuid, p_semana_inicio date)
 RETURNS TABLE(horas_trabalhadas numeric, valor_hora_aplicado numeric, valor_bruto numeric, semana_fim date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_period_start_day int;
  v_period_end_day int;
  v_delta int;
  v_semana_fim date;
  v_horas numeric;
  v_valor_hora numeric;
begin
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  select period_start_day, period_end_day
    into v_period_start_day, v_period_end_day
  from public.configuracoes_operacionais
  where empresa_id = p_empresa_id
  order by created_at desc
  limit 1;

  -- Same defaults periods.js's own config falls back to when unconfigured.
  v_period_start_day := coalesce(v_period_start_day, 1);
  v_period_end_day := coalesce(v_period_end_day, 6);
  v_delta := (v_period_end_day - v_period_start_day + 7) % 7;
  v_semana_fim := p_semana_inicio + v_delta;

  select coalesce(sum(
    extract(epoch from (e.hora_fim - e.hora_inicio)) / 3600.0
    * (least(e.data_fim, v_semana_fim) - greatest(e.data_inicio, p_semana_inicio) + 1)
  ), 0)
  into v_horas
  from public.escalas e
  join public.tipos_escala t on t.id = e.tipo_escala_id
  where e.empresa_id = p_empresa_id
    and e.colaborador_id = p_colaborador_id
    and t.codigo = 'turno'
    and e.status in ('aprovado','confirmado')
    and e.hora_inicio is not null
    and e.hora_fim is not null
    and e.data_inicio <= v_semana_fim
    and e.data_fim >= p_semana_inicio;

  select h.valor_hora into v_valor_hora
  from public.historico_valor_hora h
  where h.empresa_id = p_empresa_id
    and h.colaborador_id = p_colaborador_id
    and h.vigente_de <= p_semana_inicio
    and (h.vigente_ate is null or h.vigente_ate >= p_semana_inicio)
  order by h.vigente_de desc
  limit 1;

  if v_valor_hora is null then
    raise exception 'no hourly rate registered for this collaborator as of %', p_semana_inicio;
  end if;

  return query select
    round(v_horas, 2),
    v_valor_hora,
    round(v_horas * v_valor_hora, 2),
    v_semana_fim;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cancelar_agendamento(p_agendamento_id uuid, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_empresa_id uuid;
begin
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
  select empresa_id into v_empresa_id from public.agendamentos_servico where id = p_agendamento_id;

  if v_empresa_id is null or v_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  update public.agendamentos_servico set
    status = 'cancelado',
    observacoes = case when p_motivo is not null and btrim(p_motivo) <> ''
      then coalesce(observacoes || E'\n', '') || 'Cancelled: ' || p_motivo
      else observacoes end,
    atualizado_em = timezone('utc'::text, now())
  where id = p_agendamento_id;
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
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
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

CREATE OR REPLACE FUNCTION public.criar_cliente(p_empresa_id uuid, p_nome text, p_email text, p_telefone text DEFAULT NULL::text, p_endereco text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'nome is required';
  end if;

  if p_email is null or btrim(p_email) = '' then
    raise exception 'email is required';
  end if;

  insert into public.clientes (empresa_id, nome, email, telefone, endereco)
  values (p_empresa_id, p_nome, p_email, p_telefone, p_endereco)
  returning id into v_id;

  return v_id;
end;
$function$;

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
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
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

CREATE OR REPLACE FUNCTION public.criar_servico(p_empresa_id uuid, p_nome text, p_duracao_padrao_minutos integer, p_preco_padrao numeric, p_ativo boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'nome is required';
  end if;

  if p_duracao_padrao_minutos is null or p_duracao_padrao_minutos <= 0 then
    raise exception 'duracao_padrao_minutos must be greater than zero';
  end if;

  if p_preco_padrao is null or p_preco_padrao < 0 then
    raise exception 'preco_padrao must be zero or greater';
  end if;

  insert into public.servicos_catalogo (empresa_id, nome, duracao_padrao_minutos, preco_padrao, ativo)
  values (p_empresa_id, p_nome, p_duracao_padrao_minutos, p_preco_padrao, coalesce(p_ativo, true))
  returning id into v_id;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_latest_open_period(p_period_id uuid, p_empresa_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_period public.periodos%rowtype;
  v_latest_id uuid;
  v_reopen_id uuid;
begin
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  select * into v_period
  from public.periodos
  where id = p_period_id and empresa_id = p_empresa_id;

  if not found then
    raise exception 'Period not found';
  end if;

  if v_period.status not in ('ABERTO','OPEN') then
    raise exception 'Only an open period can be deleted';
  end if;

  select id into v_latest_id
  from public.periodos
  where empresa_id = p_empresa_id
    and bonus_cycle_id = v_period.bonus_cycle_id
  order by start_date desc, end_date desc, created_at desc
  limit 1;

  if v_latest_id is distinct from p_period_id then
    raise exception 'This period cannot be deleted because newer periods already exist';
  end if;

  delete from public.ocorrencias
  where lancamento_id in (
    select id from public.lancamentos where periodo_id = p_period_id
  );

  delete from public.lancamentos where periodo_id = p_period_id;
  delete from public.periodos where id = p_period_id and empresa_id = p_empresa_id;

  select id into v_reopen_id
  from public.periodos
  where empresa_id = p_empresa_id
    and bonus_cycle_id = v_period.bonus_cycle_id
    and status = 'FECHADO'
  order by start_date desc, end_date desc, created_at desc
  limit 1;

  if v_reopen_id is not null then
    update public.periodos set status = 'ABERTO', updated_at = timezone('utc', now()) where id = v_reopen_id;
  end if;

  return jsonb_build_object('deleted', true, 'period_id', p_period_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.garantir_tipos_escala_padrao(p_empresa_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  if exists (select 1 from public.tipos_escala where empresa_id = p_empresa_id) then
    return;
  end if;

  insert into public.tipos_escala (empresa_id, codigo, rotulo, cor, requer_aprovacao, conta_como_ausencia)
  values
    (p_empresa_id, 'turno', 'Shift', '#635bff', false, false),
    (p_empresa_id, 'ferias', 'Vacation', '#2e7a57', true, true),
    (p_empresa_id, 'folga', 'Day Off', '#b36b13', true, true),
    (p_empresa_id, 'compromisso', 'Commitment', '#5b53d8', false, false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.marcar_despesa_paga(p_despesa_id uuid, p_data_pagamento date DEFAULT CURRENT_DATE)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_empresa_id uuid;
begin
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
  select empresa_id into v_empresa_id from public.despesas where id = p_despesa_id;

  if v_empresa_id is null or v_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  update public.despesas set
    status = 'pago',
    data_pagamento = coalesce(p_data_pagamento, current_date)
  where id = p_despesa_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.marcar_recebimento_recebido(p_recebimento_id uuid, p_data_recebimento date DEFAULT CURRENT_DATE)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_empresa_id uuid;
begin
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
  select empresa_id into v_empresa_id from public.recebimentos where id = p_recebimento_id;

  if v_empresa_id is null or v_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  update public.recebimentos set
    status = 'recebido',
    data_recebimento = coalesce(p_data_recebimento, current_date)
  where id = p_recebimento_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.mover_agendamento(p_agendamento_id uuid, p_nova_data date, p_novo_hora_inicio time without time zone, p_novo_hora_fim time without time zone, p_novo_colaborador_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_empresa_id uuid;
  v_colaborador_id uuid;
  v_target_colaborador_id uuid;
begin
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
  select empresa_id, colaborador_id into v_empresa_id, v_colaborador_id
  from public.agendamentos_servico
  where id = p_agendamento_id;

  if v_empresa_id is null or v_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  if p_novo_hora_fim <= p_novo_hora_inicio then
    raise exception 'hora_fim must be after hora_inicio';
  end if;

  v_target_colaborador_id := coalesce(p_novo_colaborador_id, v_colaborador_id);

  if v_target_colaborador_id <> v_colaborador_id then
    if not exists (select 1 from public.colaboradores where id = v_target_colaborador_id and empresa_id = v_empresa_id and active = true) then
      raise exception 'target collaborator not found in this company';
    end if;
  end if;

  if public._agendamento_conflito(v_empresa_id, v_target_colaborador_id, p_nova_data, p_novo_hora_inicio, p_novo_hora_fim, p_agendamento_id) then
    raise exception 'schedule conflict: this collaborator already has an appointment overlapping this time';
  end if;

  begin
    update public.agendamentos_servico set
      data = p_nova_data,
      hora_inicio = p_novo_hora_inicio,
      hora_fim = p_novo_hora_fim,
      colaborador_id = v_target_colaborador_id,
      atualizado_em = timezone('utc'::text, now())
    where id = p_agendamento_id;
  exception when exclusion_violation then
    raise exception 'schedule conflict: this collaborator already has an appointment overlapping this time';
  end;
end;
$function$;

CREATE OR REPLACE FUNCTION public.obter_agendamentos(p_empresa_id uuid, p_data_inicio date DEFAULT NULL::date, p_data_fim date DEFAULT NULL::date, p_colaborador_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, cliente_id uuid, cliente_nome text, colaborador_id uuid, colaborador_nome text, servico_id uuid, servico_nome text, data date, hora_inicio time without time zone, hora_fim time without time zone, status text, observacoes text, criado_em timestamp with time zone, atualizado_em timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  return query
    select a.id, a.cliente_id, cl.nome, a.colaborador_id, co.name, a.servico_id, s.nome,
           a.data, a.hora_inicio, a.hora_fim, a.status, a.observacoes, a.criado_em, a.atualizado_em
    from public.agendamentos_servico a
    join public.clientes cl on cl.id = a.cliente_id
    join public.colaboradores co on co.id = a.colaborador_id
    join public.servicos_catalogo s on s.id = a.servico_id
    where a.empresa_id = p_empresa_id
      and (p_data_inicio is null or a.data >= p_data_inicio)
      and (p_data_fim is null or a.data <= p_data_fim)
      and (p_colaborador_id is null or a.colaborador_id = p_colaborador_id)
      and (p_status is null or a.status = p_status)
    order by a.data, a.hora_inicio;
end;
$function$;

CREATE OR REPLACE FUNCTION public.obter_categorias_despesa(p_empresa_id uuid)
 RETURNS SETOF categorias_despesa
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  return query select * from public.categorias_despesa where empresa_id = p_empresa_id order by nome;
end;
$function$;

CREATE OR REPLACE FUNCTION public.obter_clientes(p_empresa_id uuid, p_busca text DEFAULT NULL::text)
 RETURNS SETOF clientes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  return query
    select * from public.clientes
    where empresa_id = p_empresa_id
      and (p_busca is null or nome ilike '%'||p_busca||'%' or email ilike '%'||p_busca||'%')
    order by nome;
end;
$function$;

CREATE OR REPLACE FUNCTION public.obter_configuracoes_folha(p_empresa_id uuid)
 RETURNS SETOF configuracoes_folha
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  return query select * from public.configuracoes_folha where empresa_id = p_empresa_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.obter_configuracoes_lembrete(p_empresa_id uuid)
 RETURNS SETOF configuracoes_lembrete
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  return query select * from public.configuracoes_lembrete where empresa_id = p_empresa_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.obter_contas_a_pagar_consolidado(p_empresa_id uuid, p_data_inicio date DEFAULT NULL::date, p_data_fim date DEFAULT NULL::date, p_status text DEFAULT NULL::text)
 RETURNS TABLE(origem text, referencia_id uuid, descricao text, valor numeric, data date, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  return query
    select x.origem, x.referencia_id, x.descricao, x.valor, x.data, x.status
    from (
      select 'despesa'::text as origem, d.id as referencia_id, d.descricao as descricao, d.valor as valor, d.data_prevista as data, d.status as status
      from public.despesas d
      where d.empresa_id = p_empresa_id
        and (p_data_inicio is null or d.data_prevista >= p_data_inicio)
        and (p_data_fim is null or d.data_prevista <= p_data_fim)
        and (p_status is null or d.status = p_status)
      union all
      select 'folha'::text as origem, p.id as referencia_id, 'Payroll - ' || co.name as descricao, p.valor_liquido as valor, p.semana_inicio as data, p.status_pagamento as status
      from public.pagamentos_semanais p
      join public.colaboradores co on co.id = p.colaborador_id
      where p.empresa_id = p_empresa_id
        and (p_data_inicio is null or p.semana_inicio >= p_data_inicio)
        and (p_data_fim is null or p.semana_inicio <= p_data_fim)
        and (p_status is null or p.status_pagamento = p_status)
    ) x
    order by x.data, x.descricao;
end;
$function$;

CREATE OR REPLACE FUNCTION public.obter_despesas(p_empresa_id uuid, p_data_inicio date DEFAULT NULL::date, p_data_fim date DEFAULT NULL::date, p_status text DEFAULT NULL::text, p_categoria_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, categoria_id uuid, categoria_nome text, descricao text, tipo text, status text, valor numeric, data_prevista date, data_pagamento date, grupo_recorrencia_id uuid, frequencia_recorrencia text, criado_em timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  return query
    select d.id, d.categoria_id, c.nome, d.descricao, d.tipo, d.status, d.valor,
           d.data_prevista, d.data_pagamento, d.grupo_recorrencia_id, d.frequencia_recorrencia, d.criado_em
    from public.despesas d
    left join public.categorias_despesa c on c.id = d.categoria_id
    where d.empresa_id = p_empresa_id
      and (p_data_inicio is null or d.data_prevista >= p_data_inicio)
      and (p_data_fim is null or d.data_prevista <= p_data_fim)
      and (p_status is null or d.status = p_status)
      and (p_categoria_id is null or d.categoria_id = p_categoria_id)
    order by d.data_prevista, d.criado_em;
end;
$function$;

CREATE OR REPLACE FUNCTION public.obter_emprestimos(p_empresa_id uuid, p_colaborador_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text)
 RETURNS TABLE(emprestimo_id uuid, colaborador_id uuid, colaborador_nome text, valor_total numeric, numero_parcelas integer, data_concessao date, observacoes text, parcela_id uuid, numero_parcela integer, semana_desconto date, valor_parcela numeric, status_parcela text, pagamento_semanal_id uuid, descontado_em timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  return query
    select e.id, e.colaborador_id, c.name, e.valor_total, e.numero_parcelas, e.data_concessao, e.observacoes,
           p.id, p.numero_parcela, p.semana_desconto, p.valor, p.status, p.pagamento_semanal_id, p.descontado_em
    from public.emprestimos e
    join public.colaboradores c on c.id = e.colaborador_id
    join public.emprestimo_parcelas p on p.emprestimo_id = e.id
    where e.empresa_id = p_empresa_id
      and (p_colaborador_id is null or e.colaborador_id = p_colaborador_id)
      and (p_status is null or p.status = p_status)
    order by e.data_concessao desc, e.id, p.numero_parcela;
end;
$function$;

CREATE OR REPLACE FUNCTION public.obter_escalas(p_empresa_id uuid, p_colaborador_id uuid DEFAULT NULL::uuid, p_data_inicio date DEFAULT NULL::date, p_data_fim date DEFAULT NULL::date)
 RETURNS TABLE(id uuid, colaborador_id uuid, colaborador_nome text, tipo_escala_id uuid, tipo_codigo text, tipo_rotulo text, tipo_cor text, data_inicio date, data_fim date, hora_inicio time without time zone, hora_fim time without time zone, status text, observacoes text, criado_por uuid, aprovado_por uuid, criado_em timestamp with time zone, atualizado_em timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  return query
    select e.id, e.colaborador_id, c.name, e.tipo_escala_id, t.codigo, t.rotulo, t.cor,
           e.data_inicio, e.data_fim, e.hora_inicio, e.hora_fim, e.status, e.observacoes,
           e.criado_por, e.aprovado_por, e.criado_em, e.atualizado_em
    from public.escalas e
    join public.colaboradores c on c.id = e.colaborador_id
    join public.tipos_escala t on t.id = e.tipo_escala_id
    where e.empresa_id = p_empresa_id
      and (p_colaborador_id is null or e.colaborador_id = p_colaborador_id)
      and (p_data_inicio is null or e.data_fim >= p_data_inicio)
      and (p_data_fim is null or e.data_inicio <= p_data_fim)
    order by e.data_inicio, c.name;
end;
$function$;

CREATE OR REPLACE FUNCTION public.obter_historico_valor_hora(p_colaborador_id uuid)
 RETURNS SETOF historico_valor_hora
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_empresa_id uuid;
begin
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
  select empresa_id into v_empresa_id from public.colaboradores where id = p_colaborador_id;

  if v_empresa_id is null or v_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  return query
    select * from public.historico_valor_hora
    where colaborador_id = p_colaborador_id
    order by vigente_de desc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.obter_pagamentos_semanais(p_empresa_id uuid, p_colaborador_id uuid DEFAULT NULL::uuid, p_semana_inicio date DEFAULT NULL::date, p_semana_fim date DEFAULT NULL::date)
 RETURNS TABLE(id uuid, colaborador_id uuid, colaborador_nome text, semana_inicio date, semana_fim date, horas_trabalhadas numeric, valor_hora_aplicado numeric, valor_bruto numeric, adiantamento numeric, valor_liquido numeric, status_pagamento text, pago_em timestamp with time zone, observacoes text, criado_em timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  return query
    select p.id, p.colaborador_id, c.name, p.semana_inicio, p.semana_fim, p.horas_trabalhadas,
           p.valor_hora_aplicado, p.valor_bruto, p.adiantamento, p.valor_liquido,
           p.status_pagamento, p.pago_em, p.observacoes, p.criado_em
    from public.pagamentos_semanais p
    join public.colaboradores c on c.id = p.colaborador_id
    where p.empresa_id = p_empresa_id
      and (p_colaborador_id is null or p.colaborador_id = p_colaborador_id)
      and (p_semana_inicio is null or p.semana_fim >= p_semana_inicio)
      and (p_semana_fim is null or p.semana_inicio <= p_semana_fim)
    order by p.semana_inicio desc, c.name;
end;
$function$;

CREATE OR REPLACE FUNCTION public.obter_parcelas_da_semana(p_empresa_id uuid, p_semana_inicio date)
 RETURNS TABLE(colaborador_id uuid, valor_parcelas numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  return query
    select p.colaborador_id, sum(p.valor)
    from public.emprestimo_parcelas p
    where p.empresa_id = p_empresa_id
      and p.semana_desconto = p_semana_inicio
      and p.status = 'pendente'
    group by p.colaborador_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.obter_recebimentos(p_empresa_id uuid, p_data_inicio date DEFAULT NULL::date, p_data_fim date DEFAULT NULL::date, p_status text DEFAULT NULL::text, p_cliente_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, cliente_id uuid, cliente_nome text, descricao text, valor numeric, data_prevista date, data_recebimento date, status text, criado_em timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  return query
    select r.id, r.cliente_id, cl.nome, r.descricao, r.valor,
           r.data_prevista, r.data_recebimento, r.status, r.criado_em
    from public.recebimentos r
    join public.clientes cl on cl.id = r.cliente_id
    where r.empresa_id = p_empresa_id
      and (p_data_inicio is null or r.data_prevista >= p_data_inicio)
      and (p_data_fim is null or r.data_prevista <= p_data_fim)
      and (p_status is null or r.status = p_status)
      and (p_cliente_id is null or r.cliente_id = p_cliente_id)
    order by r.data_prevista, r.criado_em;
end;
$function$;

CREATE OR REPLACE FUNCTION public.obter_servicos_catalogo(p_empresa_id uuid)
 RETURNS SETOF servicos_catalogo
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  return query select * from public.servicos_catalogo where empresa_id = p_empresa_id order by nome;
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
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
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

CREATE OR REPLACE FUNCTION public.registrar_valor_hora(p_empresa_id uuid, p_colaborador_id uuid, p_valor_hora numeric, p_vigente_de date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
  if public.get_current_empresa_id() is null then
    raise exception 'not authorized';
  end if;
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

-- ---- EXECUTE: tenant-scoped RPCs are for signed-in users only ----------
revoke execute on function public.aprovar_escala(uuid,text,text) from public, anon;
grant execute on function public.aprovar_escala(uuid,text,text) to authenticated, service_role;
revoke execute on function public.atualizar_categoria_despesa(uuid,text,boolean) from public, anon;
grant execute on function public.atualizar_categoria_despesa(uuid,text,boolean) to authenticated, service_role;
revoke execute on function public.atualizar_cliente(uuid,text,text,text,text) from public, anon;
grant execute on function public.atualizar_cliente(uuid,text,text,text,text) to authenticated, service_role;
revoke execute on function public.atualizar_configuracao_folha(uuid,smallint,numeric,numeric,text) from public, anon;
grant execute on function public.atualizar_configuracao_folha(uuid,smallint,numeric,numeric,text) to authenticated, service_role;
revoke execute on function public.atualizar_configuracao_lembrete(uuid,text,integer,text,text,boolean) from public, anon;
grant execute on function public.atualizar_configuracao_lembrete(uuid,text,integer,text,text,boolean) to authenticated, service_role;
revoke execute on function public.atualizar_despesa(uuid,uuid,text,numeric,date) from public, anon;
grant execute on function public.atualizar_despesa(uuid,uuid,text,numeric,date) to authenticated, service_role;
revoke execute on function public.atualizar_escala(uuid,date,date,time without time zone,time without time zone,text) from public, anon;
grant execute on function public.atualizar_escala(uuid,date,date,time without time zone,time without time zone,text) to authenticated, service_role;
revoke execute on function public.atualizar_recebimento(uuid,uuid,text,numeric,date) from public, anon;
grant execute on function public.atualizar_recebimento(uuid,uuid,text,numeric,date) to authenticated, service_role;
revoke execute on function public.atualizar_servico(uuid,text,integer,numeric,boolean) from public, anon;
grant execute on function public.atualizar_servico(uuid,text,integer,numeric,boolean) to authenticated, service_role;
revoke execute on function public.calcular_pagamento_semanal(uuid,uuid,date) from public, anon;
grant execute on function public.calcular_pagamento_semanal(uuid,uuid,date) to authenticated, service_role;
revoke execute on function public.cancelar_agendamento(uuid,text) from public, anon;
grant execute on function public.cancelar_agendamento(uuid,text) to authenticated, service_role;
revoke execute on function public.criar_agendamento(uuid,uuid,uuid,uuid,date,time without time zone,time without time zone,text) from public, anon;
grant execute on function public.criar_agendamento(uuid,uuid,uuid,uuid,date,time without time zone,time without time zone,text) to authenticated, service_role;
revoke execute on function public.criar_cliente(uuid,text,text,text,text) from public, anon;
grant execute on function public.criar_cliente(uuid,text,text,text,text) to authenticated, service_role;
revoke execute on function public.criar_escala(uuid,uuid,uuid,date,date,time without time zone,time without time zone,text) from public, anon;
grant execute on function public.criar_escala(uuid,uuid,uuid,date,date,time without time zone,time without time zone,text) to authenticated, service_role;
revoke execute on function public.criar_servico(uuid,text,integer,numeric,boolean) from public, anon;
grant execute on function public.criar_servico(uuid,text,integer,numeric,boolean) to authenticated, service_role;
revoke execute on function public.delete_latest_open_period(uuid,uuid) from public, anon;
grant execute on function public.delete_latest_open_period(uuid,uuid) to authenticated, service_role;
revoke execute on function public.garantir_tipos_escala_padrao(uuid) from public, anon;
grant execute on function public.garantir_tipos_escala_padrao(uuid) to authenticated, service_role;
revoke execute on function public.marcar_despesa_paga(uuid,date) from public, anon;
grant execute on function public.marcar_despesa_paga(uuid,date) to authenticated, service_role;
revoke execute on function public.marcar_recebimento_recebido(uuid,date) from public, anon;
grant execute on function public.marcar_recebimento_recebido(uuid,date) to authenticated, service_role;
revoke execute on function public.mover_agendamento(uuid,date,time without time zone,time without time zone,uuid) from public, anon;
grant execute on function public.mover_agendamento(uuid,date,time without time zone,time without time zone,uuid) to authenticated, service_role;
revoke execute on function public.obter_agendamentos(uuid,date,date,uuid,text) from public, anon;
grant execute on function public.obter_agendamentos(uuid,date,date,uuid,text) to authenticated, service_role;
revoke execute on function public.obter_categorias_despesa(uuid) from public, anon;
grant execute on function public.obter_categorias_despesa(uuid) to authenticated, service_role;
revoke execute on function public.obter_clientes(uuid,text) from public, anon;
grant execute on function public.obter_clientes(uuid,text) to authenticated, service_role;
revoke execute on function public.obter_configuracoes_folha(uuid) from public, anon;
grant execute on function public.obter_configuracoes_folha(uuid) to authenticated, service_role;
revoke execute on function public.obter_configuracoes_lembrete(uuid) from public, anon;
grant execute on function public.obter_configuracoes_lembrete(uuid) to authenticated, service_role;
revoke execute on function public.obter_contas_a_pagar_consolidado(uuid,date,date,text) from public, anon;
grant execute on function public.obter_contas_a_pagar_consolidado(uuid,date,date,text) to authenticated, service_role;
revoke execute on function public.obter_despesas(uuid,date,date,text,uuid) from public, anon;
grant execute on function public.obter_despesas(uuid,date,date,text,uuid) to authenticated, service_role;
revoke execute on function public.obter_emprestimos(uuid,uuid,text) from public, anon;
grant execute on function public.obter_emprestimos(uuid,uuid,text) to authenticated, service_role;
revoke execute on function public.obter_escalas(uuid,uuid,date,date) from public, anon;
grant execute on function public.obter_escalas(uuid,uuid,date,date) to authenticated, service_role;
revoke execute on function public.obter_historico_valor_hora(uuid) from public, anon;
grant execute on function public.obter_historico_valor_hora(uuid) to authenticated, service_role;
revoke execute on function public.obter_pagamentos_semanais(uuid,uuid,date,date) from public, anon;
grant execute on function public.obter_pagamentos_semanais(uuid,uuid,date,date) to authenticated, service_role;
revoke execute on function public.obter_parcelas_da_semana(uuid,date) from public, anon;
grant execute on function public.obter_parcelas_da_semana(uuid,date) to authenticated, service_role;
revoke execute on function public.obter_recebimentos(uuid,date,date,text,uuid) from public, anon;
grant execute on function public.obter_recebimentos(uuid,date,date,text,uuid) to authenticated, service_role;
revoke execute on function public.obter_servicos_catalogo(uuid) from public, anon;
grant execute on function public.obter_servicos_catalogo(uuid) to authenticated, service_role;
revoke execute on function public.registrar_pagamento(uuid,uuid,date,date,numeric,numeric,numeric,text,text) from public, anon;
grant execute on function public.registrar_pagamento(uuid,uuid,date,date,numeric,numeric,numeric,text,text) to authenticated, service_role;
revoke execute on function public.registrar_valor_hora(uuid,uuid,numeric,date) from public, anon;
grant execute on function public.registrar_valor_hora(uuid,uuid,numeric,date) to authenticated, service_role;

-- (these four already raised for a NULL company; only anon EXECUTE is removed)
revoke execute on function public.criar_categoria_despesa(text) from public, anon;
grant execute on function public.criar_categoria_despesa(text) to authenticated, service_role;
revoke execute on function public.criar_despesa(uuid,text,text,numeric,date,text) from public, anon;
grant execute on function public.criar_despesa(uuid,text,text,numeric,date,text) to authenticated, service_role;
revoke execute on function public.criar_emprestimo(uuid,numeric,integer,date,text) from public, anon;
grant execute on function public.criar_emprestimo(uuid,numeric,integer,date,text) to authenticated, service_role;
revoke execute on function public.criar_recebimento(uuid,text,numeric,date) from public, anon;
grant execute on function public.criar_recebimento(uuid,text,numeric,date) to authenticated, service_role;

-- ---- functions with no guard at all: service_role only -------------------
revoke execute on function public.audit_company_subscriptions() from public, anon, authenticated;
grant execute on function public.audit_company_subscriptions() to service_role;
revoke execute on function public.try_acquire_job_lock(text, integer) from public, anon, authenticated;
grant execute on function public.try_acquire_job_lock(text, integer) to service_role;
