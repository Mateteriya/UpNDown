-- APPLY-MATCH-ARCHIVE-DETAIL-RPC-PROD.sql
-- Production: run in Supabase SQL Editor (reload schema / hard-refresh app after).
-- Full match detail + account_hint (email local-part) for archive table headers.

create or replace function public.updown_get_match_archive_detail(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match jsonb;
  v_players jsonb;
  v_my_place int;
  v_my_score int;
  v_my_slot int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_match_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_match');
  end if;

  if not exists (
    select 1
    from public.match_players mp
    where mp.match_id = p_match_id
      and mp.user_id = v_uid
  ) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select jsonb_build_object(
    'id', m.id,
    'code', m.code,
    'finished_at', m.finished_at,
    'deals_count', m.deals_count,
    'is_offline', coalesce(m.is_offline, false),
    'settlement_mode', m.settlement_mode,
    'buy_in', m.buy_in,
    'chips_by_slot', m.chips_by_slot,
    'deal_history', m.deal_history
  )
  into v_match
  from public.matches m
  where m.id = p_match_id;

  if v_match is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select coalesce(
    (
      select jsonb_agg(to_jsonb(x) order by x.slot_index)
      from (
        select
          mp.slot_index,
          coalesce(nullif(trim(mp.display_name), ''), 'Игрок') as display_name,
          coalesce(mp.is_ai, mp.user_id is null) as is_ai,
          coalesce(mp.final_score, 0) as final_score,
          mp.place,
          mp.bid_accuracy,
          coalesce(mp.interrupted, false) as interrupted,
          coalesce(mp.is_rated, false) as is_rated,
          mp.user_id,
          case
            when mp.user_id is null then null
            else nullif(split_part(coalesce(u.email::text, ''), '@', 1), '')
          end as account_hint
        from public.match_players mp
        left join auth.users u on u.id = mp.user_id
        where mp.match_id = p_match_id
      ) x
    ),
    '[]'::jsonb
  )
  into v_players;

  select mp.place, mp.final_score, mp.slot_index
  into v_my_place, v_my_score, v_my_slot
  from public.match_players mp
  where mp.match_id = p_match_id and mp.user_id = v_uid
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'match', v_match,
    'players', v_players,
    'my_place', v_my_place,
    'my_final_score', v_my_score,
    'my_slot_index', v_my_slot
  );
exception
  when undefined_column then
    select jsonb_build_object(
      'id', m.id,
      'code', m.code,
      'finished_at', m.finished_at,
      'deals_count', m.deals_count,
      'is_offline', false,
      'settlement_mode', null,
      'buy_in', null,
      'chips_by_slot', null,
      'deal_history', null
    )
    into v_match
    from public.matches m
    where m.id = p_match_id;

    if v_match is null then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;

    select coalesce(
      (
        select jsonb_agg(to_jsonb(x) order by x.slot_index)
        from (
          select
            mp.slot_index,
            coalesce(nullif(trim(mp.display_name), ''), 'Игрок') as display_name,
            coalesce(mp.is_ai, mp.user_id is null) as is_ai,
            coalesce(mp.final_score, 0) as final_score,
            mp.place,
            mp.bid_accuracy,
            coalesce(mp.interrupted, false) as interrupted,
            coalesce(mp.is_rated, false) as is_rated,
            mp.user_id,
            case
              when mp.user_id is null then null
              else nullif(split_part(coalesce(u.email::text, ''), '@', 1), '')
            end as account_hint
          from public.match_players mp
          left join auth.users u on u.id = mp.user_id
          where mp.match_id = p_match_id
        ) x
      ),
      '[]'::jsonb
    )
    into v_players;

    select mp.place, mp.final_score, mp.slot_index
    into v_my_place, v_my_score, v_my_slot
    from public.match_players mp
    where mp.match_id = p_match_id and mp.user_id = v_uid
    limit 1;

    return jsonb_build_object(
      'ok', true,
      'match', v_match,
      'players', v_players,
      'my_place', v_my_place,
      'my_final_score', v_my_score,
      'my_slot_index', v_my_slot
    );
end;
$$;

revoke all on function public.updown_get_match_archive_detail(uuid) from public;
grant execute on function public.updown_get_match_archive_detail(uuid) to authenticated;

notify pgrst, 'reload schema';
