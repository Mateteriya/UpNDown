-- Атомарный вход в комнату в статусе waiting (FOR UPDATE, без гонки по updated_at).
-- Клиент: supabase.rpc('updown_join_waiting_room', { p_code, p_user_id, p_display_name, ... })
-- При успехе возвращает room_id — затем getRoom(room_id) для полной строки.

create or replace function public.updown_join_waiting_room(
  p_code text,
  p_user_id uuid,
  p_display_name text,
  p_short_label text default null,
  p_avatar_data_url text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  r public.game_rooms%rowtype;
  jslots jsonb;
  len int;
  i int;
  uid text;
  new_elem jsonb;
  idx int;
begin
  select * into r
  from public.game_rooms
  where upper(trim(code)) = upper(trim(p_code))
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if r.status is distinct from 'waiting' then
    return jsonb_build_object('ok', false, 'error', 'not_waiting');
  end if;

  jslots := coalesce(to_jsonb(r.player_slots), '[]'::jsonb);
  if jsonb_typeof(jslots) <> 'array' then
    jslots := '[]'::jsonb;
  end if;

  len := jsonb_array_length(jslots);
  if len > 0 then
    for i in 0..(len - 1) loop
      uid := jslots->i->>'userId';
      if uid is not null and uid = p_user_id::text then
        idx := coalesce(nullif(jslots->i->>'slotIndex', '')::int, i);
        return jsonb_build_object('ok', true, 'room_id', r.id, 'my_slot_index', idx);
      end if;
    end loop;
  end if;

  if len >= 4 then
    return jsonb_build_object('ok', false, 'error', 'room_full');
  end if;

  new_elem := jsonb_build_object(
    'userId', p_user_id,
    'displayName', left(p_display_name, 17),
    'slotIndex', len
  );
  if p_short_label is not null and length(trim(p_short_label)) > 0 then
    new_elem := new_elem || jsonb_build_object('shortLabel', left(trim(p_short_label), 12));
  end if;
  if p_avatar_data_url is not null and length(p_avatar_data_url) > 0 and length(p_avatar_data_url) <= 24000 then
    new_elem := new_elem || jsonb_build_object('avatarDataUrl', p_avatar_data_url);
  end if;

  update public.game_rooms gr
  set
    player_slots = (jslots || jsonb_build_array(new_elem))::json,
    updated_at = now()
  where gr.id = r.id;

  return jsonb_build_object(
    'ok', true,
    'room_id', r.id,
    'my_slot_index', len
  );
end;
$$;

comment on function public.updown_join_waiting_room(text, uuid, text, text, text) is
  'Атомарно добавляет игрока в waiting-комнату по коду. Успех: room_id + my_slot_index; клиент делает getRoom.';

grant execute on function public.updown_join_waiting_room(text, uuid, text, text, text) to authenticated;
