-- prepareNextPeriod() (periods.js) now closes the previously-open period
-- whenever a new one is created, so that only one period is ever ABERTO
-- at a time (fixes evaluations.js picking a stale period when several
-- were left ABERTO simultaneously). That means delete_latest_open_period,
-- which only ever deleted the row, now leaves the workspace with NO open
-- period after a delete, instead of restoring the one that was open
-- immediately before. This reopens the next-latest (by start_date) period
-- in the same cycle if it's currently FECHADO, restoring the pre-creation
-- state.
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
  if auth.uid() is null then
    raise exception 'Authentication required';
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
