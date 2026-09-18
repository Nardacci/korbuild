-- KORbuild · Employee Payment module RPCs

create or replace function public.obter_configuracoes_folha(p_empresa_id uuid)
returns setof public.configuracoes_folha
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  return query select * from public.configuracoes_folha where empresa_id = p_empresa_id;
end;
$$;

grant execute on function public.obter_configuracoes_folha(uuid) to authenticated;


create or replace function public.atualizar_configuracao_folha(
  p_empresa_id uuid,
  p_dia_inicio_semana smallint,
  p_horas_padrao_semana numeric,
  p_multiplicador_hora_extra numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
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

  insert into public.configuracoes_folha (
    empresa_id, dia_inicio_semana, horas_padrao_semana, multiplicador_hora_extra, atualizado_por, atualizado_em
  ) values (
    p_empresa_id, p_dia_inicio_semana, p_horas_padrao_semana, p_multiplicador_hora_extra, auth.uid(), timezone('utc'::text, now())
  )
  on conflict (empresa_id) do update set
    dia_inicio_semana = excluded.dia_inicio_semana,
    horas_padrao_semana = excluded.horas_padrao_semana,
    multiplicador_hora_extra = excluded.multiplicador_hora_extra,
    atualizado_por = excluded.atualizado_por,
    atualizado_em = excluded.atualizado_em;
end;
$$;

grant execute on function public.atualizar_configuracao_folha(uuid, smallint, numeric, numeric) to authenticated;


create or replace function public.obter_historico_valor_hora(p_colaborador_id uuid)
returns setof public.historico_valor_hora
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid;
begin
  select empresa_id into v_empresa_id from public.colaboradores where id = p_colaborador_id;

  if v_empresa_id is null or v_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  return query
    select * from public.historico_valor_hora
    where colaborador_id = p_colaborador_id
    order by vigente_de desc;
end;
$$;

grant execute on function public.obter_historico_valor_hora(uuid) to authenticated;


-- Registers a new hourly rate and automatically closes whatever rate was
-- open-ended (vigente_ate IS NULL) before it, the day before the new rate
-- starts. Past pagamentos_semanais rows are never touched: they already
-- carry their own valor_hora_aplicado snapshot.
create or replace function public.registrar_valor_hora(
  p_empresa_id uuid,
  p_colaborador_id uuid,
  p_valor_hora numeric,
  p_vigente_de date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
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
$$;

grant execute on function public.registrar_valor_hora(uuid, uuid, numeric, date) to authenticated;


-- Preview only: sums hours from 'turno' Schedule entries (aprovado/confirmado)
-- overlapping the given week x the hourly rate in effect at semana_inicio.
-- Nothing is persisted here — see registrar_pagamento() for that.
create or replace function public.calcular_pagamento_semanal(
  p_empresa_id uuid,
  p_colaborador_id uuid,
  p_semana_inicio date
)
returns table (
  horas_trabalhadas numeric,
  valor_hora_aplicado numeric,
  valor_bruto numeric,
  semana_fim date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_semana_fim date;
  v_horas numeric;
  v_valor_hora numeric;
begin
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  v_semana_fim := p_semana_inicio + 6;

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

grant execute on function public.calcular_pagamento_semanal(uuid, uuid, date) to authenticated;


-- Persists a weekly payment. p_valor_hora_aplicado defaults to the rate in
-- effect at semana_inicio (same lookup as calcular_pagamento_semanal), but
-- the caller may override horas_trabalhadas/adiantamento before saving.
-- valor_bruto/valor_liquido are always recomputed here, never trusted from
-- the client, so the persisted amounts can't drift from the inputs. Once
-- saved, this row is a snapshot: a later registrar_valor_hora() call never
-- rewrites it.
create or replace function public.registrar_pagamento(
  p_empresa_id uuid,
  p_colaborador_id uuid,
  p_semana_inicio date,
  p_semana_fim date,
  p_horas_trabalhadas numeric,
  p_valor_hora_aplicado numeric default null,
  p_adiantamento numeric default 0,
  p_status_pagamento text default 'pendente',
  p_observacoes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_valor_hora numeric;
  v_valor_bruto numeric;
  v_valor_liquido numeric;
  v_id uuid;
begin
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
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

  return v_id;
end;
$$;

grant execute on function public.registrar_pagamento(uuid, uuid, date, date, numeric, numeric, numeric, text, text) to authenticated;


create or replace function public.obter_pagamentos_semanais(
  p_empresa_id uuid,
  p_colaborador_id uuid default null,
  p_semana_inicio date default null,
  p_semana_fim date default null
)
returns table (
  id uuid,
  colaborador_id uuid,
  colaborador_nome text,
  semana_inicio date,
  semana_fim date,
  horas_trabalhadas numeric,
  valor_hora_aplicado numeric,
  valor_bruto numeric,
  adiantamento numeric,
  valor_liquido numeric,
  status_pagamento text,
  pago_em timestamptz,
  observacoes text,
  criado_em timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
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
$$;

grant execute on function public.obter_pagamentos_semanais(uuid, uuid, date, date) to authenticated;
