-- Если подтверждённо выходит текущий host_user_id, оставлять host без смены нельзя:
-- host_resolve_absent требует auth.uid() = host_user_id, а auto_transfer_host_if_stale
-- обрабатывает только room_phase = 'playing'. Иначе комната «висит» в waiting_host_action.

create or replace function public.updown_mark_player_absent_confirmed_leave(p_room_id uuid)
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
  slot_idx int;
  new_host uuid := null;
  cand text;
  absent_flag boolean;
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
  if r.room_phase is distinct from 'playing' then
    return jsonb_build_object('ok', false, 'error', 'room_not_in_playing_phase');
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

  slot_idx := coalesce(nullif(trim(slots->found_i->>'slotIndex'), '')::int, found_i);

  for i in 0..(len - 1) loop
    elem := slots->i;
    if i = found_i then
      elem := coalesce(elem, '{}'::jsonb) || jsonb_build_object('absent', true);
    end if;
    new_arr := new_arr || jsonb_build_array(elem);
  end loop;

  if r.host_user_id is not null and lower(r.host_user_id::text) = lower(uid::text) then
    for i in 0..(len - 1) loop
      elem := new_arr->i;
      cand := nullif(trim(elem->>'userId'), '');
      absent_flag := coalesce((elem->>'absent')::boolean, false);
      if cand is not null
         and lower(cand) <> lower(uid::text)
         and not absent_flag
      then
        new_host := cand::uuid;
        exit;
      end if;
    end loop;
  end if;

  update public.game_rooms
  set
    player_slots = new_arr::json,
    room_phase = 'waiting_host_action',
    absent_slot_index = slot_idx,
    absent_until = null,
    host_user_id = coalesce(new_host, r.host_user_id),
    host_last_seen_at = case when new_host is not null then now() else r.host_last_seen_at end,
    updated_at = now()
  where id = p_room_id;

  return jsonb_build_object(
    'ok', true,
    'room', (select to_jsonb(gr) from public.game_rooms gr where gr.id = p_room_id)
  );
end;
$$;
