-- Additive-only: dragging an appointment to a different resource column in
-- the new DayPilot resource-view calendar means reassigning it to a
-- different collaborator, which mover_agendamento never supported (only
-- date/time). p_novo_colaborador_id defaults to NULL, in which case
-- behavior is byte-for-byte identical to before (coalesce falls back to
-- the existing colaborador_id) -- the conflict check and the reassignment
-- both key off the same resolved collaborator, so dragging onto a
-- collaborator who already has an overlapping appointment still correctly
-- raises the same "schedule conflict" exception, now checked against the
-- NEW collaborator when one is provided.
CREATE OR REPLACE FUNCTION public.mover_agendamento(p_agendamento_id uuid, p_nova_data date, p_novo_hora_inicio time without time zone, p_novo_hora_fim time without time zone, p_novo_colaborador_id uuid DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_empresa_id uuid;
  v_colaborador_id uuid;
  v_target_colaborador_id uuid;
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

  v_target_colaborador_id := coalesce(p_novo_colaborador_id, v_colaborador_id);

  if v_target_colaborador_id <> v_colaborador_id then
    if not exists (select 1 from public.colaboradores where id = v_target_colaborador_id and empresa_id = v_empresa_id and active = true) then
      raise exception 'target collaborator not found in this company';
    end if;
  end if;

  if public._agendamento_conflito(v_empresa_id, v_target_colaborador_id, p_nova_data, p_novo_hora_inicio, p_novo_hora_fim, p_agendamento_id) then
    raise exception 'schedule conflict: this collaborator already has an appointment overlapping this time';
  end if;

  begin
    update public.agendamentos_servico set
      data = p_nova_data,
      hora_inicio = p_novo_hora_inicio,
      hora_fim = p_novo_hora_fim,
      colaborador_id = v_target_colaborador_id,
      atualizado_em = timezone('utc'::text, now())
    where id = p_agendamento_id;
  exception when exclusion_violation then
    raise exception 'schedule conflict: this collaborator already has an appointment overlapping this time';
  end;
end;
$function$;
