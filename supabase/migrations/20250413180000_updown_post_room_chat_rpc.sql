-- Отправка сообщения чата через RPC (definer): INSERT из REST часто блокируется RLS даже при корректном составе слотов.

create or replace function public.updown_post_room_chat_message(
  p_room_id uuid,
  p_display_name text,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  trimmed text;
  rec public.game_room_chat_messages%rowtype;
begin
  uid := auth.uid();
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  trimmed := trim(coalesce(p_body, ''));
  if length(trimmed) < 1 or length(trimmed) > 500 then
    return jsonb_build_object('ok', false, 'error', 'bad_body');
  end if;

  if not public.updown_room_chat_is_member(p_room_id, uid) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;

  insert into public.game_room_chat_messages (
    room_id,
    user_id,
    display_name,
    body
  )
  values (
    p_room_id,
    uid,
    left(trim(coalesce(p_display_name, '')), 40),
    trimmed
  )
  returning * into rec;

  return jsonb_build_object('ok', true, 'row', to_jsonb(rec));
exception
  when others then
    return jsonb_build_object('ok', false, 'error', 'save_failed');
end;
$$;

comment on function public.updown_post_room_chat_message(uuid, text, text) is
  'Отправка сообщения в чат комнаты: проверка участника + INSERT (definer, обход RLS на insert).';

revoke all on function public.updown_post_room_chat_message(uuid, text, text) from public;
grant execute on function public.updown_post_room_chat_message(uuid, text, text) to authenticated;
grant execute on function public.updown_post_room_chat_message(uuid, text, text) to service_role;
