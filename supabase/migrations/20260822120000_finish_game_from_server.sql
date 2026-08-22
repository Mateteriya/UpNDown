-- WS-сервер пишет конец партии (service_role). Идемпотентно по room_id.
-- Клиент больше не должен вызывать finish_game для WS-комнат.

create unique index if not exists matches_online_room_id_uidx
  on public.matches (room_id)
  where room_id is not null and coalesce(is_offline, false) = false;

create or replace function public.finish_game_from_server(
  p_room_id uuid,
  p_code text,
  p_deals_count integer,
  p_players jsonb,
  p_deal_history jsonb default null,
  p_chips_by_slot jsonb default null,
  p_settlement_mode text default 'accuracy_bonus',
  p_buy_in integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
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
  v_rated jsonb := '[]'::jsonb;
  v_entry jsonb;
  v_user uuid;
  v_place int;
  v_is_rated boolean;
  v_interrupted boolean;
  v_elo_row public.player_ratings;
  v_sum_elo numeric;
  v_cnt int;
  v_avg numeric;
  v_j int;
begin
  if p_room_id is null then
    raise exception 'room_id_required';
  end if;

  select m.id into v_match_id
  from public.matches m
  where m.room_id = p_room_id
    and coalesce(m.is_offline, false) = false
  order by m.finished_at desc nulls last
  limit 1;

  if v_match_id is not null then
    return v_match_id;
  end if;

  v_n := jsonb_array_length(coalesce(p_players, '[]'::jsonb));
  if v_n < 1 then
    raise exception 'no_players';
  end if;

  v_settlement := coalesce(nullif(trim(p_settlement_mode), ''), 'accuracy_bonus');
  v_buy_in := p_buy_in;
  v_code := upper(trim(coalesce(p_code, '')));
  if v_code = '' then
    raise exception 'bad_room_code';
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

  for v_i in 0..(v_n - 1) loop
    v_pl := p_players -> v_i;
    v_user := nullif(trim(v_pl ->> 'user_id'), '')::uuid;
    v_interrupted := coalesce((v_pl ->> 'interrupted')::boolean, false);
    v_is_rated := coalesce((v_pl ->> 'is_rated')::boolean, true);
    v_place := nullif(v_pl ->> 'place', '')::int;
    if v_user is not null and v_is_rated and not v_interrupted then
      v_elo_row := public._updown_ensure_rating(v_user, 'open', '');
      v_rated := v_rated || jsonb_build_array(jsonb_build_object(
        'user_id', v_user,
        'place', coalesce(v_place, 99),
        'elo', v_elo_row.elo
      ));
    end if;
  end loop;

  for v_i in 0..(greatest(jsonb_array_length(v_rated), 0) - 1) loop
    v_entry := v_rated -> v_i;
    v_user := (v_entry ->> 'user_id')::uuid;
    v_place := (v_entry ->> 'place')::int;
    v_sum_elo := 0;
    v_cnt := 0;
    for v_j in 0..(jsonb_array_length(v_rated) - 1) loop
      if v_j <> v_i then
        v_sum_elo := v_sum_elo + (((v_rated -> v_j) ->> 'elo')::numeric);
        v_cnt := v_cnt + 1;
      end if;
    end loop;
    v_avg := case when v_cnt < 1 then 1000 else v_sum_elo / v_cnt end;
    perform public._updown_apply_elo_result(v_user, v_place = 1, v_avg, 24);
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

revoke all on function public.finish_game_from_server(uuid, text, integer, jsonb, jsonb, jsonb, text, integer) from public;
revoke all on function public.finish_game_from_server(uuid, text, integer, jsonb, jsonb, jsonb, text, integer) from anon;
revoke all on function public.finish_game_from_server(uuid, text, integer, jsonb, jsonb, jsonb, text, integer) from authenticated;
grant execute on function public.finish_game_from_server(uuid, text, integer, jsonb, jsonb, jsonb, text, integer) to service_role;

comment on function public.finish_game_from_server is
  'Конец партии с игрового WS. Только service_role. Повтор по room_id возвращает тот же match_id без второго Elo.';
