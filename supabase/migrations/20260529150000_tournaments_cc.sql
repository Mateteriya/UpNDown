-- Волна 4: sit-n-go турниры на CC (регистрация + seating задел).

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text not null default 'registration' check (
    status in ('registration', 'seating', 'playing', 'finished', 'cancelled')
  ),
  buy_in_cc bigint not null default 100 check (buy_in_cc > 0),
  max_players int not null default 4 check (max_players in (3, 4)),
  settlement_mode text not null default 'prize_pool',
  starts_at timestamptz,
  created_at timestamptz not null default now(),
  room_id uuid references public.game_rooms (id) on delete set null
);

create table if not exists public.tournament_registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  registered_at timestamptz not null default now(),
  unique (tournament_id, user_id)
);

alter table public.tournaments enable row level security;
alter table public.tournament_registrations enable row level security;

drop policy if exists tournaments_select_all on public.tournaments;
create policy tournaments_select_all on public.tournaments
  for select to authenticated
  using (true);

drop policy if exists tournament_regs_select_own on public.tournament_registrations;
create policy tournament_regs_select_own on public.tournament_registrations
  for select to authenticated
  using (user_id = auth.uid() or true);

create or replace function public.updown_list_open_tournaments(p_limit int default 20)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.starts_at nulls last), '[]'::jsonb)
  into v_rows
  from (
    select
      tr.id,
      tr.title,
      tr.status,
      tr.buy_in_cc,
      tr.max_players,
      tr.starts_at,
      (select count(*)::int from public.tournament_registrations r where r.tournament_id = tr.id) as registered_count
    from public.tournaments tr
    where tr.status in ('registration', 'seating')
    order by tr.starts_at nulls last
    limit greatest(1, least(coalesce(p_limit, 20), 50))
  ) t;

  return jsonb_build_object('ok', true, 'tournaments', v_rows);
end;
$$;

create or replace function public.updown_register_tournament(p_tournament_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  t public.tournaments%rowtype;
  v_count int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into t from public.tournaments where id = p_tournament_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if t.status <> 'registration' then
    return jsonb_build_object('ok', false, 'error', 'registration_closed');
  end if;

  select count(*)::int into v_count from public.tournament_registrations where tournament_id = p_tournament_id;
  if v_count >= t.max_players then
    return jsonb_build_object('ok', false, 'error', 'full');
  end if;

  insert into public.tournament_registrations (tournament_id, user_id)
  values (p_tournament_id, v_uid)
  on conflict (tournament_id, user_id) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.updown_list_open_tournaments(int) from public;
grant execute on function public.updown_list_open_tournaments(int) to authenticated;
revoke all on function public.updown_register_tournament(uuid) from public;
grant execute on function public.updown_register_tournament(uuid) to authenticated;
