# Игровой сервер Up&Down (WebSocket, протокол v2)

Server-authoritative синхронизация партии: клиент шлёт **команды**, сервер применяет `GameEngine` и рассылает `game_state`.

**Ветка разработки:** `feat/lan-server-v2`. На `main` без merge — старый облачный путь (Supabase).

Общий workflow: [docs/LAN-SERVER-V2-WORKFLOW.md](../docs/LAN-SERVER-V2-WORKFLOW.md).  
Протокол: [docs/LAN-SERVER-V2-RFC.md](../docs/LAN-SERVER-V2-RFC.md).

---

## Панель хоста (LAN на ПК)

После запуска: **http://localhost:3001/host** — комната, QR, ссылка `/play/`.  
Один порт: `npm run host:app` (сервер + статика игры).  
Подробнее: [docs/HOST-UTILITY.md](../docs/HOST-UTILITY.md).

---

## Быстрый старт (Wi‑Fi, 3–4 игрока)

### 1. Ветка и установка (один раз)

```bash
git checkout feat/lan-server-v2
npm run server:install
```

**Windows: `EPERM` на `esbuild.exe`** — закройте лишние `node.exe` / `server:dev`, затем снова `npm run server:install`.

### 2. Сервер

```bash
npm run server:dev
```

В консоли: `ws://0.0.0.0:3001`. Для телефонов — **IPv4 ПК в Wi‑Fi** (`ipconfig`).

### 3. Фронт (`.env.local` в корне репо)

```env
VITE_ONLINE_TRANSPORT=ws
VITE_WS_URL=ws://192.168.1.5:3001
```

Подставьте свой IP. На телефонах — не `localhost`.

### 4. Приложение по сети

```bash
npm run dev:host
```

ПК: `http://localhost:5173`  
Телефоны: `http://192.168.1.5:5173`

Или одной командой: `npm run host:app` (сервер + `dist-host` на `:3001/play/`).

### 5. Игра

1. Имя в профиле.
2. Онлайн-лобби → создать / войти по коду.
3. Google **не обязателен** в режиме `ws`.

Партия идёт **только** через WebSocket. Supabase не нужен для синхронизации стола.

---

## Протокол v2 (кратко)

### Лобби (клиент → сервер)

`create_room`, `join_room`, `leave_room`, `subscribe_room`, `get_room`, `update_slots`, `update_display_name`, `list_public_waiting`, `peek_room`, `recover_join`, `chat_history`, `chat_post`, `chat_typing`

Новые комнаты: **`protocol_version: 2`** по умолчанию. Откат: `create_room` с `protocolVersion: 1`.

### Игра (клиент → сервер)

| type | Назначение |
|------|------------|
| `start_game` | Старт партии (хост) |
| `place_bid` | Заказ |
| `play_card` | Ход |
| `take_pause` / `return_from_pause` | Пауза |
| `host_return_slot` | Хост занимает слот |
| `transfer_host` | Смена хоста |
| `host_resolve_absent` | Absent host |

**Запрещено в v2:** `update_state`.

### Сервер → клиент

| type | Назначение |
|------|------------|
| `hello` | Подключение OK |
| `game_state` | `revision`, полный `state` |
| `room_snapshot` / `room_meta` | Лобби, слоты |
| `command_result` | Ответ на команду |
| `error` | Ошибка |

Таймеры на сервере: взятка ~2 с, следующая раздача ~4.5 с после `deal-complete`.  
ИИ: `server/src/v2/AiDriver.ts` (пустые слоты), не на клиенте.

Код: `server/src/v2/`, типы — `server/src/protocol.ts`.

---

## Порт и переменные

| Переменная | По умолчанию | Назначение |
|------------|--------------|------------|
| `PORT` | `3001` | HTTP + WebSocket |
| `HOST` | `0.0.0.0` | Слушать все интерфейсы (`127.0.0.1` за Caddy на VPS) |
| `PUBLIC_WS_URL` | — | `wss://…` для ссылок в API (VPS) |
| `PUBLIC_GAME_URL` | — | URL фронта в `/api/info` |
| `GAME_DIST` | — | Путь к `dist-host` (LAN `/play/`) |
| `WS_BACKUP_PORTS` | LAN: +1,+2; prod: выкл. | Запасные порты; `none` — отключить |
| `ROOM_PERSIST` | `1` | `0` — не писать комнаты на диск |
| `ROOM_PERSIST_PATH` | `server/data/rooms.json` | Файл снимка комнат |
| `NODE_ENV` | — | `production` на VPS |

```bash
PORT=3002 npm run start --prefix server
```

Health: `GET /api/health` и `GET /api/version`.

---

## Тесты

```bash
npx vitest run server/src/v2/GameSession.test.ts
```

Unit-тесты: `server/src/v2/GameSession.test.ts`.

---

## Ограничения (альфа)

- Комнаты в памяти + **снимок на диск** (`ROOM_PERSIST`): рестарт процесса восстанавливает waiting/playing. Игроки всё равно должны переподключить WS (клиент делает auto-reconnect).
- Рейтинг / `finish_game` после партии — пока через Supabase на клиенте.
- Чат комнаты — Supabase, не WS.
- Один процесс Node; без кластера / Redis.

Облачный деплой (VPS): [docs/TECH-DIRECTOR-ONLINE-SERVER.md](../docs/TECH-DIRECTOR-ONLINE-SERVER.md).  
Готовые файлы: `Dockerfile.ws`, `deploy/updown-ws.service`, `deploy/Caddyfile.example`.

---

## Вернуться на Supabase (облако на main)

В `.env.local` уберите или закомментируйте:

```env
# VITE_ONLINE_TRANSPORT=ws
# VITE_WS_URL=...
```

Без `VITE_ONLINE_TRANSPORT=ws` клиент использует Supabase Realtime.
