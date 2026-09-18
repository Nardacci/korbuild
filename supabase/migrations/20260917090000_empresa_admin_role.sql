-- KORbuild · Empresa Admin role
-- Adds a minimal per-tenant admin flag so privileged in-app actions (e.g.
-- approving Schedule entries) can be gated without relying on the
-- platform-level is_korbuild_super_admin(). Mirrors that function's
-- security-definer pattern; a super admin is always treated as an
-- empresa admin too.

alter table public.usuarios
  add column if not exists is_admin boolean not null default false;

comment on column public.usuarios.is_admin is
  'Grants company-level admin actions (e.g. approving Schedule entries). Independent from is_korbuild_super_admin(), which is platform-level.';

create or replace function public.is_empresa_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
begin
  if public.is_korbuild_super_admin() then
    return true;
  end if;

  select u.is_admin into v_is_admin
  from public.usuarios u
  where u.id = auth.uid()
    and u.active = true;

  return coalesce(v_is_admin, false);
end;
$$;

grant execute on function public.is_empresa_admin() to authenticated;
