-- История офлайн-партий на сервере: метка матча + RPC (SECURITY DEFINER).
-- Требуются существующие таблицы public.matches и public.match_players (как у finish_game).

alter table public.matches add column if not exists is_offline boolean not null default false;

create or replace function public.record_offline_match(
  p_deals_count integer,
  p_final_score integer,
  p_place integer,
  p_display_name text,
  p_bid_accuracy integer
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
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_deals_count is null or p_deals_count < 1 then
    raise exception 'invalid_deals_count';
  end if;

  v_code := 'OFF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.matches (code, finished_at, deals_count, is_offline)
  values (v_code, timezone('utc', now()), p_deals_count, true)
  returning id into v_match_id;

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

  return v_match_id;
end;
$fn$;

revoke all on function public.record_offline_match(integer, integer, integer, text, integer) from public;
grant execute on function public.record_offline_match(integer, integer, integer, text, integer) to authenticated;

comment on function public.record_offline_match is 'Фиксирует завершённую офлайн-партию в matches/match_players; is_rated=false — не в зачёт рейтинговой статистики.';
