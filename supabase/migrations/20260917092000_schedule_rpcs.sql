-- KORbuild · Schedule module RPCs
-- Same security-definer + explicit empresa_id check pattern used by
-- prepare_period_evaluations / delete_latest_open_period / the
-- finances AI limit RPCs.

create or replace function public.garantir_tipos_escala_padrao(p_empresa_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
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
$$;

grant execute on function public.garantir_tipos_escala_padrao(uuid) to authenticated;


create or replace function public.obter_escalas(
  p_empresa_id uuid,
  p_colaborador_id uuid default null,
  p_data_inicio date default null,
  p_data_fim date default null
)
returns table (
  id uuid,
  colaborador_id uuid,
  colaborador_nome text,
  tipo_escala_id uuid,
  tipo_codigo text,
  tipo_rotulo text,
  tipo_cor text,
  data_inicio date,
  data_fim date,
  hora_inicio time,
  hora_fim time,
  status text,
  observacoes text,
  criado_por uuid,
  aprovado_por uuid,
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
$$;

grant execute on function public.obter_escalas(uuid, uuid, date, date) to authenticated;


create or replace function public.criar_escala(
  p_empresa_id uuid,
  p_colaborador_id uuid,
  p_tipo_escala_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_hora_inicio time default null,
  p_hora_fim time default null,
  p_observacoes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requer_aprovacao boolean;
  v_status text;
  v_id uuid;
begin
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
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
$$;

grant execute on function public.criar_escala(uuid, uuid, uuid, date, date, time, time, text) to authenticated;


create or replace function public.atualizar_escala(
  p_escala_id uuid,
  p_data_inicio date default null,
  p_data_fim date default null,
  p_hora_inicio time default null,
  p_hora_fim time default null,
  p_observacoes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid;
  v_status text;
  v_new_inicio date;
  v_new_fim date;
begin
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
$$;

grant execute on function public.atualizar_escala(uuid, date, date, time, time, text) to authenticated;


-- Handles approve / reject / confirm in one call: every status transition
-- away from 'pendente' requires is_empresa_admin(), independent of what the
-- UI happens to show the caller.
create or replace function public.aprovar_escala(
  p_escala_id uuid,
  p_status text,
  p_observacoes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid;
  v_current_status text;
begin
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
$$;

grant execute on function public.aprovar_escala(uuid, text, text) to authenticated;
