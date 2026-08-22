# Игровой сервер Up&Down (WebSocket, протокол v2)

Server-authoritative синхронизация партии: клиент шлёт **команды**, сервер применяет `GameEngine` и рассылает `game_state`.

**Прод (VPS):** [docs/PRODUCTION-WS.md](../docs/PRODUCTION-WS.md) — `npm run server:build`, `WS_AUTH=required`, секреты в `/etc/updown/ws.env`.

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
| `ROOM_BACKUP_KEEP` | `24` | Сколько копий в `backups/` (`0` = выкл.) |
| `ROOM_BACKUP_EVERY_MS` | `600000` | Интервал авто-бэкапа (мин. 60с) |
| `WS_AUTH` | `optional` | `off` / `optional` / `required` — JWT на сокете; `required` без секрета не стартует |
| `SUPABASE_JWT_SECRET` | — | Legacy JWT Secret (HS256). Обязателен при `required` |
| `SUPABASE_URL` | — | Для `finish_game_from_server` с WS |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Только процесс WS; не в git |
| `WS_TRUST_PROXY` | auto | `1` за Caddy (`HOST=127.0.0.1`); иначе не доверять `X-Forwarded-For` |
| `WS_MAX_ROOMS` | `80` | Потолок комнат на процесс |
| `WS_MAX_SOCKETS` | `400` | Потолок одновременных WS |
| `WS_MAX_ROOMS_PER_IP` | `8` | Комнат с одного IP |
| `WS_CREATE_PER_MIN` | `6` | create_room / IP / мин |
| `WS_JOIN_PER_MIN` | `20` | join/recover / IP / мин |
| `WS_MSG_PER_SEC` | `40` | Сообщений / IP / сек |
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
- Рейтинг / конец партии на **WS**: RPC `finish_game_from_server` (service_role). Клиент на транспорте `ws` не вызывает `finish_game`.
- Чат комнаты на WS.
- Один процесс Node; без кластера / Redis.

Облачный деплой: [docs/PRODUCTION-WS.md](../docs/PRODUCTION-WS.md).  
Готовые файлы: `Dockerfile.ws`, `deploy/updown-ws.service`, `deploy/updown-ws.env.example`.

---

## Вернуться на Supabase (облако на main)

В `.env.local` уберите или закомментируйте:

```env
# VITE_ONLINE_TRANSPORT=ws
# VITE_WS_URL=...
```

Без `VITE_ONLINE_TRANSPORT=ws` клиент использует Supabase Realtime.
