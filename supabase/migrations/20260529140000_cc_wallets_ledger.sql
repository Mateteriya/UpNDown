-- Волна 3: Cosmic Credits ledger (hold/settle задел; активируется VITE_CC_LEDGER_ENABLED).

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  currency text not null default 'cc' check (currency in ('cc')),
  balance bigint not null default 0 check (balance >= 0),
  held bigint not null default 0 check (held >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, currency)
);

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets (id) on delete cascade,
  amount bigint not null,
  entry_type text not null check (
    entry_type in ('grant', 'purchase', 'hold', 'release', 'settle', 'fee', 'admin')
  ),
  ref_type text,
  ref_id uuid,
  idempotency_key text,
  created_at timestamptz not null default now()
);

create unique index if not exists ledger_entries_idempotency_key_idx
  on public.ledger_entries (idempotency_key)
  where idempotency_key is not null;

create index if not exists ledger_entries_wallet_id_idx on public.ledger_entries (wallet_id);

alter table public.wallets enable row level security;
alter table public.ledger_entries enable row level security;

drop policy if exists wallets_select_own on public.wallets;
create policy wallets_select_own on public.wallets
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists ledger_select_own on public.ledger_entries;
create policy ledger_select_own on public.ledger_entries
  for select to authenticated
  using (
    wallet_id in (select id from public.wallets w where w.user_id = auth.uid())
  );

create or replace function public._updown_get_or_create_cc_wallet(p_uid uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.wallets where user_id = p_uid and currency = 'cc';
  if found then
    return v_id;
  end if;
  insert into public.wallets (user_id, currency, balance, held)
  values (p_uid, 'cc', 500, 0)
  returning id into v_id;
  insert into public.ledger_entries (wallet_id, amount, entry_type, ref_type, idempotency_key)
  values (v_id, 500, 'grant', 'signup_bonus', 'signup_bonus:' || p_uid::text);
  return v_id;
end;
$$;

create or replace function public.updown_cc_daily_grant()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_wallet_id uuid;
  v_key text;
  v_grant bigint := 30;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  v_wallet_id := public._updown_get_or_create_cc_wallet(v_uid);
  v_key := 'daily:' || v_uid::text || ':' || to_char(timezone('utc', now()), 'YYYY-MM-DD');

  if exists (select 1 from public.ledger_entries where idempotency_key = v_key) then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;

  update public.wallets set balance = balance + v_grant, updated_at = now() where id = v_wallet_id;
  insert into public.ledger_entries (wallet_id, amount, entry_type, ref_type, idempotency_key)
  values (v_wallet_id, v_grant, 'grant', 'daily', v_key);

  return jsonb_build_object(
    'ok', true,
    'granted', v_grant,
    'balance', (select balance from public.wallets where id = v_wallet_id)
  );
end;
$$;

create or replace function public.updown_cc_hold_for_room(
  p_room_id uuid,
  p_amount bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_wallet_id uuid;
  v_key text;
  w public.wallets%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'bad_amount');
  end if;

  v_wallet_id := public._updown_get_or_create_cc_wallet(v_uid);
  v_key := 'hold:' || p_room_id::text || ':' || v_uid::text;

  if exists (select 1 from public.ledger_entries where idempotency_key = v_key) then
    return jsonb_build_object('ok', true, 'already_held', true);
  end if;

  select * into w from public.wallets where id = v_wallet_id for update;
  if w.balance < p_amount then
    return jsonb_build_object('ok', false, 'error', 'insufficient_balance');
  end if;

  update public.wallets
  set balance = balance - p_amount, held = held + p_amount, updated_at = now()
  where id = v_wallet_id;

  insert into public.ledger_entries (wallet_id, amount, entry_type, ref_type, ref_id, idempotency_key)
  values (v_wallet_id, -p_amount, 'hold', 'room', p_room_id, v_key);

  return jsonb_build_object('ok', true, 'held', p_amount);
end;
$$;

revoke all on function public.updown_cc_daily_grant() from public;
grant execute on function public.updown_cc_daily_grant() to authenticated;
revoke all on function public.updown_cc_hold_for_room(uuid, bigint) from public;
grant execute on function public.updown_cc_hold_for_room(uuid, bigint) to authenticated;
