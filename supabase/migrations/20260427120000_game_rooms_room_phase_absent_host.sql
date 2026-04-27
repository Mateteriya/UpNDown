-- room_phase, absent flow, host liveness, RPCs for host actions and absent player (no auto-AI on leave).
-- Имена пустых слотов — как в onlineGameSupabase vacantAiPlayerSlot (индекс 0..3).

-- ---------------------------------------------------------------------------
-- 1) Колонки game_rooms
-- ---------------------------------------------------------------------------
alter table public.game_rooms
  add column if not exists room_phase text,
  add column if not exists absent_until timestamptz,
  add column if not exists absent_slot_index smallint,
  add column if not exists host_last_seen_at timestamptz;

update public.game_rooms
set room_phase = case
    when status = 'waiting' then 'lobby'
    when status = 'playing' then 'playing'
    when status = 'finished' then 'finished'
    else 'lobby'
  end
where room_phase is null;

alter table public.game_rooms
  alter column room_phase set default 'lobby';

alter table public.game_rooms
  alter column room_phase set not null;

alter table public.game_rooms
  drop constraint if exists game_rooms_room_phase_check;

alter table public.game_rooms
  add constraint game_rooms_room_phase_check check (
    room_phase in (
      'lobby',
      'playing',
      'waiting_host_action',
      'waiting_return',
      'finished'
    )
  );

comment on column public.game_rooms.room_phase is
  'Фаза UX: lobby | playing | waiting_host_action (хост выбирает a/b/c) | waiting_return | finished.';
comment on column public.game_rooms.absent_until is
  'До какого времени ждём возврат вышедшего (ветка wait).';
comment on column public.game_rooms.absent_slot_index is
  'Индекс слота 0..3, по которому нужно решение хоста.';
comment on column public.game_rooms.host_last_seen_at is
  'Последний ping хоста (RPC updown_host_ping); для reaper закрытой вкладки.';

-- ---------------------------------------------------------------------------
-- 2) История досрочного завершения (ветка finish)
-- ---------------------------------------------------------------------------
create table if not exists public.online_party_outcomes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms (id) on delete cascade,
  finished_at timestamptz not null default now(),
  outcome_type text not null,
  game_state_snapshot jsonb
);

comment on table public.online_party_outcomes is
  'Досрочное/особое завершение онлайн-партии (например host_resolve finish).';

create index if not exists online_party_outcomes_room_id_idx on public.online_party_outcomes (room_id);

-- ---------------------------------------------------------------------------
-- 3) Вспомогательные имена ИИ по индексу слота
-- ---------------------------------------------------------------------------
create or replace function public._updown_vacant_ai_display_name(p_slot int)
returns text
language sql
immutable
as $$
  select case
    when p_slot = 0 then 'ИИ Север'
    when p_slot = 1 then 'ИИ Восток'
    when p_slot = 2 then 'ИИ Юг'
    when p_slot = 3 then 'ИИ Запад'
    else 'ИИ'
  end;
$$;

-- ---------------------------------------------------------------------------
-- 4) host_ping
-- ---------------------------------------------------------------------------
create or replace function public.updown_host_ping(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.game_rooms%rowtype;
  uid uuid := auth.uid();
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
  update public.game_rooms
  set host_last_seen_at = now(), updated_at = now()
  where id = p_room_id;
  return jsonb_build_object(
    'ok', true,
    'room', (select to_jsonb(gr) from public.game_rooms gr where gr.id = p_room_id)
  );
end;
$$;

comment on function public.updown_host_ping(uuid) is
  'Обновляет host_last_seen_at; вызывать только текущим host_user_id.';

revoke all on function public.updown_host_ping(uuid) from public;
grant execute on function public.updown_host_ping(uuid) to authenticated;
grant execute on function public.updown_host_ping(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5) transfer_host (ручная передача)
-- ---------------------------------------------------------------------------
create or replace function public.updown_transfer_host(p_room_id uuid, p_new_host_user_id uuid)
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
  suid text;
  found boolean := false;
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

-- ---------------------------------------------------------------------------
-- 6) auto_transfer_host_if_stale (только service_role — cron / Edge)
-- ---------------------------------------------------------------------------
create or replace function public.updown_auto_transfer_host_if_stale()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
  r record;
  old_host uuid;
  new_host uuid;
  slots jsonb;
  len int;
  i int;
  suid text;
begin
  for r in
    select id, host_user_id, player_slots
    from public.game_rooms
    where status = 'playing'
      and room_phase = 'playing'
      and host_user_id is not null
      and host_last_seen_at is not null
      and host_last_seen_at < now() - interval '90 seconds'
    for update skip locked
  loop
    old_host := r.host_user_id;
    new_host := null;
    slots := coalesce(r.player_slots::jsonb, '[]'::jsonb);
    if jsonb_typeof(slots) = 'array' then
      len := jsonb_array_length(slots);
      for i in 0..(len - 1) loop
        suid := nullif(trim(slots->i->>'userId'), '');
        if suid is not null and lower(suid) <> lower(old_host::text) then
          new_host := suid::uuid;
          exit;
        end if;
      end loop;
    end if;
    if new_host is not null then
      update public.game_rooms
      set
        host_user_id = new_host,
        host_last_seen_at = now(),
        updated_at = now()
      where id = r.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

comment on function public.updown_auto_transfer_host_if_stale() is
  'Назначить другого хоста, если текущий не пинговал 90+ с; вызывать service_role (Edge/pg_cron).';

revoke all on function public.updown_auto_transfer_host_if_stale() from public;
grant execute on function public.updown_auto_transfer_host_if_stale() to service_role;

-- ---------------------------------------------------------------------------
-- 7) mark_player_absent (подтверждённый выход из playing — без ИИ)
-- ---------------------------------------------------------------------------
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

  update public.game_rooms
  set
    player_slots = new_arr::json,
    room_phase = 'waiting_host_action',
    absent_slot_index = slot_idx,
    absent_until = null,
    updated_at = now()
  where id = p_room_id;

  return jsonb_build_object(
    'ok', true,
    'room', (select to_jsonb(gr) from public.game_rooms gr where gr.id = p_room_id)
  );
end;
$$;

revoke all on function public.updown_mark_player_absent_confirmed_leave(uuid) from public;
grant execute on function public.updown_mark_player_absent_confirmed_leave(uuid) to authenticated;
grant execute on function public.updown_mark_player_absent_confirmed_leave(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 8) host_resolve_absent (a/b/c)
-- ---------------------------------------------------------------------------
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
    insert into public.online_party_outcomes (room_id, outcome_type, game_state_snapshot)
    values (p_room_id, 'host_finish_early', to_jsonb(r.game_state));

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
      player_slots = case when len > 0 then new_arr::json else player_slots end,
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

  -- replace_ai
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

-- ---------------------------------------------------------------------------
-- 9) Истечение waiting_return → снова решение хоста
-- ---------------------------------------------------------------------------
create or replace function public.updown_absent_wait_expired_tick()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
begin
  update public.game_rooms
  set
    room_phase = 'waiting_host_action',
    absent_until = null,
    updated_at = now()
  where status = 'playing'
    and room_phase = 'waiting_return'
    and absent_until is not null
    and absent_until < now();
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.updown_absent_wait_expired_tick() from public;
grant execute on function public.updown_absent_wait_expired_tick() to service_role;

-- ---------------------------------------------------------------------------
-- 10) Один вызов для Edge/cron: просроченное ожидание + смена «мёртвого» хоста
-- ---------------------------------------------------------------------------
create or replace function public.updown_online_room_maintenance_tick()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a int;
  b int;
begin
  a := public.updown_auto_transfer_host_if_stale();
  b := public.updown_absent_wait_expired_tick();
  return jsonb_build_object('stale_hosts_transferred', a, 'absent_waits_expired', b);
end;
$$;

comment on function public.updown_online_room_maintenance_tick() is
  'Для Edge Functions / pg_cron: смена хоста по host_last_seen_at + истечение waiting_return.';

revoke all on function public.updown_online_room_maintenance_tick() from public;
grant execute on function public.updown_online_room_maintenance_tick() to service_role;
