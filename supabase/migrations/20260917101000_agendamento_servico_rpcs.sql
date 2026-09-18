-- KORbuild · Customer Service Scheduling module RPCs

-- Internal helper: not granted to `authenticated`. Called only from inside
-- other SECURITY DEFINER functions below, which already run with the
-- definer's (owner's) privileges, so no separate grant is needed for it to
-- be callable from criar_agendamento/mover_agendamento.
create or replace function public._agendamento_conflito(
  p_empresa_id uuid,
  p_colaborador_id uuid,
  p_data date,
  p_hora_inicio time,
  p_hora_fim time,
  p_excluir_id uuid default null
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.agendamentos_servico a
    where a.empresa_id = p_empresa_id
      and a.colaborador_id = p_colaborador_id
      and a.data = p_data
      and a.status <> 'cancelado'
      and (p_excluir_id is null or a.id <> p_excluir_id)
      and a.hora_inicio < p_hora_fim
      and a.hora_fim > p_hora_inicio
  );
$$;


create or replace function public.obter_clientes(p_empresa_id uuid, p_busca text default null)
returns setof public.clientes
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  return query
    select * from public.clientes
    where empresa_id = p_empresa_id
      and (p_busca is null or nome ilike '%'||p_busca||'%' or email ilike '%'||p_busca||'%')
    order by nome;
end;
$$;

grant execute on function public.obter_clientes(uuid, text) to authenticated;


create or replace function public.criar_cliente(
  p_empresa_id uuid,
  p_nome text,
  p_email text,
  p_telefone text default null,
  p_endereco text default null
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
$$;

grant execute on function public.criar_cliente(uuid, text, text, text, text) to authenticated;


create or replace function public.atualizar_cliente(
  p_cliente_id uuid,
  p_nome text,
  p_email text,
  p_telefone text default null,
  p_endereco text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid;
begin
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
$$;

grant execute on function public.atualizar_cliente(uuid, text, text, text, text) to authenticated;


create or replace function public.obter_servicos_catalogo(p_empresa_id uuid)
returns setof public.servicos_catalogo
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  return query select * from public.servicos_catalogo where empresa_id = p_empresa_id order by nome;
end;
$$;

grant execute on function public.obter_servicos_catalogo(uuid) to authenticated;


create or replace function public.criar_servico(
  p_empresa_id uuid,
  p_nome text,
  p_duracao_padrao_minutos int,
  p_preco_padrao numeric,
  p_ativo boolean default true
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
$$;

grant execute on function public.criar_servico(uuid, text, int, numeric, boolean) to authenticated;


create or replace function public.atualizar_servico(
  p_servico_id uuid,
  p_nome text,
  p_duracao_padrao_minutos int,
  p_preco_padrao numeric,
  p_ativo boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid;
begin
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
$$;

grant execute on function public.atualizar_servico(uuid, text, int, numeric, boolean) to authenticated;


create or replace function public.obter_agendamentos(
  p_empresa_id uuid,
  p_data_inicio date default null,
  p_data_fim date default null,
  p_colaborador_id uuid default null,
  p_status text default null
)
returns table (
  id uuid,
  cliente_id uuid,
  cliente_nome text,
  colaborador_id uuid,
  colaborador_nome text,
  servico_id uuid,
  servico_nome text,
  data date,
  hora_inicio time,
  hora_fim time,
  status text,
  observacoes text,
  criado_em timestamptz,
  atualizado_em timestamptz
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
$$;

grant execute on function public.obter_agendamentos(uuid, date, date, uuid, text) to authenticated;


create or replace function public.criar_agendamento(
  p_empresa_id uuid,
  p_cliente_id uuid,
  p_colaborador_id uuid,
  p_servico_id uuid,
  p_data date,
  p_hora_inicio time,
  p_hora_fim time,
  p_observacoes text default null
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
$$;

grant execute on function public.criar_agendamento(uuid, uuid, uuid, uuid, date, time, time, text) to authenticated;


-- Used by the calendar's drag-and-drop. Never persists a change that would
-- overlap another (non-cancelled) appointment for the same collaborator.
create or replace function public.mover_agendamento(
  p_agendamento_id uuid,
  p_nova_data date,
  p_novo_hora_inicio time,
  p_novo_hora_fim time
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid;
  v_colaborador_id uuid;
begin
  select empresa_id, colaborador_id into v_empresa_id, v_colaborador_id
  from public.agendamentos_servico
  where id = p_agendamento_id;

  if v_empresa_id is null or v_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  if p_novo_hora_fim <= p_novo_hora_inicio then
    raise exception 'hora_fim must be after hora_inicio';
  end if;

  if public._agendamento_conflito(v_empresa_id, v_colaborador_id, p_nova_data, p_novo_hora_inicio, p_novo_hora_fim, p_agendamento_id) then
    raise exception 'schedule conflict: this collaborator already has an appointment overlapping this time';
  end if;

  begin
    update public.agendamentos_servico set
      data = p_nova_data,
      hora_inicio = p_novo_hora_inicio,
      hora_fim = p_novo_hora_fim,
      atualizado_em = timezone('utc'::text, now())
    where id = p_agendamento_id;
  exception when exclusion_violation then
    raise exception 'schedule conflict: this collaborator already has an appointment overlapping this time';
  end;
end;
$$;

grant execute on function public.mover_agendamento(uuid, date, time, time) to authenticated;


create or replace function public.cancelar_agendamento(
  p_agendamento_id uuid,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid;
begin
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
$$;

grant execute on function public.cancelar_agendamento(uuid, text) to authenticated;
