-- Срочно: зал столов на проде (Supabase → SQL Editor → Run).
-- Нужны колонки settlement/room_kind (миграция 20260529120000). Если room_kind нет — сначала:
--
-- alter table public.game_rooms add column if not exists room_kind text not null default 'private';
--
-- Далее — полный блок из 20260529130000_game_rooms_rls_public_hall.sql:

-- Волна 2: RLS hardening + RPC списка публичных комнат в лобби.

create or replace function public._updown_user_in_room(p_room public.game_rooms, p_uid uuid)
returns boolean
language sql
stable
as $$
  select
    p_uid is not null
    and (
      p_room.host_user_id = p_uid
      or exists (
        select 1
        from jsonb_array_elements(coalesce(p_room.player_slots, '[]'::jsonb)) el
        where coalesce(el ->> 'userId', el ->> 'user_id', '') = p_uid::text
      )
    );
$$;

create or replace function public.updown_list_public_waiting_rooms(p_limit int default 40)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 40), 80));
  v_rows jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.updated_at desc), '[]'::jsonb)
  into v_rows
  from (
    select
      gr.id,
      gr.code,
      gr.settlement_mode,
      gr.buy_in,
      gr.room_kind,
      gr.updated_at,
      (
        select count(*)::int
        from jsonb_array_elements(coalesce(gr.player_slots, '[]'::jsonb)) el
        where coalesce(el ->> 'userId', el ->> 'user_id', '') <> ''
      ) as human_count
    from public.game_rooms gr
    where gr.status = 'waiting'
      and gr.room_phase = 'lobby'
      and gr.room_kind = 'public'
    order by gr.updated_at desc
    limit v_limit
  ) t;

  return jsonb_build_object('ok', true, 'rooms', v_rows);
end;
$$;

revoke all on function public.updown_list_public_waiting_rooms(int) from public;
grant execute on function public.updown_list_public_waiting_rooms(int) to authenticated;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'game_rooms'
      and policyname = 'Authenticated users can read game rooms'
  ) then
    drop policy "Authenticated users can read game rooms" on public.game_rooms;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'game_rooms'
      and policyname = 'Authenticated users can update game room'
  ) then
    drop policy "Authenticated users can update game room" on public.game_rooms;
  end if;
exception
  when undefined_object then null;
end;
$$;

drop policy if exists game_rooms_select_member_or_public on public.game_rooms;
create policy game_rooms_select_member_or_public on public.game_rooms
  for select to authenticated
  using (
    public._updown_user_in_room(game_rooms, auth.uid())
    or (
      room_kind = 'public'
      and status = 'waiting'
      and room_phase = 'lobby'
    )
  );

drop policy if exists game_rooms_update_members on public.game_rooms;
create policy game_rooms_update_members on public.game_rooms
  for update to authenticated
  using (public._updown_user_in_room(game_rooms, auth.uid()))
  with check (public._updown_user_in_room(game_rooms, auth.uid()));

drop policy if exists game_rooms_insert_authenticated on public.game_rooms;
create policy game_rooms_insert_authenticated on public.game_rooms
  for insert to authenticated
  with check (host_user_id = auth.uid());

-- Проверка: должна вернуться одна строка
select proname from pg_proc where proname = 'updown_list_public_waiting_rooms';
