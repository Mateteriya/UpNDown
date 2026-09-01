-- APPLY-MATCH-HISTORY-LIST-RPC-PROD.sql
-- Production: Supabase SQL Editor, then reload schema / hard-refresh the app.
-- Fixes account match list (Elo already saved, but cabinet feed was empty on other devices).

create or replace function public.updown_list_my_match_history(p_limit integer default 80)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_limit int := greatest(1, least(coalesce(p_limit, 80), 200));
  v_rows jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.finished_at desc nulls last), '[]'::jsonb)
  into v_rows
  from (
    select
      m.id,
      m.code,
      m.finished_at,
      m.deals_count,
      coalesce(m.is_offline, false) as is_offline,
      m.settlement_mode,
      mp.place,
      mp.final_score,
      coalesce(mp.interrupted, false) as interrupted,
      coalesce(mp.is_rated, false) as is_rated,
      case
        when m.chips_by_slot is null or mp.slot_index is null then null
        else nullif(m.chips_by_slot ->> mp.slot_index::text, '')::numeric
      end as chips
    from public.match_players mp
    join public.matches m on m.id = mp.match_id
    where mp.user_id = v_uid
    order by m.finished_at desc nulls last
    limit v_limit
  ) x;

  return jsonb_build_object('ok', true, 'rows', v_rows);
exception
  when undefined_column then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.finished_at desc nulls last), '[]'::jsonb)
    into v_rows
    from (
      select
        m.id,
        m.code,
        m.finished_at,
        m.deals_count,
        false as is_offline,
        null::text as settlement_mode,
        mp.place,
        mp.final_score,
        coalesce(mp.interrupted, false) as interrupted,
        coalesce(mp.is_rated, false) as is_rated,
        null::numeric as chips
      from public.match_players mp
      join public.matches m on m.id = mp.match_id
      where mp.user_id = v_uid
      order by m.finished_at desc nulls last
      limit v_limit
    ) x;
    return jsonb_build_object('ok', true, 'rows', v_rows);
end;
$$;

revoke all on function public.updown_list_my_match_history(integer) from public;
grant execute on function public.updown_list_my_match_history(integer) to authenticated;

comment on function public.updown_list_my_match_history is
  'Лента архива аккаунта: matches+match_players текущего auth.uid(), свежие сверху.';
