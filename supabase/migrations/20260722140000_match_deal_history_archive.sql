-- Enterprise archive: deal_history on matches; enrich finish_game + record_offline_match.
-- Apply on prod after review (see supabase/scripts/APPLY-MATCH-ARCHIVE-PROD.sql).

alter table public.matches
  add column if not exists deal_history jsonb;

comment on column public.matches.deal_history is
  'Срез раздач DealResult[]: dealNumber, bids, points, takens — для кросс-девайс разбора партии';

-- ---------------------------------------------------------------------------
-- finish_game: + optional deal_history + client chips_by_slot (non–prize_pool)
-- ---------------------------------------------------------------------------
create or replace function public.finish_game(
  p_room_id uuid,
  p_code text,
  p_deals_count integer,
  p_players jsonb,
  p_deal_history jsonb default null,
  p_chips_by_slot jsonb default null
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

  if p_chips_by_slot is not null and jsonb_typeof(p_chips_by_slot) = 'object' then
    v_chips_json := p_chips_by_slot;
  elsif v_settlement = 'prize_pool' and v_buy_in is not null and v_buy_in > 0 then
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
    chips_by_slot,
    deal_history
  ) values (
    v_code,
    timezone('utc', now()),
    greatest(coalesce(p_deals_count, 1), 1),
    false,
    p_room_id,
    v_settlement,
    v_buy_in,
    case when v_chips_json = '{}'::jsonb then null else v_chips_json end,
    case
      when p_deal_history is not null and jsonb_typeof(p_deal_history) = 'array' then p_deal_history
      else null
    end
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

-- Одна сигнатура с default-аргументами (старый 4-arg вызов в SQL всё ещё валиден).
drop function if exists public.finish_game(uuid, text, integer, jsonb);
revoke all on function public.finish_game(uuid, text, integer, jsonb, jsonb, jsonb) from public;
grant execute on function public.finish_game(uuid, text, integer, jsonb, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- record_offline_match: settlement + chips + deal_history + optional standings
-- ---------------------------------------------------------------------------
drop function if exists public.record_offline_match(integer, integer, integer, text, integer);

create or replace function public.record_offline_match(
  p_deals_count integer,
  p_final_score integer,
  p_place integer,
  p_display_name text,
  p_bid_accuracy integer,
  p_settlement_mode text default 'accuracy_bonus',
  p_chips_by_slot jsonb default null,
  p_deal_history jsonb default null,
  p_players jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid;
  v_match_id uuid;
  v_code text;
  v_mode text;
  v_pl jsonb;
  v_i int;
  v_n int;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_deals_count is null or p_deals_count < 1 then
    raise exception 'invalid_deals_count';
  end if;

  v_mode := coalesce(nullif(trim(p_settlement_mode), ''), 'accuracy_bonus');
  if v_mode not in ('points_only', 'vs_average', 'accuracy_bonus', 'prize_pool') then
    v_mode := 'accuracy_bonus';
  end if;

  v_code := 'OFF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.matches (
    code,
    finished_at,
    deals_count,
    is_offline,
    settlement_mode,
    chips_by_slot,
    deal_history
  ) values (
    v_code,
    timezone('utc', now()),
    p_deals_count,
    true,
    v_mode,
    case
      when p_chips_by_slot is not null and jsonb_typeof(p_chips_by_slot) = 'object' then p_chips_by_slot
      else null
    end,
    case
      when p_deal_history is not null and jsonb_typeof(p_deal_history) = 'array' then p_deal_history
      else null
    end
  )
  returning id into v_match_id;

  v_n := jsonb_array_length(coalesce(p_players, '[]'::jsonb));
  if v_n > 0 then
    for v_i in 0..(v_n - 1) loop
      v_pl := p_players -> v_i;
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
        case when coalesce((v_pl ->> 'slot_index')::int, v_i) = 0 then v_uid else null end,
        coalesce((v_pl ->> 'slot_index')::int, v_i),
        coalesce(nullif(trim(v_pl ->> 'display_name'), ''), 'Игрок'),
        coalesce((v_pl ->> 'is_ai')::boolean, coalesce((v_pl ->> 'slot_index')::int, v_i) <> 0),
        coalesce((v_pl ->> 'final_score')::int, 0),
        case when coalesce((v_pl ->> 'slot_index')::int, v_i) = 0 then p_bid_accuracy else null end,
        false,
        false,
        null,
        nullif(v_pl ->> 'place', '')::int
      );
    end loop;
  else
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
      v_uid,
      0,
      coalesce(nullif(trim(p_display_name), ''), 'Вы'),
      false,
      p_final_score,
      p_bid_accuracy,
      false,
      false,
      null,
      p_place
    );
  end if;

  return v_match_id;
end;
$fn$;

revoke all on function public.record_offline_match(
  integer, integer, integer, text, integer, text, jsonb, jsonb, jsonb
) from public;
grant execute on function public.record_offline_match(
  integer, integer, integer, text, integer, text, jsonb, jsonb, jsonb
) to authenticated;

comment on function public.record_offline_match is
  'Офлайн-партия в matches/match_players; is_rated=false; опционально settlement/chips/deal_history/standings.';
