-- Generic short-lived job lock, used first by mercadopago-reconcile's
-- batch mode to guard against two overlapping cron invocations processing
-- the same rows twice (wasteful duplicate Mercado Pago API calls) if a run
-- ever takes close to or longer than the cron interval.
--
-- Deliberately a plain row + atomic UPDATE/INSERT, not pg_advisory_lock:
-- Edge Functions call Postgres through PostgREST/RPC, which may hand out a
-- different pooled connection per call, and pg_advisory_lock is
-- session-scoped -- a lock acquired on one connection can silently not be
-- visible (or auto-release) on another. A row-based CAS lock has no such
-- issue: acquiring/releasing is a single atomic statement regardless of
-- which physical connection runs it.

create table if not exists public.job_locks (
  job_name text primary key,
  locked_until timestamptz
);

alter table public.job_locks enable row level security;
-- RLS enabled, no policies -- only the security-definer functions below
-- (called via service_role from trusted Edge Functions) touch this table.

create or replace function public.try_acquire_job_lock(p_job_name text, p_lock_seconds integer default 300)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acquired boolean := false;
begin
  insert into public.job_locks (job_name, locked_until)
  values (p_job_name, now() + make_interval(secs => greatest(p_lock_seconds, 1)))
  on conflict (job_name) do update
    set locked_until = excluded.locked_until
    where public.job_locks.locked_until is null or public.job_locks.locked_until < now()
  returning true into v_acquired;

  return coalesce(v_acquired, false);
end;
$$;

grant execute on function public.try_acquire_job_lock(text, integer) to authenticated;
