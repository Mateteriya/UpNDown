-- ELO ladder (open / all-time) + finish_game updates ratings; deal_history retention helper.
-- Apply on prod: supabase/scripts/APPLY-PLAYER-RATINGS-PROD.sql

create table if not exists public.player_ratings (
  user_id uuid not null references auth.users (id) on delete cascade,
  ladder_kind text not null default 'open'
    check (ladder_kind in ('open', 'tournament')),
  -- '' = all-time (сезоны позже)
  season_id text not null default '',
  elo integer not null default 1000,
  games integer not null default 0,
  wins integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, ladder_kind, season_id)
);

create index if not exists player_ratings_open_elo_idx
  on public.player_ratings (ladder_kind, season_id, elo desc);

alter table public.player_ratings enable row level security;

drop policy if exists "player_ratings_select_authenticated" on public.player_ratings;
create policy "player_ratings_select_authenticated"
  on public.player_ratings for select
  to authenticated
  using (true);

comment on table public.player_ratings is
  'ELO-лайт: open = обычный онлайн; tournament/season — позже. season_id '''' = все время.';

create or replace function public._updown_ensure_rating(
  p_user_id uuid,
  p_ladder text default 'open',
  p_season text default ''
)
returns public.player_ratings
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.player_ratings;
  v_ladder text := coalesce(nullif(p_ladder, ''), 'open');
  v_season text := coalesce(p_season, '');
begin
  insert into public.player_ratings (user_id, ladder_kind, season_id)
  values (p_user_id, v_ladder, v_season)
  on conflict (user_id, ladder_kind, season_id) do nothing;

  select * into v
  from public.player_ratings
  where user_id = p_user_id
    and ladder_kind = v_ladder
    and season_id = v_season;

  return v;
end;
$$;

create or replace function public._updown_apply_elo_result(
  p_user_id uuid,
  p_won boolean,
  p_opponent_avg_elo numeric,
  p_k numeric default 24
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.player_ratings;
  v_expected numeric;
  v_actual numeric;
  v_next integer;
begin
  v := public._updown_ensure_rating(p_user_id, 'open', '');
  v_expected := 1.0 / (1.0 + power(10.0, (p_opponent_avg_elo - v.elo) / 400.0));
  v_actual := case when p_won then 1.0 else 0.0 end;
  v_next := greatest(100, round(v.elo + p_k * (v_actual - v_expected))::integer);

  update public.player_ratings
  set
    elo = v_next,
    games = games + 1,
    wins = wins + case when p_won then 1 else 0 end,
    updated_at = timezone('utc', now())
  where user_id = p_user_id
    and ladder_kind = 'open'
    and season_id = '';
end;
$$;

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

revoke all on function public.finish_game(uuid, text, integer, jsonb, jsonb, jsonb) from public;
grant execute on function public.finish_game(uuid, text, integer, jsonb, jsonb, jsonb) to authenticated;

create or replace function public.updown_get_leaderboard(
  p_limit integer default 50,
  p_ladder text default 'open',
  p_season text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_lim int := greatest(1, least(coalesce(p_limit, 50), 100));
  v_ladder text := coalesce(nullif(p_ladder, ''), 'open');
  v_season text := coalesce(p_season, '');
  v_rows jsonb;
  v_mine jsonb;
  v_rank bigint;
begin
  select coalesce(jsonb_agg(to_jsonb(t) order by t.rank), '[]'::jsonb)
  into v_rows
  from (
    select
      row_number() over (order by pr.elo desc, pr.wins desc, pr.games asc)::int as rank,
      pr.user_id,
      pr.elo,
      pr.games,
      pr.wins,
      coalesce(nullif(trim(p.display_name), ''), 'Игрок') as display_name
    from public.player_ratings pr
    left join public.profiles p on p.user_id = pr.user_id
    where pr.ladder_kind = v_ladder
      and pr.season_id = v_season
      and pr.games > 0
    order by pr.elo desc, pr.wins desc, pr.games asc
    limit v_lim
  ) t;

  if v_uid is null then
    return jsonb_build_object(
      'ok', true,
      'ladder_kind', v_ladder,
      'season_id', v_season,
      'rows', coalesce(v_rows, '[]'::jsonb),
      'me', null
    );
  end if;

  select x.rank into v_rank
  from (
    select
      pr.user_id,
      row_number() over (order by pr.elo desc, pr.wins desc, pr.games asc) as rank
    from public.player_ratings pr
    where pr.ladder_kind = v_ladder
      and pr.season_id = v_season
      and pr.games > 0
  ) x
  where x.user_id = v_uid;

  select jsonb_build_object(
    'user_id', pr.user_id,
    'elo', pr.elo,
    'games', pr.games,
    'wins', pr.wins,
    'rank', v_rank,
    'display_name', coalesce(nullif(trim(p.display_name), ''), 'Вы')
  )
  into v_mine
  from public.player_ratings pr
  left join public.profiles p on p.user_id = pr.user_id
  where pr.user_id = v_uid
    and pr.ladder_kind = v_ladder
    and pr.season_id = v_season;

  return jsonb_build_object(
    'ok', true,
    'ladder_kind', v_ladder,
    'season_id', v_season,
    'rows', coalesce(v_rows, '[]'::jsonb),
    'me', v_mine
  );
end;
$$;

revoke all on function public.updown_get_leaderboard(integer, text, text) from public;
grant execute on function public.updown_get_leaderboard(integer, text, text) to anon, authenticated;

create or replace function public.updown_compress_old_deal_history(
  p_days integer default 90
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_row record;
  v_light jsonb;
  v_deal jsonb;
  v_arr jsonb;
  v_i int;
begin
  for v_row in
    select id, deal_history
    from public.matches
    where deal_history is not null
      and jsonb_typeof(deal_history) = 'array'
      and jsonb_array_length(deal_history) > 0
      and finished_at < timezone('utc', now()) - make_interval(days => greatest(p_days, 1))
      and coalesce((deal_history -> 0) ? 'bids', false)
  loop
    v_arr := '[]'::jsonb;
    for v_i in 0..(jsonb_array_length(v_row.deal_history) - 1) loop
      v_deal := v_row.deal_history -> v_i;
      v_light := jsonb_build_object(
        'dealNumber', coalesce((v_deal ->> 'dealNumber')::int, v_i + 1),
        'points', coalesce(v_deal -> 'points', '[]'::jsonb)
      );
      v_arr := v_arr || jsonb_build_array(v_light);
    end loop;
    update public.matches set deal_history = v_arr where id = v_row.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.updown_compress_old_deal_history(integer) from public;
-- Manual / cron as postgres or service_role in SQL Editor.
grant execute on function public.updown_compress_old_deal_history(integer) to postgres;

comment on function public.updown_compress_old_deal_history is
  'Сжимает deal_history старше N дней до points-only. SQL Editor: select updown_compress_old_deal_history(90);';
