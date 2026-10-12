-- Квитанции LAN/офлайн-партий → привязка к аккаунту по email / claimToken.
-- См. docs/OFFLINE-PARTY-SYNC.md

create table if not exists public.party_claim_receipts (
  id uuid primary key default gen_random_uuid(),
  claim_token text not null unique,
  match_key text not null,
  email text not null,
  intent text not null check (intent in ('existing_account', 'new_account')),
  finished_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'bound')),
  user_id uuid references auth.users (id) on delete set null,
  match_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  bound_at timestamptz
);

create index if not exists party_claim_receipts_email_idx
  on public.party_claim_receipts (lower(email));
create index if not exists party_claim_receipts_match_key_idx
  on public.party_claim_receipts (match_key);
create index if not exists party_claim_receipts_user_pending_idx
  on public.party_claim_receipts (user_id, status);

alter table public.party_claim_receipts enable row level security;

drop policy if exists party_claim_receipts_select_own on public.party_claim_receipts;
create policy party_claim_receipts_select_own
  on public.party_claim_receipts for select to authenticated
  using (
    user_id = auth.uid()
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- Анон может создать квитанцию (без чтения чужих).
create or replace function public.submit_party_claim(
  p_claim_token text,
  p_match_key text,
  p_email text,
  p_intent text,
  p_finished_at timestamptz,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id uuid;
  v_email text;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' or position('@' in v_email) < 2 then
    raise exception 'invalid_email';
  end if;
  if p_claim_token is null or length(trim(p_claim_token)) < 8 then
    raise exception 'invalid_token';
  end if;
  if p_intent not in ('existing_account', 'new_account') then
    raise exception 'invalid_intent';
  end if;

  insert into public.party_claim_receipts (
    claim_token, match_key, email, intent, finished_at, payload, status
  ) values (
    trim(p_claim_token),
    trim(p_match_key),
    v_email,
    p_intent,
    coalesce(p_finished_at, timezone('utc', now())),
    coalesce(p_payload, '{}'::jsonb),
    'pending'
  )
  on conflict (claim_token) do update
    set payload = excluded.payload,
        finished_at = excluded.finished_at,
        intent = excluded.intent,
        match_key = excluded.match_key,
        email = excluded.email
  returning id into v_id;

  return v_id;
end;
$fn$;

revoke all on function public.submit_party_claim(text, text, text, text, timestamptz, jsonb) from public;
grant execute on function public.submit_party_claim(text, text, text, text, timestamptz, jsonb) to anon, authenticated;

create or replace function public.list_my_party_claims()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  return coalesce((
    select jsonb_agg(row_to_json(t)::jsonb order by t.created_at desc)
    from (
      select
        id, claim_token, match_key, email, intent, finished_at, status, payload, created_at, user_id, match_id
      from public.party_claim_receipts
      where status in ('pending', 'bound')
        and (
          user_id = v_uid
          or (v_email <> '' and lower(email) = v_email)
        )
      order by created_at desc
      limit 40
    ) t
  ), '[]'::jsonb);
end;
$fn$;

revoke all on function public.list_my_party_claims() from public;
grant execute on function public.list_my_party_claims() to authenticated;

-- Привязка после логина; new_account + токен → сразу accepted + запись в matches.
create or replace function public.bind_party_claims_for_user(p_claim_token text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_bound int := 0;
  r record;
  v_match_id uuid;
  v_viewer jsonb;
  v_place int;
  v_score int;
  v_acc int;
  v_name text;
  v_deals int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  for r in
    select *
    from public.party_claim_receipts
    where status = 'pending'
      and (
        (p_claim_token is not null and claim_token = trim(p_claim_token))
        or (v_email <> '' and lower(email) = v_email)
      )
  loop
    update public.party_claim_receipts
      set user_id = v_uid,
          status = case
            when r.intent = 'new_account' and p_claim_token is not null and r.claim_token = trim(p_claim_token)
              then 'accepted'
            when r.intent = 'new_account' and p_claim_token is null
              then 'accepted'
            else 'bound'
          end,
          bound_at = timezone('utc', now())
      where id = r.id;

    -- Авто-принять в историю для new_account
    if r.intent = 'new_account'
       or (p_claim_token is not null and r.claim_token = trim(p_claim_token) and r.intent = 'new_account') then
      v_viewer := coalesce(r.payload -> 'viewer', '{}'::jsonb);
      v_place := coalesce((v_viewer ->> 'humanPlace')::int, 1);
      v_score := coalesce((v_viewer ->> 'humanScore')::int, 0);
      v_acc := coalesce((v_viewer ->> 'humanBidAccuracyPct')::int, 0);
      v_deals := coalesce((v_viewer ->> 'dealCount')::int, 1);
      v_name := coalesce(
        nullif(trim(v_viewer #>> '{seatNames,0}'), ''),
        'Вы'
      );
      begin
        v_match_id := public.record_offline_match(v_deals, v_score, v_place, v_name, v_acc);
        update public.party_claim_receipts
          set match_id = v_match_id, status = 'accepted'
          where id = r.id;
      exception when others then
        -- оставляем bound — пользователь примет вручную
        update public.party_claim_receipts set status = 'bound' where id = r.id;
      end;
    end if;

    v_bound := v_bound + 1;
  end loop;

  return v_bound;
end;
$fn$;

revoke all on function public.bind_party_claims_for_user(text) from public;
grant execute on function public.bind_party_claims_for_user(text) to authenticated;

create or replace function public.accept_party_claim(p_claim_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_email text;
  r public.party_claim_receipts%rowtype;
  v_match_id uuid;
  v_viewer jsonb;
  v_place int;
  v_score int;
  v_acc int;
  v_name text;
  v_deals int;
  v_hi int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  select * into r from public.party_claim_receipts where id = p_claim_id;
  if not found then
    raise exception 'not_found';
  end if;
  if r.status not in ('pending', 'bound') then
    raise exception 'bad_status';
  end if;
  if r.user_id is distinct from v_uid and lower(r.email) is distinct from v_email then
    raise exception 'forbidden';
  end if;

  v_viewer := coalesce(r.payload -> 'viewer', '{}'::jsonb);
  v_hi := coalesce((v_viewer ->> 'humanIndex')::int, 0);
  v_place := coalesce((v_viewer ->> 'humanPlace')::int, 1);
  v_score := coalesce((v_viewer ->> 'humanScore')::int, 0);
  v_acc := coalesce((v_viewer ->> 'humanBidAccuracyPct')::int, 0);
  v_deals := greatest(1, coalesce((v_viewer ->> 'dealCount')::int, 1));
  v_name := coalesce(
    nullif(trim(v_viewer -> 'seatNames' ->> v_hi), ''),
    nullif(trim(v_viewer #>> '{seatNames,0}'), ''),
    'Вы'
  );

  v_match_id := public.record_offline_match(v_deals, v_score, v_place, v_name, v_acc);

  update public.party_claim_receipts
    set status = 'accepted',
        user_id = v_uid,
        match_id = v_match_id,
        bound_at = coalesce(bound_at, timezone('utc', now()))
    where id = p_claim_id;

  return v_match_id;
end;
$fn$;

revoke all on function public.accept_party_claim(uuid) from public;
grant execute on function public.accept_party_claim(uuid) to authenticated;

create or replace function public.reject_party_claim(p_claim_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_email text;
  r public.party_claim_receipts%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  select * into r from public.party_claim_receipts where id = p_claim_id;
  if not found then
    raise exception 'not_found';
  end if;
  if r.user_id is distinct from v_uid and lower(r.email) is distinct from v_email then
    raise exception 'forbidden';
  end if;
  update public.party_claim_receipts set status = 'rejected', user_id = coalesce(user_id, v_uid)
    where id = p_claim_id;
end;
$fn$;

revoke all on function public.reject_party_claim(uuid) from public;
grant execute on function public.reject_party_claim(uuid) to authenticated;

comment on table public.party_claim_receipts is 'LAN/offline party receipts awaiting account bind (email + claimToken).';
