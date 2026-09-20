-- KORbuild · align Payment's "week" with Bonus's period rule.
--
-- Bonus (periods.js) treats a week as a FIXED 6-day span, Monday through
-- Saturday, Sunday never counting -- driven by
-- configuracoes_operacionais.period_start_day/period_end_day (default 1/6),
-- with the end date computed as:
--   delta = (period_end_day - start.getDay() + 7) % 7
--   end   = start + delta days
-- (periods.js's own prepareNextPeriod(), see nextConfiguredPeriodStart()/
-- the inline "end" calculation).
--
-- Payment (calcular_pagamento_semanal) instead hardcoded
-- v_semana_fim := p_semana_inicio + 6 -- a plain 7-day window -- AND every
-- JS caller sourced its "week start day" from a completely different,
-- independently user-editable setting (configuracoes_folha.dia_inicio_
-- semana, changeable in Payroll Settings), instead of Bonus's
-- configuracoes_operacionais.period_start_day. Two separate bugs, same
-- root cause: Payment never actually looked at the same config Bonus
-- uses. This fixes the RPC side; the JS side (weekly-payments.js,
-- people-form.js, loans.js, dashboard-financial.js) is fixed in the same
-- commit to read configuracoes_operacionais instead of configuracoes_folha
-- for week boundaries.
--
-- configuracoes_folha.dia_inicio_semana / Payroll Settings' "Week start
-- day" field are left untouched (still stored, still editable) but are no
-- longer consulted anywhere for week-boundary math -- flagged separately,
-- not removed here, since removing a form field is a UI decision, not a
-- calculation-correctness one.
create or replace function public.calcular_pagamento_semanal(p_empresa_id uuid, p_colaborador_id uuid, p_semana_inicio date)
RETURNS TABLE(horas_trabalhadas numeric, valor_hora_aplicado numeric, valor_bruto numeric, semana_fim date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_period_start_day int;
  v_period_end_day int;
  v_delta int;
  v_semana_fim date;
  v_horas numeric;
  v_valor_hora numeric;
begin
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
$$;
