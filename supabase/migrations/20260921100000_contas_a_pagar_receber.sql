-- KORbuild · Accounts Payable (Contas a Pagar) and Accounts Receivable
-- (Contas a Receber). Follows this project's own RPC-heavy + PL/pgSQL
-- validation convention (criar_agendamento, registrar_pagamento, etc.),
-- NOT the RLS+trigger-only pattern used by KORbuild Finances' expenses/
-- incomes tables (investigated separately as reference, not copied).

-- ============================================================
-- Contas a Pagar: categorias_despesa + despesas
-- ============================================================

create table public.categorias_despesa (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default timezone('utc', now())
);

create index categorias_despesa_empresa_idx on public.categorias_despesa(empresa_id);

alter table public.categorias_despesa enable row level security;

create policy "usuarios podem visualizar categorias de despesa da sua empresa"
  on public.categorias_despesa for select
  using (empresa_id = public.get_current_empresa_id());
create policy "usuarios podem inserir categorias de despesa da sua empresa"
  on public.categorias_despesa for insert
  with check (empresa_id = public.get_current_empresa_id());
create policy "usuarios podem atualizar categorias de despesa da sua empresa"
  on public.categorias_despesa for update
  using (empresa_id = public.get_current_empresa_id())
  with check (empresa_id = public.get_current_empresa_id());

create table public.despesas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  categoria_id uuid references public.categorias_despesa(id) on delete set null,
  descricao text not null,
  tipo text not null check (tipo in ('pontual','recorrente')),
  status text not null default 'provisionado' check (status in ('provisionado','pago','cancelado')),
  valor numeric not null check (valor > 0),
  data_prevista date not null,
  data_pagamento date,
  -- Groups every occurrence generated from the same "recorrente" despesa
  -- (the one entered by the user plus the 12 future ones criar_despesa()
  -- generates for it) -- null for 'pontual' despesas, which stand alone.
  grupo_recorrencia_id uuid,
  frequencia_recorrencia text check (frequencia_recorrencia in ('semanal','mensal','anual')),
  criado_por uuid references public.usuarios(id),
  criado_em timestamptz not null default timezone('utc', now())
);

create index despesas_empresa_idx on public.despesas(empresa_id);
create index despesas_empresa_data_idx on public.despesas(empresa_id, data_prevista);
create index despesas_categoria_idx on public.despesas(categoria_id);
create index despesas_grupo_recorrencia_idx on public.despesas(grupo_recorrencia_id);

alter table public.despesas enable row level security;

create policy "usuarios podem visualizar despesas da sua empresa"
  on public.despesas for select
  using (empresa_id = public.get_current_empresa_id());
create policy "usuarios podem inserir despesas da sua empresa"
  on public.despesas for insert
  with check (empresa_id = public.get_current_empresa_id());
create policy "usuarios podem atualizar despesas da sua empresa"
  on public.despesas for update
  using (empresa_id = public.get_current_empresa_id())
  with check (empresa_id = public.get_current_empresa_id());

-- ============================================================
-- Contas a Receber: recebimentos
-- ============================================================

create table public.recebimentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  descricao text not null,
  valor numeric not null check (valor > 0),
  data_prevista date not null,
  data_recebimento date,
  status text not null default 'pendente' check (status in ('pendente','recebido','cancelado')),
  criado_por uuid references public.usuarios(id),
  criado_em timestamptz not null default timezone('utc', now())
);

create index recebimentos_empresa_idx on public.recebimentos(empresa_id);
create index recebimentos_empresa_data_idx on public.recebimentos(empresa_id, data_prevista);
create index recebimentos_cliente_idx on public.recebimentos(cliente_id);

alter table public.recebimentos enable row level security;

create policy "usuarios podem visualizar recebimentos da sua empresa"
  on public.recebimentos for select
  using (empresa_id = public.get_current_empresa_id());
create policy "usuarios podem inserir recebimentos da sua empresa"
  on public.recebimentos for insert
  with check (empresa_id = public.get_current_empresa_id());
create policy "usuarios podem atualizar recebimentos da sua empresa"
  on public.recebimentos for update
  using (empresa_id = public.get_current_empresa_id())
  with check (empresa_id = public.get_current_empresa_id());

-- ============================================================
-- RPCs: categorias_despesa
-- ============================================================

create or replace function public.criar_categoria_despesa(p_nome text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_empresa_id uuid;
  v_id uuid;
begin
  v_empresa_id := public.get_current_empresa_id();
  if v_empresa_id is null then
    raise exception 'not authorized';
  end if;

  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'nome is required';
  end if;

  insert into public.categorias_despesa (empresa_id, nome)
  values (v_empresa_id, btrim(p_nome))
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.criar_categoria_despesa(text) to authenticated;

create or replace function public.obter_categorias_despesa(p_empresa_id uuid)
returns setof public.categorias_despesa
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  return query select * from public.categorias_despesa where empresa_id = p_empresa_id order by nome;
end;
$$;

grant execute on function public.obter_categorias_despesa(uuid) to authenticated;

create or replace function public.atualizar_categoria_despesa(p_categoria_id uuid, p_nome text, p_ativo boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_empresa_id uuid;
begin
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
$$;

grant execute on function public.atualizar_categoria_despesa(uuid, text, boolean) to authenticated;

-- ============================================================
-- RPCs: despesas
-- ============================================================

-- Creates a despesa; when p_tipo = 'recorrente', also generates the next
-- 12 FUTURE occurrences (spaced by p_frequencia_recorrencia from
-- p_data_prevista), all sharing one grupo_recorrencia_id with the
-- originally-created row -- 13 rows total per recurring despesa, all
-- 'provisionado'. Returns the id of the despesa actually entered (the
-- first occurrence), not the generated ones.
create or replace function public.criar_despesa(
  p_categoria_id uuid,
  p_descricao text,
  p_tipo text,
  p_valor numeric,
  p_data_prevista date,
  p_frequencia_recorrencia text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_empresa_id uuid;
  v_id uuid;
  v_grupo_id uuid;
  v_next_date date;
  i integer;
begin
  v_empresa_id := public.get_current_empresa_id();
  if v_empresa_id is null then
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

  if p_tipo not in ('pontual','recorrente') then
    raise exception 'invalid tipo: %', p_tipo;
  end if;

  if p_valor <= 0 then
    raise exception 'valor must be greater than zero';
  end if;

  if p_tipo = 'recorrente' and p_frequencia_recorrencia not in ('semanal','mensal','anual') then
    raise exception 'frequencia_recorrencia is required and must be semanal, mensal or anual for a recurring despesa';
  end if;

  if p_tipo = 'recorrente' then
    v_grupo_id := gen_random_uuid();
  end if;

  insert into public.despesas (
    empresa_id, categoria_id, descricao, tipo, status, valor, data_prevista,
    grupo_recorrencia_id, frequencia_recorrencia, criado_por
  ) values (
    v_empresa_id, p_categoria_id, btrim(p_descricao), p_tipo, 'provisionado', p_valor, p_data_prevista,
    v_grupo_id, case when p_tipo = 'recorrente' then p_frequencia_recorrencia else null end, auth.uid()
  )
  returning id into v_id;

  if p_tipo = 'recorrente' then
    for i in 1..12 loop
      v_next_date := case p_frequencia_recorrencia
        when 'semanal' then p_data_prevista + (i * 7)
        when 'mensal' then (p_data_prevista + (i || ' months')::interval)::date
        when 'anual' then (p_data_prevista + (i || ' years')::interval)::date
      end;

      insert into public.despesas (
        empresa_id, categoria_id, descricao, tipo, status, valor, data_prevista,
        grupo_recorrencia_id, frequencia_recorrencia, criado_por
      ) values (
        v_empresa_id, p_categoria_id, btrim(p_descricao), p_tipo, 'provisionado', p_valor, v_next_date,
        v_grupo_id, p_frequencia_recorrencia, auth.uid()
      );
    end loop;
  end if;

  return v_id;
end;
$$;

grant execute on function public.criar_despesa(uuid, text, text, numeric, date, text) to authenticated;

create or replace function public.obter_despesas(
  p_empresa_id uuid,
  p_data_inicio date default null,
  p_data_fim date default null,
  p_status text default null,
  p_categoria_id uuid default null
)
returns table(
  id uuid,
  categoria_id uuid,
  categoria_nome text,
  descricao text,
  tipo text,
  status text,
  valor numeric,
  data_prevista date,
  data_pagamento date,
  grupo_recorrencia_id uuid,
  frequencia_recorrencia text,
  criado_em timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
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
$$;

grant execute on function public.obter_despesas(uuid, date, date, text, uuid) to authenticated;

-- Edits a single occurrence (not the whole recurring group) -- descricao,
-- categoria, valor and data_prevista only. Status changes go through
-- marcar_despesa_paga(); tipo/frequencia_recorrencia are fixed at
-- creation, converting pontual<->recorrente after the fact is out of
-- scope.
create or replace function public.atualizar_despesa(
  p_despesa_id uuid,
  p_categoria_id uuid,
  p_descricao text,
  p_valor numeric,
  p_data_prevista date
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_empresa_id uuid;
begin
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
$$;

grant execute on function public.atualizar_despesa(uuid, uuid, text, numeric, date) to authenticated;

create or replace function public.marcar_despesa_paga(p_despesa_id uuid, p_data_pagamento date default current_date)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_empresa_id uuid;
begin
  select empresa_id into v_empresa_id from public.despesas where id = p_despesa_id;

  if v_empresa_id is null or v_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  update public.despesas set
    status = 'pago',
    data_pagamento = coalesce(p_data_pagamento, current_date)
  where id = p_despesa_id;
end;
$$;

grant execute on function public.marcar_despesa_paga(uuid, date) to authenticated;

-- ============================================================
-- RPCs: recebimentos
-- ============================================================

create or replace function public.criar_recebimento(
  p_cliente_id uuid,
  p_descricao text,
  p_valor numeric,
  p_data_prevista date
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_empresa_id uuid;
  v_id uuid;
begin
  v_empresa_id := public.get_current_empresa_id();
  if v_empresa_id is null then
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

  insert into public.recebimentos (empresa_id, cliente_id, descricao, valor, data_prevista, criado_por)
  values (v_empresa_id, p_cliente_id, btrim(p_descricao), p_valor, p_data_prevista, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.criar_recebimento(uuid, text, numeric, date) to authenticated;

create or replace function public.obter_recebimentos(
  p_empresa_id uuid,
  p_data_inicio date default null,
  p_data_fim date default null,
  p_status text default null,
  p_cliente_id uuid default null
)
returns table(
  id uuid,
  cliente_id uuid,
  cliente_nome text,
  descricao text,
  valor numeric,
  data_prevista date,
  data_recebimento date,
  status text,
  criado_em timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
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
$$;

grant execute on function public.obter_recebimentos(uuid, date, date, text, uuid) to authenticated;

create or replace function public.atualizar_recebimento(
  p_recebimento_id uuid,
  p_cliente_id uuid,
  p_descricao text,
  p_valor numeric,
  p_data_prevista date
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_empresa_id uuid;
begin
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
$$;

grant execute on function public.atualizar_recebimento(uuid, uuid, text, numeric, date) to authenticated;

create or replace function public.marcar_recebimento_recebido(p_recebimento_id uuid, p_data_recebimento date default current_date)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_empresa_id uuid;
begin
  select empresa_id into v_empresa_id from public.recebimentos where id = p_recebimento_id;

  if v_empresa_id is null or v_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  update public.recebimentos set
    status = 'recebido',
    data_recebimento = coalesce(p_data_recebimento, current_date)
  where id = p_recebimento_id;
end;
$$;

grant execute on function public.marcar_recebimento_recebido(uuid, date) to authenticated;

-- ============================================================
-- Consolidated Accounts Payable view: despesas + pagamentos_semanais
-- ============================================================

-- Folds despesas together with the payroll's own pagamentos_semanais so
-- Accounts Payable can show one list without the frontend re-implementing
-- either source's calculation. The two sources use different status
-- vocabularies (despesas: provisionado/pago/cancelado; pagamentos_
-- semanais: pendente/parcial/pago) -- p_status is passed through as a
-- literal filter against BOTH, so only 'pago' meaningfully matches across
-- both origins; the frontend labels each row's status per its own origem.
create or replace function public.obter_contas_a_pagar_consolidado(
  p_empresa_id uuid,
  p_data_inicio date default null,
  p_data_fim date default null,
  p_status text default null
)
returns table(
  origem text,
  referencia_id uuid,
  descricao text,
  valor numeric,
  data date,
  status text
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  -- ORDER BY on a bare UNION ALL can only reference result column names,
  -- not expressions -- wrapping in a subquery with explicit aliases lets
  -- it reference x.data/x.descricao cleanly.
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
$$;

grant execute on function public.obter_contas_a_pagar_consolidado(uuid, date, date, text) to authenticated;
