-- updown_transfer_host: при включённом RLS на game_rooms SELECT внутри definer иногда не видит строку → ложный not_found.
-- SET row_security = off для функции (владелец postgres на Supabase) + явные проверки uuid.

create or replace function public.updown_transfer_host(p_room_id uuid, p_new_host_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  r public.game_rooms%rowtype;
  uid uuid := auth.uid();
  slots jsonb;
  len int;
  i int;
  suid text;
  found boolean := false;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_room_id');
  end if;
  if p_new_host_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_new_host');
  end if;

  select * into r from public.game_rooms where id = p_room_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if r.host_user_id is null or lower(r.host_user_id::text) <> lower(uid::text) then
    return jsonb_build_object('ok', false, 'error', 'not_host');
  end if;
  slots := coalesce(to_jsonb(r.player_slots), '[]'::jsonb);
  if jsonb_typeof(slots) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'bad_slots');
  end if;
  len := jsonb_array_length(slots);
  for i in 0..(len - 1) loop
    suid := nullif(trim(slots->i->>'userId'), '');
    if suid is not null and lower(suid) = lower(p_new_host_user_id::text) then
      found := true;
      exit;
    end if;
  end loop;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'new_host_not_in_slots');
  end if;
  if lower(p_new_host_user_id::text) = lower(uid::text) then
    return jsonb_build_object('ok', false, 'error', 'same_host');
  end if;

  update public.game_rooms
  set
    host_user_id = p_new_host_user_id,
    host_last_seen_at = now(),
    updated_at = now()
  where id = p_room_id;

  return jsonb_build_object(
    'ok', true,
    'room', (select to_jsonb(gr) from public.game_rooms gr where gr.id = p_room_id)
  );
end;
$$;

revoke all on function public.updown_transfer_host(uuid, uuid) from public;
grant execute on function public.updown_transfer_host(uuid, uuid) to authenticated;
grant execute on function public.updown_transfer_host(uuid, uuid) to service_role;
