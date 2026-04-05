-- Монотонный счётчик версии game_state: merge на клиенте по числу, без смешения с updated_at от слотов.
-- Слоты/аватар без изменения game_state ревизию не увеличивают.

alter table public.game_rooms
  add column if not exists game_state_revision bigint not null default 0;

comment on column public.game_rooms.game_state_revision is
  'Увеличивается только при изменении game_state; обновления только player_slots ревизию не трогают.';

create or replace function public.game_rooms_bump_state_revision()
returns trigger
language plpgsql
as $$
begin
  if new.game_state is distinct from old.game_state then
    new.game_state_revision := coalesce(old.game_state_revision, 0) + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists tr_game_rooms_bump_state_revision on public.game_rooms;

create trigger tr_game_rooms_bump_state_revision
  before update on public.game_rooms
  for each row
  execute procedure public.game_rooms_bump_state_revision();
