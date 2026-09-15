-- Adds this-month usage to get_finances_ai_limits(), so the AI CONSUMPTION
-- admin section (commercial-admin.html) can show "N of limit" per workspace
-- instead of just the configured limit -- see finances.ai_usage_log
-- (KORbuildFinances repo, 20260914160000_ai_usage_log.sql).
--
-- Counts status='success' rows only, since that's what actually counts
-- against monthly_request_limit in the finances-ai budget gate. The month
-- cutoff is UTC calendar month (date_trunc('month', now() at time zone
-- 'utc')), matching startOfCurrentMonthUtc() in that same gate -- the
-- number shown here must never disagree with what actually blocks a
-- workspace.
--
-- Return columns changed (used_this_month added), so the function must be
-- dropped first -- CREATE OR REPLACE cannot alter the OUT parameter list of
-- an existing function.

drop function if exists public.get_finances_ai_limits();

create function public.get_finances_ai_limits()
returns table(
  workspace_id uuid,
  display_name text,
  country text,
  monthly_request_limit int,
  enabled boolean,
  used_this_month int
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
           coalesce(l.enabled, true),
           (select count(*)::int
            from finances.ai_usage_log u
            where u.workspace_id = w.id
              and u.status = 'success'
              and u.created_at >= date_trunc('month', now() at time zone 'utc'))
    from finances.user_workspaces w
    left join finances.ai_workspace_limits l on l.workspace_id = w.id
    order by w.display_name;
end;
$$;

grant execute on function public.get_finances_ai_limits() to authenticated;
