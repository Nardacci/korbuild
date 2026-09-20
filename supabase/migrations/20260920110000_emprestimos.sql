-- KORbuild · Loans (Empréstimos) -- installment-based advances against
-- future weekly payments, replacing the old single "Empréstimo" number
-- that had to be remembered and re-entered by hand every week.
--
-- empresa_id and colaborador_id are denormalized onto emprestimo_parcelas
-- (not just reachable via emprestimo_id -> emprestimos) -- same pattern
-- already used by historico_valor_hora (which also has empresa_id despite
-- being reachable via colaborador_id): simpler RLS policies, and
-- obter_parcelas_da_semana()/the weekly auto-generation flow both filter
-- directly on (empresa_id, colaborador_id, semana_desconto) without a join.

create table public.emprestimos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  colaborador_id uuid not null references public.colaboradores(id),
  valor_total numeric not null check (valor_total > 0),
  numero_parcelas integer not null check (numero_parcelas >= 1),
  data_concessao date not null default current_date,
  observacoes text,
  criado_por uuid,
  criado_em timestamptz not null default timezone('utc', now())
);

create index emprestimos_empresa_idx on public.emprestimos(empresa_id);
create index emprestimos_colaborador_idx on public.emprestimos(colaborador_id);

alter table public.emprestimos enable row level security;

create policy "usuarios podem visualizar emprestimos da sua empresa"
  on public.emprestimos for select
  using (empresa_id = public.get_current_empresa_id());

-- No direct INSERT/UPDATE/DELETE policy -- writes only through
-- criar_emprestimo() (SECURITY DEFINER), same pattern as other
-- validation-heavy tables in this schema (e.g. company_commercial_terms).

create table public.emprestimo_parcelas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  emprestimo_id uuid not null references public.emprestimos(id) on delete cascade,
  colaborador_id uuid not null references public.colaboradores(id),
  numero_parcela integer not null,
  semana_desconto date not null,
  valor numeric not null check (valor >= 0),
  status text not null default 'pendente' check (status in ('pendente','descontado')),
  pagamento_semanal_id uuid references public.pagamentos_semanais(id),
  descontado_em timestamptz,
  unique (emprestimo_id, numero_parcela)
);

create index emprestimo_parcelas_empresa_semana_idx on public.emprestimo_parcelas(empresa_id, semana_desconto);
create index emprestimo_parcelas_colaborador_idx on public.emprestimo_parcelas(colaborador_id);

alter table public.emprestimo_parcelas enable row level security;

create policy "usuarios podem visualizar parcelas da sua empresa"
  on public.emprestimo_parcelas for select
  using (empresa_id = public.get_current_empresa_id());

-- Creates a loan and splits it into numero_parcelas equal weekly
-- installments starting at p_semana_inicio_desconto (consecutive Mondays/
-- whatever week-start, one every 7 days) -- the last installment absorbs
-- the rounding remainder so the parcelas always sum exactly to valor_total.
create or replace function public.criar_emprestimo(
  p_colaborador_id uuid,
  p_valor_total numeric,
  p_numero_parcelas integer,
  p_semana_inicio_desconto date,
  p_observacoes text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_empresa_id uuid;
  v_emprestimo_id uuid;
  v_valor_parcela numeric;
  v_soma numeric := 0;
  i integer;
begin
  v_empresa_id := public.get_current_empresa_id();
  if v_empresa_id is null then
    raise exception 'not authorized';
  end if;

  if not exists (select 1 from public.colaboradores where id = p_colaborador_id and empresa_id = v_empresa_id) then
    raise exception 'collaborator not found in this company';
  end if;

  if p_valor_total <= 0 then
    raise exception 'valor_total must be greater than zero';
  end if;

  if p_numero_parcelas < 1 then
    raise exception 'numero_parcelas must be at least 1';
  end if;

  insert into public.emprestimos (empresa_id, colaborador_id, valor_total, numero_parcelas, observacoes, criado_por)
  values (v_empresa_id, p_colaborador_id, p_valor_total, p_numero_parcelas, nullif(trim(coalesce(p_observacoes,'')),''), auth.uid())
  returning id into v_emprestimo_id;

  v_valor_parcela := round(p_valor_total / p_numero_parcelas, 2);

  for i in 1..p_numero_parcelas loop
    if i = p_numero_parcelas then
      insert into public.emprestimo_parcelas (empresa_id, emprestimo_id, colaborador_id, numero_parcela, semana_desconto, valor)
      values (v_empresa_id, v_emprestimo_id, p_colaborador_id, i, p_semana_inicio_desconto + ((i - 1) * 7), p_valor_total - v_soma);
    else
      insert into public.emprestimo_parcelas (empresa_id, emprestimo_id, colaborador_id, numero_parcela, semana_desconto, valor)
      values (v_empresa_id, v_emprestimo_id, p_colaborador_id, i, p_semana_inicio_desconto + ((i - 1) * 7), v_valor_parcela);
      v_soma := v_soma + v_valor_parcela;
    end if;
  end loop;

  return v_emprestimo_id;
end;
$$;

grant execute on function public.criar_emprestimo(uuid, numeric, integer, date, text) to authenticated;

-- Flat, one-row-per-installment result (same convention as
-- obter_agendamentos/obter_escalas/obter_pagamentos_semanais) -- loans.js
-- groups by emprestimo_id client-side for the ledger view.
create or replace function public.obter_emprestimos(
  p_empresa_id uuid,
  p_colaborador_id uuid default null,
  p_status text default null
)
returns table(
  emprestimo_id uuid,
  colaborador_id uuid,
  colaborador_nome text,
  valor_total numeric,
  numero_parcelas integer,
  data_concessao date,
  observacoes text,
  parcela_id uuid,
  numero_parcela integer,
  semana_desconto date,
  valor_parcela numeric,
  status_parcela text,
  pagamento_semanal_id uuid,
  descontado_em timestamptz
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
$$;

-- Used by weekly-payments.js's auto-generation to pre-fill "Loan" with the
-- sum of that week's still-pending installments, per collaborator.
create or replace function public.obter_parcelas_da_semana(
  p_empresa_id uuid,
  p_semana_inicio date
)
returns table(colaborador_id uuid, valor_parcelas numeric)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
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
$$;

-- registrar_pagamento() now also marks that week's pending installment(s)
-- as descontado once a payment row folding them into "adiantamento" is
-- registered/updated -- same signature, no new parameters, so this
-- replaces the existing function in place (no overload).
create or replace function public.registrar_pagamento(p_empresa_id uuid, p_colaborador_id uuid, p_semana_inicio date, p_semana_fim date, p_horas_trabalhadas numeric, p_valor_hora_aplicado numeric DEFAULT NULL::numeric, p_adiantamento numeric DEFAULT 0, p_status_pagamento text DEFAULT 'pendente'::text, p_observacoes text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  update public.emprestimo_parcelas
  set status = 'descontado', pagamento_semanal_id = v_id, descontado_em = timezone('utc', now())
  where empresa_id = p_empresa_id
    and colaborador_id = p_colaborador_id
    and semana_desconto = p_semana_inicio
    and status = 'pendente';

  return v_id;
end;
$$;
