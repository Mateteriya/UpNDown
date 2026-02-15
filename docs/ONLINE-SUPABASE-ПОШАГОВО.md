# Онлайн на Supabase (временно): пошаговая инструкция

Подробная инструкция, чтобы поднять **временный** онлайнгеймплей на Supabase. Всё делается по шагам; SQL можно копировать и вставлять целиком. Позже переключимся на сервер друга без переписывания лобби и игры.

---

## Что будет в итоге

- Таблица **game_rooms** в Supabase: комнаты с кодом, состоянием игры, списком игроков.
- **Realtime** включён для этой таблицы — все участники комнаты видят обновления сразу.
- Фронт: «Создать комнату» → показ кода; «Присоединиться» → ввод кода → общая игра.

---

## Часть 1. Создание таблицы в Supabase

### Шаг 1.1. Открыть SQL Editor

1. Зайди на [supabase.com](https://supabase.com) и открой **свой проект** (тот же, где уже настроена авторизация для Up&Down).
2. В левом меню выбери **SQL Editor** (иконка с символом `</>` или «SQL Editor»).
3. Нажми **New query** (или «Новый запрос»), чтобы открыть пустое окно для SQL.

### Шаг 1.2. Вставить и выполнить SQL создания таблицы

Скопируй **весь** блок ниже и вставь в окно запроса. Затем нажми **Run** (или Ctrl+Enter).

```sql
-- Таблица комнат для онлайн-игры (временный вариант на Supabase)
create table if not exists public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  game_state jsonb,
  player_slots jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Комментарии для ясности
comment on table public.game_rooms is 'Комнаты для онлайн-игры; состояние игры и слоты игроков';
comment on column public.game_rooms.code is 'Короткий код для входа (например 6 символов)';
comment on column public.game_rooms.game_state is 'Полное состояние игры (JSON из GameEngine)';
comment on column public.game_rooms.player_slots is 'Массив { userId, displayName, slotIndex } по слотам 0..3';
```

**Что должно произойти:** внизу появится сообщение вроде «Success. No rows returned» — это нормально, таблица создалась.

**Проверка:** в левом меню открой **Table Editor**, в списке таблиц должна появиться **game_rooms**. Можно зайти в неё и убедиться, что колонки есть: id, code, host_user_id, status, game_state, player_slots, created_at, updated_at.

---

## Часть 2. Включить Realtime для таблицы

Чтобы все участники комнаты получали обновления состояния игры без перезагрузки страницы, нужно включить Realtime для `game_rooms`.

### Шаг 2.1. Открыть настройки Replication

1. В левом меню Supabase выбери **Database**.
2. В подменю или вкладках найди **Replication** (или «Replication» в списке слева). Если такого пункта нет — ищи **Publications** или зайди в **Database** → **Replication** в верхнем меню.
3. Откроется список таблиц и переключателей «Realtime» (или «Supabase Realtime»).

### Шаг 2.2. Включить Realtime для game_rooms

1. В списке таблиц найди **game_rooms** (или public.game_rooms).
2. Включи для неё переключатель **Realtime** (сделай активным / зелёным).
3. Сохрани изменения, если есть кнопка Save.

**Альтернатива через SQL:** если в интерфейсе нет переключателя, в **SQL Editor** выполни:

```sql
alter publication supabase_realtime add table public.game_rooms;
```

Если появится ошибка вроде «table already in publication» — значит Realtime уже включён, ничего делать не нужно.

---

## Часть 3. Политики доступа (RLS)

Сделаем так: создавать комнату может любой авторизованный пользователь; читать и обновлять комнату — только участники этой комнаты (их id есть в `player_slots`) или хост.

### Шаг 3.1. Включить RLS для game_rooms

В **SQL Editor** выполни (новый запрос или тот же файл):

```sql
alter table public.game_rooms enable row level security;
```

### Шаг 3.2. Создать политики

Выполни **по очереди** три блока.

**Политика 1: создание комнаты** — только авторизованный пользователь может вставить строку и становится хостом:

```sql
create policy "Users can create game room"
  on public.game_rooms
  for insert
  to authenticated
  with check (auth.uid() = host_user_id);
```

**Политика 2: чтение комнаты** — для теста разрешаем читать любому авторизованному пользователю (упрощённо; потом можно ужесточить — только участники и хост):

```sql
create policy "Authenticated users can read game rooms"
  on public.game_rooms
  for select
  to authenticated
  using (true);
```

**Политика 3: обновление комнаты** — обновлять состояние могут участники (для временного варианта разрешим любому авторизованному, чтобы не усложнять):

```sql
create policy "Authenticated users can update game room"
  on public.game_rooms
  for update
  to authenticated
  using (true)
  with check (true);
```

**Если появится ошибка «policy already exists»:** выполни в SQL Editor, подставив имя политики в кавычках:  
`drop policy if exists "имя_политики" on public.game_rooms;`  
затем снова создай политику.

**Итог:** RLS включён, создавать комнату может только авторизованный (и он указывается как host); читать и обновлять для простоты теста могут все авторизованные. Позже можно заменить на проверку по `player_slots`.

---

## Часть 3.5. Таблица присутствия (замена отключившегося игрока на ИИ)

Чтобы через минуту после отключения игрока (закрыл вкладку, пропал интернет) заменять его на ИИ, нужна таблица **game_room_presence**. В **SQL Editor** выполни:

```sql
create table if not exists public.game_room_presence (
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  user_id uuid not null,
  last_seen timestamptz not null default now(),
  primary key (room_id, user_id)
);

comment on table public.game_room_presence is 'Последняя активность участников комнаты; хост проверяет раз в минуту и заменяет отключившихся на ИИ';

alter table public.game_room_presence enable row level security;

create policy "Users can upsert own presence"
  on public.game_room_presence for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can read presence in rooms"
  on public.game_room_presence for select to authenticated
  using (true);
```

После этого клиент раз в 20 секунд обновляет свою запись, а хост раз в 60 секунд проверяет: если у кого-то из игроков `last_seen` старше минуты — этот слот заменяется на ИИ и игра продолжается.

---

## Часть 4. Функция для обновления updated_at (по желанию)

Чтобы в таблице автоматически обновлялось поле `updated_at` при любом изменении строки:

В **SQL Editor** выполни:

```sql
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger game_rooms_updated_at
  before update on public.game_rooms
  for each row
  execute function public.set_updated_at();
```

Если не хочешь возиться с триггерами — этот шаг можно пропустить; на работу онлайна это не влияет.

---

## Часть 5. Проверка

1. **Table Editor** → таблица **game_rooms** — должна быть, колонки на месте.
2. **Database** → **Replication** — у **game_rooms** включён Realtime.
3. **Authentication** → **Policies** (или Table Editor → game_rooms → RLS) — у таблицы включён RLS и висят созданные политики.

**Упрощения (RLS)** записаны в отдельном файле, чтобы не забыть их ужесточить при переезде на постоянный сервер: [ONLINE-УПРОЩЕНИЯ-И-ПЕРЕЕЗД.md](./ONLINE-УПРОЩЕНИЯ-И-ПЕРЕЕЗД.md).

После этого Supabase готов. Дальше в коде будет:
- создание строки в `game_rooms` при «Создать комнату» (генерируем уникальный код, пишем host_user_id, status = 'waiting', player_slots = []);
- подписка на изменения этой строки через Realtime;
- при «Присоединиться» — поиск комнаты по коду, добавление себя в player_slots, обновление строки;
- при ходе/заказе — обновление game_state в этой строке; все подписанты получают обновление через Realtime.

---

## Часть 6. Что будет сделано в коде (для тебя только информация)

Эту часть делаю я; тебе ничего настраивать не нужно, только знать порядок:

1. **Модуль онлайн-клиента** — один интерфейс (createRoom, joinRoom, sendBid, sendPlay, подписка на состояние). Реализация «Supabase»: работа с таблицей game_rooms и Realtime.
2. **Лобби** — кнопки «Создать комнату» и «Присоединиться» становятся рабочими: создание комнаты, показ кода, ввод кода и вход в комнату.
3. **Экран игры онлайн** — тот же стол, но состояние приходит из Realtime; заказ и ход отправляются в Supabase (обновление game_state).
4. **Переезд на сервер друга** — в коде появится вторая реализация того же интерфейса (WebSocket); переключение по настройке. Инструкция по переезду будет в [ONLINE-SERVER-INSTRUCTIONS.md](./ONLINE-SERVER-INSTRUCTIONS.md).

---

## Краткий чеклист для тебя

- [ ] Открыла проект в Supabase → SQL Editor.
- [ ] Выполнила SQL создания таблицы `game_rooms` (Шаг 1.2).
- [ ] Проверила в Table Editor: таблица game_rooms есть.
- [ ] Включила Realtime для game_rooms (Database → Replication или SQL из Шага 2.2).
- [ ] Выполнила SQL включения RLS и создания политик (Часть 3).
- [ ] (По желанию) Выполнила SQL триггера для updated_at (Часть 4).

После выполнения всех пунктов напиши в чат — перейдём к коду (лобби + онлайн-игра).
