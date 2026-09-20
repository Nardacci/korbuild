-- KORbuild · Payment module currency configurability.
--
-- Payment (weekly-payments.html / people-form.html's Hourly rate section)
-- was hardcoded to BRL -- wrong for companies outside Brazil. This adds a
-- per-company currency to configuracoes_folha (default 'BRL' so existing
-- rows/behavior don't change), reusing the same USD/EUR/BRL vocabulary
-- already used by commercial_pricing_settings.currency elsewhere in this
-- schema. obter_configuracoes_folha() returns SETOF configuracoes_folha,
-- so it picks up the new column automatically -- no change needed there.

alter table public.configuracoes_folha
  add column if not exists currency text not null default 'BRL';

-- atualizar_configuracao_folha() gets a 5th parameter -- CREATE OR REPLACE
-- with a different argument list creates a new overload rather than
-- replacing the old one, so the old 4-arg version is explicitly dropped
-- below (same gotcha hit earlier this session with mover_agendamento).
create or replace function public.atualizar_configuracao_folha(
  p_empresa_id uuid,
  p_dia_inicio_semana smallint,
  p_horas_padrao_semana numeric,
  p_multiplicador_hora_extra numeric,
  p_currency text default 'BRL'
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_empresa_id <> public.get_current_empresa_id() then
    raise exception 'not authorized';
  end if;

  if p_dia_inicio_semana not between 0 and 6 then
    raise exception 'dia_inicio_semana must be between 0 and 6';
  end if;

  if p_horas_padrao_semana <= 0 then
    raise exception 'horas_padrao_semana must be greater than zero';
  end if;

  if p_multiplicador_hora_extra < 1 then
    raise exception 'multiplicador_hora_extra must be 1 or greater';
  end if;

  if p_currency not in ('USD','EUR','BRL') then
    raise exception 'invalid currency: %', p_currency;
  end if;

  insert into public.configuracoes_folha (
    empresa_id, dia_inicio_semana, horas_padrao_semana, multiplicador_hora_extra, currency, atualizado_por, atualizado_em
  ) values (
    p_empresa_id, p_dia_inicio_semana, p_horas_padrao_semana, p_multiplicador_hora_extra, p_currency, auth.uid(), timezone('utc'::text, now())
  )
  on conflict (empresa_id) do update set
    dia_inicio_semana = excluded.dia_inicio_semana,
    horas_padrao_semana = excluded.horas_padrao_semana,
    multiplicador_hora_extra = excluded.multiplicador_hora_extra,
    currency = excluded.currency,
    atualizado_por = excluded.atualizado_por,
    atualizado_em = excluded.atualizado_em;
end;
$$;

drop function if exists public.atualizar_configuracao_folha(uuid, smallint, numeric, numeric);
