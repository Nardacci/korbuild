-- KORbuild · Reminder configuration RPCs

create or replace function public.obter_configuracoes_lembrete(p_empresa_id uuid)
returns setof public.configuracoes_lembrete
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  return query select * from public.configuracoes_lembrete where empresa_id = p_empresa_id;
end;
$$;

grant execute on function public.obter_configuracoes_lembrete(uuid) to authenticated;


create or replace function public.atualizar_configuracao_lembrete(
  p_empresa_id uuid,
  p_canal text,
  p_horas_antes int,
  p_template_assunto text,
  p_template_corpo text,
  p_ativo boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  if p_canal not in ('email','sms','whatsapp') then
    raise exception 'invalid canal: %', p_canal;
  end if;

  if p_horas_antes is null or p_horas_antes <= 0 then
    raise exception 'horas_antes must be greater than zero';
  end if;

  if p_template_assunto is null or btrim(p_template_assunto) = '' then
    raise exception 'template_assunto is required';
  end if;

  if p_template_corpo is null or btrim(p_template_corpo) = '' then
    raise exception 'template_corpo is required';
  end if;

  insert into public.configuracoes_lembrete (
    empresa_id, canal, horas_antes, template_assunto, template_corpo, ativo, atualizado_por, atualizado_em
  ) values (
    p_empresa_id, p_canal, p_horas_antes, p_template_assunto, p_template_corpo, coalesce(p_ativo, true), auth.uid(), timezone('utc'::text, now())
  )
  on conflict (empresa_id) do update set
    canal = excluded.canal,
    horas_antes = excluded.horas_antes,
    template_assunto = excluded.template_assunto,
    template_corpo = excluded.template_corpo,
    ativo = excluded.ativo,
    atualizado_por = excluded.atualizado_por,
    atualizado_em = excluded.atualizado_em;
end;
$$;

grant execute on function public.atualizar_configuracao_lembrete(uuid, text, int, text, text, boolean) to authenticated;
