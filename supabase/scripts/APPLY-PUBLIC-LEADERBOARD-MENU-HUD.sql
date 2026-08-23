-- Прод: публичный топ ELO для гравировки в главном меню (гость видит #1, без «меня»).
-- SQL Editor, роль postgres. Безопасно повторять.

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
