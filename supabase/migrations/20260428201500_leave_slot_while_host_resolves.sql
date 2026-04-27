-- Выход игрока из комнаты, пока room_phase = waiting_host_action | waiting_return.
-- mark_player_absent разрешён только при room_phase = playing — иначе гость «застревает»
-- на столе: leaveRoom падает, а App.tsx снова открывает #game по online.roomId.

create or replace function public.updown_leave_slot_while_host_resolves(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.game_rooms%rowtype;
  uid uuid := auth.uid();
  slots jsonb;
  len int;
  i int;
  found_i int := null;
  elem jsonb;
  new_arr jsonb := '[]'::jsonb;
  new_host uuid := null;
  cand text;
  absent_flag boolean;
  names text[] := array['ИИ Север', 'ИИ Восток', 'ИИ Юг', 'ИИ Запад'];
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into r from public.game_rooms where id = p_room_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if r.status is distinct from 'playing' then
    return jsonb_build_object('ok', false, 'error', 'not_playing');
  end if;
  if r.room_phase is distinct from 'waiting_host_action' and r.room_phase is distinct from 'waiting_return' then
    return jsonb_build_object('ok', false, 'error', 'wrong_room_phase');
  end if;

  slots := coalesce(to_jsonb(r.player_slots), '[]'::jsonb);
  if jsonb_typeof(slots) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'bad_slots');
  end if;
  len := jsonb_array_length(slots);
  for i in 0..(len - 1) loop
    if lower(nullif(trim(slots->i->>'userId'), '')) = lower(uid::text) then
      found_i := i;
      exit;
    end if;
  end loop;
  if found_i is null then
    return jsonb_build_object('ok', false, 'error', 'not_in_room');
  end if;

  for i in 0..(len - 1) loop
    if i = found_i then
      elem := jsonb_build_object(
        'slotIndex', i,
        'displayName', names[i + 1],
        'userId', null,
        'absent', false
      );
      new_arr := new_arr || jsonb_build_array(elem);
    else
      new_arr := new_arr || jsonb_build_array(slots->i);
    end if;
  end loop;

  if r.host_user_id is not null and lower(r.host_user_id::text) = lower(uid::text) then
    for i in 0..(len - 1) loop
      if i = found_i then
        continue;
      end if;
      elem := new_arr->i;
      cand := nullif(trim(elem->>'userId'), '');
      absent_flag := coalesce((elem->>'absent')::boolean, false);
      if cand is not null and lower(cand) <> lower(uid::text) and not absent_flag then
        new_host := cand::uuid;
        exit;
      end if;
    end loop;
  end if;

  update public.game_rooms
  set
    player_slots = new_arr::json,
    host_user_id = case
      when lower(coalesce(r.host_user_id::text, '')) = lower(uid::text) then new_host
      else r.host_user_id
    end,
    host_last_seen_at = case
      when new_host is not null then now()
      when lower(coalesce(r.host_user_id::text, '')) = lower(uid::text) and new_host is null then null
      else r.host_last_seen_at
    end,
    updated_at = now()
  where id = p_room_id;

  return jsonb_build_object(
    'ok', true,
    'room', (select to_jsonb(gr) from public.game_rooms gr where gr.id = p_room_id)
  );
end;
$$;

comment on function public.updown_leave_slot_while_host_resolves(uuid) is
  'Игрок покидает слот при waiting_host_action / waiting_return (обход room_not_in_playing_phase у mark_absent).';

revoke all on function public.updown_leave_slot_while_host_resolves(uuid) from public;
grant execute on function public.updown_leave_slot_while_host_resolves(uuid) to authenticated;
grant execute on function public.updown_leave_slot_while_host_resolves(uuid) to service_role;
