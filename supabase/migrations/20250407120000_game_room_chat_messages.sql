-- Сообщения чата за столом (онлайн-комната). Realtime: добавить таблицу в publication supabase_realtime в дашборде при необходимости.

create table if not exists public.game_room_chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null default '',
  body text not null,
  created_at timestamptz not null default now(),
  constraint game_room_chat_messages_body_len check (char_length(trim(body)) between 1 and 500)
);

create index if not exists game_room_chat_messages_room_created_idx
  on public.game_room_chat_messages (room_id, created_at asc);

comment on table public.game_room_chat_messages is 'Текстовый чат внутри игровой комнаты (ожидание и игра).';

-- Участник комнаты: слот с userId или replacedUserId (пауза / возврат)
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
        coalesce(slot->>'userId', '') = p_user_id::text
        or coalesce(slot->>'replacedUserId', '') = p_user_id::text
      )
  );
$$;

revoke all on function public.updown_room_chat_is_member(uuid, uuid) from public;
grant execute on function public.updown_room_chat_is_member(uuid, uuid) to authenticated;
grant execute on function public.updown_room_chat_is_member(uuid, uuid) to service_role;

alter table public.game_room_chat_messages enable row level security;

drop policy if exists "game_room_chat_select_members" on public.game_room_chat_messages;
create policy "game_room_chat_select_members"
  on public.game_room_chat_messages
  for select
  to authenticated
  using (public.updown_room_chat_is_member(room_id, auth.uid()));

drop policy if exists "game_room_chat_insert_self" on public.game_room_chat_messages;
create policy "game_room_chat_insert_self"
  on public.game_room_chat_messages
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.updown_room_chat_is_member(room_id, auth.uid())
  );

-- Подписка Realtime (Supabase): если INSERT не приходит в клиент, в SQL Editor выполнить:
-- alter publication supabase_realtime add table public.game_room_chat_messages;
