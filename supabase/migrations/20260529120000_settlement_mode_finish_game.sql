-- Волна 1: settlement_mode / buy_in / room_kind на комнатах; chips на matches; finish_game с server-side settle.

alter table public.game_rooms
  add column if not exists settlement_mode text not null default 'accuracy_bonus',
  add column if not exists buy_in integer,
  add column if not exists room_kind text not null default 'private';

alter table public.game_rooms
  drop constraint if exists game_rooms_settlement_mode_check;

alter table public.game_rooms
  add constraint game_rooms_settlement_mode_check check (
    settlement_mode in ('points_only', 'vs_average', 'accuracy_bonus', 'prize_pool')
  );

alter table public.game_rooms
  drop constraint if exists game_rooms_room_kind_check;

alter table public.game_rooms
  add constraint game_rooms_room_kind_check check (
    room_kind in ('private', 'public')
  );

alter table public.game_rooms
  drop constraint if exists game_rooms_prize_pool_buy_in_check;

alter table public.game_rooms
  add constraint game_rooms_prize_pool_buy_in_check check (
    settlement_mode <> 'prize_pool' or (buy_in is not null and buy_in > 0)
  );

comment on column public.game_rooms.settlement_mode is 'Режим итога фишек: accuracy_bonus (default), prize_pool (банк), …';
comment on column public.game_rooms.buy_in is 'Взнос в банк (prize_pool); волна 1 — demo без wallet';
comment on column public.game_rooms.room_kind is 'private = только код; public = зал столов (волна 2)';

alter table public.matches
  add column if not exists settlement_mode text,
  add column if not exists buy_in integer,
  add column if not exists chips_by_slot jsonb,
  add column if not exists room_id uuid references public.game_rooms (id) on delete set null;

comment on column public.matches.chips_by_slot is 'Фишки по slot_index {"0":150,"1":-100,...}';

-- ---------------------------------------------------------------------------
-- prize_pool chips по итоговым очкам (как partySettlement.ts)
-- ---------------------------------------------------------------------------
create or replace function public._updown_prize_pool_chips(
  p_scores integer[],
  p_buy_in integer,
  p_player_count integer
)
returns numeric[]
language plpgsql
immutable
as $$
declare
  shares numeric[];
  pool integer;
  chips numeric[];
  n integer;
  i integer;
  j integer;
  max_idx integer;
  tmp numeric;
  order_idx integer[];
  rank integer;
  share numeric;
begin
  n := coalesce(array_length(p_scores, 1), 0);
  if n < 1 then
    return array[]::numeric[];
  end if;

  if p_player_count = 3 then
    shares := array[0.6, 0.3, 0.1]::numeric[];
  else
    shares := array[0.5, 0.3, 0.15, 0.05]::numeric[];
  end if;

  pool := p_buy_in * greatest(p_player_count, n);
  chips := array_fill(0::numeric, array[n]);

  order_idx := array(select generate_series(1, n));

  for i in 1..(n - 1) loop
    for j in i + 1..n loop
      if p_scores[order_idx[j]] > p_scores[order_idx[i]] then
        tmp := order_idx[i];
        order_idx[i] := order_idx[j];
        order_idx[j] := tmp;
      end if;
    end loop;
  end loop;

  for rank in 1..n loop
    i := order_idx[rank];
    share := coalesce(shares[rank], 0);
    chips[i] := round((pool * share - p_buy_in)::numeric, 1);
  end loop;

  return chips;
end;
$$;

-- ---------------------------------------------------------------------------
-- finish_game: завершение онлайн-партии + settlement на сервере
-- ---------------------------------------------------------------------------
create or replace function public.finish_game(
  p_room_id uuid,
  p_code text,
  p_deals_count integer,
  p_players jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  r public.game_rooms%rowtype;
  v_match_id uuid;
  v_code text;
  v_scores integer[];
  v_chips numeric[];
  v_chips_json jsonb := '{}'::jsonb;
  v_slot int;
  v_score int;
  v_pl jsonb;
  v_i int;
  v_n int;
  v_settlement text;
  v_buy_in int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into r from public.game_rooms where id = p_room_id;
  if not found then
    raise exception 'room_not_found';
  end if;

  if upper(trim(p_code)) <> upper(trim(r.code)) then
    raise exception 'bad_room_code';
  end if;

  v_settlement := coalesce(r.settlement_mode, 'accuracy_bonus');
  v_buy_in := r.buy_in;

  v_n := jsonb_array_length(coalesce(p_players, '[]'::jsonb));
  if v_n < 1 then
    raise exception 'no_players';
  end if;

  v_scores := array[]::integer[];
  for v_i in 0..(v_n - 1) loop
    v_pl := p_players -> v_i;
    v_slot := coalesce((v_pl ->> 'slot_index')::int, v_i);
    v_score := coalesce((v_pl ->> 'final_score')::int, 0);
    v_scores[v_slot + 1] := v_score;
  end loop;

  if v_settlement = 'prize_pool' and v_buy_in is not null and v_buy_in > 0 then
    v_chips := public._updown_prize_pool_chips(v_scores, v_buy_in, v_n);
    for v_i in 0..(v_n - 1) loop
      v_chips_json := v_chips_json || jsonb_build_object(v_i::text, v_chips[v_i + 1]);
    end loop;
  end if;

  v_code := upper(trim(r.code));

  insert into public.matches (
    code,
    finished_at,
    deals_count,
    is_offline,
    room_id,
    settlement_mode,
    buy_in,
    chips_by_slot
  ) values (
    v_code,
    timezone('utc', now()),
    greatest(coalesce(p_deals_count, 1), 1),
    false,
    p_room_id,
    v_settlement,
    v_buy_in,
    case when v_chips_json = '{}'::jsonb then null else v_chips_json end
  )
  returning id into v_match_id;

  for v_i in 0..(v_n - 1) loop
    v_pl := p_players -> v_i;
    v_slot := coalesce((v_pl ->> 'slot_index')::int, v_i);
    insert into public.match_players (
      match_id,
      user_id,
      slot_index,
      display_name,
      is_ai,
      final_score,
      bid_accuracy,
      interrupted,
      is_rated,
      replaced_user_id,
      place
    ) values (
      v_match_id,
      nullif(trim(v_pl ->> 'user_id'), '')::uuid,
      v_slot,
      coalesce(nullif(trim(v_pl ->> 'display_name'), ''), 'Игрок'),
      coalesce((v_pl ->> 'is_ai')::boolean, false),
      coalesce((v_pl ->> 'final_score')::int, 0),
      nullif(v_pl ->> 'bid_accuracy', '')::int,
      coalesce((v_pl ->> 'interrupted')::boolean, false),
      coalesce((v_pl ->> 'is_rated')::boolean, true),
      nullif(trim(v_pl ->> 'replaced_user_id'), '')::uuid,
      nullif(v_pl ->> 'place', '')::int
    );
  end loop;

  update public.game_rooms
  set
    status = 'finished',
    room_phase = 'finished',
    updated_at = now()
  where id = p_room_id;

  return v_match_id;
end;
$$;

revoke all on function public.finish_game(uuid, text, integer, jsonb) from public;
grant execute on function public.finish_game(uuid, text, integer, jsonb) to authenticated;

-- Подсказка режима комнаты до входа (по коду)
create or replace function public.updown_peek_room_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.game_rooms%rowtype;
  v_count int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into r
  from public.game_rooms
  where upper(trim(code)) = upper(trim(p_code))
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select count(*)::int into v_count
  from jsonb_array_elements(coalesce(r.player_slots, '[]'::jsonb)) el
  where coalesce(el ->> 'userId', el ->> 'user_id', '') <> '';

  return jsonb_build_object(
    'ok', true,
    'code', r.code,
    'status', r.status,
    'settlement_mode', r.settlement_mode,
    'buy_in', r.buy_in,
    'room_kind', r.room_kind,
    'human_count', v_count
  );
end;
$$;

revoke all on function public.updown_peek_room_by_code(text) from public;
grant execute on function public.updown_peek_room_by_code(text) to authenticated;
