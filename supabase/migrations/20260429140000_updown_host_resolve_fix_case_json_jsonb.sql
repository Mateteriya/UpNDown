-- Hotfix: «CASE/WHEN could not convert type json to jsonb» в ветке finish (ветки CASE для player_slots
-- должны быть одного типа, затем ::json). Идемпотентно заменяет updown_host_resolve_absent, если
-- 20260429120000 уже применили со старой формой CASE.
create or replace function public.updown_host_resolve_absent(p_room_id uuid, p_choice text)
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
  elem jsonb;
  new_arr jsonb := '[]'::jsonb;
  ai_idx int;
  ai_name text;
  ch text := lower(trim(p_choice));
  snap jsonb;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into r from public.game_rooms where id = p_room_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if r.host_user_id is null or lower(r.host_user_id::text) <> lower(uid::text) then
    return jsonb_build_object('ok', false, 'error', 'not_host');
  end if;
  if r.room_phase not in ('waiting_host_action', 'waiting_return') then
    return jsonb_build_object('ok', false, 'error', 'wrong_room_phase');
  end if;

  if ch not in ('finish', 'wait', 'replace_ai') then
    return jsonb_build_object('ok', false, 'error', 'bad_choice');
  end if;

  if ch = 'finish' then
    if r.game_state is null then
      snap := null;
    else
      begin
        snap := r.game_state::jsonb;
      exception when others then
        snap := null;
      end;
    end if;

    begin
      insert into public.online_party_outcomes (room_id, outcome_type, game_state_snapshot)
      values (p_room_id, 'host_finish_early', snap);
    exception when others then
      null;
    end;

    slots := coalesce(to_jsonb(r.player_slots), '[]'::jsonb);
    len := case when jsonb_typeof(slots) = 'array' then jsonb_array_length(slots) else 0 end;
    for i in 0..(len - 1) loop
      elem := slots->i;
      elem := elem - 'absent';
      new_arr := new_arr || jsonb_build_array(elem);
    end loop;

    update public.game_rooms
    set
      status = 'finished',
      room_phase = 'finished',
      absent_until = null,
      absent_slot_index = null,
      player_slots = (
        case
          when len > 0 then new_arr
          else coalesce(r.player_slots::jsonb, '[]'::jsonb)
        end
      )::json,
      updated_at = now()
    where id = p_room_id;
    return jsonb_build_object(
      'ok', true,
      'room', (select to_jsonb(gr) from public.game_rooms gr where gr.id = p_room_id)
    );
  end if;

  if ch = 'wait' then
    update public.game_rooms
    set
      room_phase = 'waiting_return',
      absent_until = now() + interval '5 minutes',
      updated_at = now()
    where id = p_room_id;
    return jsonb_build_object(
      'ok', true,
      'room', (select to_jsonb(gr) from public.game_rooms gr where gr.id = p_room_id)
    );
  end if;

  if r.absent_slot_index is null or r.absent_slot_index < 0 or r.absent_slot_index > 3 then
    return jsonb_build_object('ok', false, 'error', 'no_absent_slot');
  end if;
  ai_idx := r.absent_slot_index;
  ai_name := public._updown_vacant_ai_display_name(ai_idx);

  slots := coalesce(to_jsonb(r.player_slots), '[]'::jsonb);
  if jsonb_typeof(slots) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'bad_slots');
  end if;
  len := jsonb_array_length(slots);
  new_arr := '[]'::jsonb;
  for i in 0..(len - 1) loop
    elem := slots->i;
    if coalesce(nullif(trim(elem->>'slotIndex'), '')::int, i) = ai_idx then
      elem := jsonb_build_object(
        'slotIndex', ai_idx,
        'displayName', ai_name,
        'userId', null::text
      );
    else
      elem := elem - 'absent';
    end if;
    new_arr := new_arr || jsonb_build_array(elem);
  end loop;

  update public.game_rooms
  set
    player_slots = new_arr::json,
    room_phase = 'playing',
    absent_slot_index = null,
    absent_until = null,
    updated_at = now()
  where id = p_room_id;

  return jsonb_build_object(
    'ok', true,
    'room', (select to_jsonb(gr) from public.game_rooms gr where gr.id = p_room_id)
  );
end;
$$;

revoke all on function public.updown_host_resolve_absent(uuid, text) from public;
grant execute on function public.updown_host_resolve_absent(uuid, text) to authenticated;
grant execute on function public.updown_host_resolve_absent(uuid, text) to service_role;
