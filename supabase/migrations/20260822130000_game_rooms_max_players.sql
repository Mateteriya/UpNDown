-- Число мест за столом при создании комнаты (3 или 4).

alter table public.game_rooms
  add column if not exists max_players int not null default 4;

alter table public.game_rooms
  drop constraint if exists game_rooms_max_players_check;

alter table public.game_rooms
  add constraint game_rooms_max_players_check check (max_players in (3, 4));

comment on column public.game_rooms.max_players is
  'Число мест за столом: 3 или 4. Старые строки без явного значения — 4.';
