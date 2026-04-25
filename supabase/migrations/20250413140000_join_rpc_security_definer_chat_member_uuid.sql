-- Гость по коду: RPC с security invoker не видит строку game_rooms при ужесточённом RLS → «Вход…» до таймаута.
-- Чат: сравнение userId в JSON без учёта регистра UUID (редко ломало RLS).

create or replace function public.updown_join_waiting_room(
  p_code text,
  p_user_id uuid,
  p_display_name text,
  p_short_label text default null,
  p_avatar_data_url text default null
)
returns jsonb
language plpgsql
security definer
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
  room_json jsonb;
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
      if uid is not null and lower(uid) = lower(p_user_id::text) then
        idx := coalesce(nullif(jslots->i->>'slotIndex', '')::int, i);
        select to_jsonb(sub) into room_json from (select * from public.game_rooms where id = r.id) sub;
        return jsonb_build_object('ok', true, 'my_slot_index', idx, 'room', room_json, 'room_id', r.id);
      end if;
    end loop;
  end if;

  if len >= 4 then
    return jsonb_build_object('ok', false, 'error', 'room_full');
  end if;

  new_elem := jsonb_build_object(
    'userId', p_user_id,
    'displayName', left(coalesce(p_display_name, ''), 17),
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

  select to_jsonb(sub) into room_json from (select * from public.game_rooms where id = r.id) sub;

  return jsonb_build_object(
    'ok', true,
    'my_slot_index', len,
    'room', room_json,
    'room_id', r.id
  );
end;
$$;

comment on function public.updown_join_waiting_room(text, uuid, text, text, text) is
  'Атомарный вход в waiting (definer — работает при RLS только для участников). Успех: room + my_slot_index.';

revoke all on function public.updown_join_waiting_room(text, uuid, text, text, text) from public;
grant execute on function public.updown_join_waiting_room(text, uuid, text, text, text) to authenticated;
grant execute on function public.updown_join_waiting_room(text, uuid, text, text, text) to service_role;

create or replace function public.updown_room_chat_is_member(p_room_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.game_rooms gr
    cross join lateral jsonb_array_elements(
      case
        when gr.player_slots is null then '[]'::jsonb
        when jsonb_typeof(gr.player_slots::jsonb) = 'array' then gr.player_slots::jsonb
        else '[]'::jsonb
      end
    ) as slot
    where gr.id = p_room_id
      and (
        lower(nullif(trim(slot->>'userId'), '')) = lower(p_user_id::text)
        or lower(nullif(trim(slot->>'replacedUserId'), '')) = lower(p_user_id::text)
      )
  );
$$;

revoke all on function public.updown_room_chat_is_member(uuid, uuid) from public;
grant execute on function public.updown_room_chat_is_member(uuid, uuid) to authenticated;
grant execute on function public.updown_room_chat_is_member(uuid, uuid) to service_role;
