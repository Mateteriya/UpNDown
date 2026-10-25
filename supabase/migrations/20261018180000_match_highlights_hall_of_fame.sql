-- Публичный Hall of Fame: снапшоты ярких моментов при финише партии.
-- Scope: rated_online (default) | online_all | offline_cloud

create table if not exists public.match_highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  match_id uuid null,
  kind text not null,
  value numeric not null default 0,
  tier text null,
  source text not null check (source in ('offline', 'online')),
  is_rated boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists match_highlights_kind_value_idx
  on public.match_highlights (kind, value desc, created_at desc);

create index if not exists match_highlights_scope_idx
  on public.match_highlights (source, is_rated, kind, value desc);

create index if not exists match_highlights_user_idx
  on public.match_highlights (user_id, created_at desc);

alter table public.match_highlights enable row level security;

drop policy if exists match_highlights_select_public on public.match_highlights;
create policy match_highlights_select_public
  on public.match_highlights
  for select
  to anon, authenticated
  using (true);

drop policy if exists match_highlights_insert_own on public.match_highlights;
create policy match_highlights_insert_own
  on public.match_highlights
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Вставка пачки highlights (клиент после finish / record_offline_match)
create or replace function public.updown_insert_match_highlights(
  p_match_id uuid,
  p_source text,
  p_is_rated boolean,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_src text := coalesce(nullif(trim(p_source), ''), 'online');
  v_item jsonb;
  v_n int := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if v_src not in ('offline', 'online') then
    return jsonb_build_object('ok', false, 'error', 'bad_source');
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'bad_rows');
  end if;

  for v_item in select * from jsonb_array_elements(p_rows)
  loop
    insert into public.match_highlights (
      user_id, match_id, kind, value, tier, source, is_rated, payload
    ) values (
      v_uid,
      p_match_id,
      coalesce(nullif(trim(v_item->>'kind'), ''), 'party_score'),
      coalesce((v_item->>'value')::numeric, 0),
      nullif(trim(v_item->>'tier'), ''),
      v_src,
      coalesce(p_is_rated, false),
      coalesce(v_item->'payload', '{}'::jsonb)
    );
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('ok', true, 'inserted', v_n);
end;
$$;

revoke all on function public.updown_insert_match_highlights(uuid, text, boolean, jsonb) from public;
grant execute on function public.updown_insert_match_highlights(uuid, text, boolean, jsonb) to authenticated;

-- Чтение зала славы
create or replace function public.updown_get_hall_of_fame(
  p_kind text default 'party_score',
  p_scope text default 'rated_online',
  p_limit integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := coalesce(nullif(trim(p_kind), ''), 'party_score');
  v_scope text := coalesce(nullif(trim(p_scope), ''), 'rated_online');
  v_lim int := greatest(1, least(coalesce(p_limit, 25), 50));
  v_rows jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(t) order by t.rank), '[]'::jsonb)
  into v_rows
  from (
    select
      row_number() over (order by h.value desc, h.created_at asc)::int as rank,
      h.user_id,
      h.kind,
      h.value,
      h.tier,
      h.source,
      h.is_rated,
      h.created_at,
      h.match_id,
      coalesce(nullif(trim(p.display_name), ''), 'Игрок') as display_name
    from public.match_highlights h
    left join public.profiles p on p.user_id = h.user_id
    where h.kind = v_kind
      and (
        (v_scope = 'rated_online' and h.source = 'online' and h.is_rated = true)
        or (v_scope = 'online_all' and h.source = 'online')
        or (v_scope = 'offline_cloud' and h.source = 'offline')
      )
    order by h.value desc, h.created_at asc
    limit v_lim
  ) t;

  return jsonb_build_object(
    'ok', true,
    'kind', v_kind,
    'scope', v_scope,
    'rows', coalesce(v_rows, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.updown_get_hall_of_fame(text, text, integer) from public;
grant execute on function public.updown_get_hall_of_fame(text, text, integer) to anon, authenticated;
