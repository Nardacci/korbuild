-- KORbuild Finances AI consumption limits, managed from Commercial
-- Administration (commercial-admin.html). Scoped by
-- finances.user_workspaces (workspace_id) -- intentionally independent
-- from the empresa_id-scoped commercial tables above (KORbuild Finances
-- has no relation to empresa_id; the two tenant models are separate).
--
-- Access is exclusively through the security-definer RPCs below. RLS is
-- enabled with no policies, so the table is unreachable via direct
-- PostgREST access even by a super admin -- this avoids opening a write
-- policy on a table that affects cost/billing.

create table if not exists finances.ai_workspace_limits (
  workspace_id uuid primary key references finances.user_workspaces(id),
  monthly_request_limit int not null default 100,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table finances.ai_workspace_limits enable row level security;
-- no policies: only get_finances_ai_limits()/update_finances_ai_limit()
-- (both security definer) may read or write this table.

create or replace function public.get_finances_ai_limits()
returns table(
  workspace_id uuid,
  display_name text,
  country text,
  monthly_request_limit int,
  enabled boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_korbuild_super_admin() then
    raise exception 'not authorized';
  end if;

  return query
    select w.id, w.display_name, w.country,
           coalesce(l.monthly_request_limit, 100),
           coalesce(l.enabled, true)
    from finances.user_workspaces w
    left join finances.ai_workspace_limits l on l.workspace_id = w.id
    order by w.display_name;
end;
$$;

create or replace function public.update_finances_ai_limit(
  p_workspace_id uuid,
  p_monthly_request_limit int,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_korbuild_super_admin() then
    raise exception 'not authorized';
  end if;

  if p_monthly_request_limit < 0 then
    raise exception 'monthly_request_limit must be >= 0';
  end if;

  insert into finances.ai_workspace_limits (workspace_id, monthly_request_limit, enabled, updated_by, updated_at)
  values (p_workspace_id, p_monthly_request_limit, p_enabled, auth.uid(), now())
  on conflict (workspace_id) do update
    set monthly_request_limit = excluded.monthly_request_limit,
        enabled = excluded.enabled,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;
end;
$$;

grant execute on function public.get_finances_ai_limits() to authenticated;
grant execute on function public.update_finances_ai_limit(uuid, int, boolean) to authenticated;
