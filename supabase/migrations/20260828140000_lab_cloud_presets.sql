-- Лаба: облачные аккорды и пресеты (user-scoped, RLS)

create table if not exists public.lab_chord_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  name text not null,
  midis smallint[] not null,
  updated_at timestamptz not null default now(),
  unique (user_id, client_id),
  constraint lab_chord_presets_midis_len check (
    cardinality(midis) >= 2 and cardinality(midis) <= 8
  )
);

create index if not exists lab_chord_presets_user_updated_idx
  on public.lab_chord_presets (user_id, updated_at desc);

alter table public.lab_chord_presets enable row level security;

drop policy if exists "lab_chords_select_own" on public.lab_chord_presets;
create policy "lab_chords_select_own"
  on public.lab_chord_presets for select
  using (auth.uid() = user_id);

drop policy if exists "lab_chords_insert_own" on public.lab_chord_presets;
create policy "lab_chords_insert_own"
  on public.lab_chord_presets for insert
  with check (auth.uid() = user_id);

drop policy if exists "lab_chords_update_own" on public.lab_chord_presets;
create policy "lab_chords_update_own"
  on public.lab_chord_presets for update
  using (auth.uid() = user_id);

drop policy if exists "lab_chords_delete_own" on public.lab_chord_presets;
create policy "lab_chords_delete_own"
  on public.lab_chord_presets for delete
  using (auth.uid() = user_id);

-- Пресеты лабы (SFX / музыка): полный JSON payload
create table if not exists public.lab_music_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  name text not null,
  kind text not null default 'sfx',
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (user_id, client_id)
);

create index if not exists lab_music_presets_user_updated_idx
  on public.lab_music_presets (user_id, updated_at desc);

alter table public.lab_music_presets enable row level security;

drop policy if exists "lab_presets_select_own" on public.lab_music_presets;
create policy "lab_presets_select_own"
  on public.lab_music_presets for select
  using (auth.uid() = user_id);

drop policy if exists "lab_presets_insert_own" on public.lab_music_presets;
create policy "lab_presets_insert_own"
  on public.lab_music_presets for insert
  with check (auth.uid() = user_id);

drop policy if exists "lab_presets_update_own" on public.lab_music_presets;
create policy "lab_presets_update_own"
  on public.lab_music_presets for update
  using (auth.uid() = user_id);

drop policy if exists "lab_presets_delete_own" on public.lab_music_presets;
create policy "lab_presets_delete_own"
  on public.lab_music_presets for delete
  using (auth.uid() = user_id);
