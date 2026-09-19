-- KORbuild · RLS audit fixes #1 and #2 (see LEVANTAMENTO security audit,
-- 2026-09-19). Both close cross-tenant risks found while auditing every
-- SECURITY DEFINER function that accepts a client-supplied empresa_id.

-- #1 CRITICAL: delete_latest_open_period() checked auth.uid() IS NOT NULL
-- but never validated that p_empresa_id belonged to the calling user's own
-- company -- any authenticated user, from any company, could delete
-- another company's open bonus period (and its lancamentos/ocorrencias)
-- by supplying that company's period_id + empresa_id. Same signature,
-- same body, with the standard ownership check added first (matches every
-- other RPC in this schema that takes p_empresa_id).
create or replace function public.delete_latest_open_period(p_period_id uuid, p_empresa_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_period public.periodos%rowtype;
  v_latest_id uuid;
  v_reopen_id uuid;
begin
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
$$;

-- #2 MEDIUM: _agendamento_conflito() is an internal helper (leading
-- underscore convention) with no session check at all, but was left
-- callable directly via PostgREST by anon/authenticated -- an unauthenticated
-- caller could probe whether an arbitrary colaborador_id at an arbitrary
-- empresa_id has a scheduling conflict at a given time (cross-tenant
-- existence oracle). Its only two callers, criar_agendamento() and
-- mover_agendamento(), are SECURITY DEFINER functions that already validate
-- p_empresa_id against the session before calling it, and an internal call
-- from one SECURITY DEFINER function to another does not need the caller's
-- own EXECUTE grant -- same lockdown already applied to
-- finances._start_trial_clock().
revoke execute on function public._agendamento_conflito(uuid, uuid, date, time without time zone, time without time zone, uuid) from public, anon, authenticated;
