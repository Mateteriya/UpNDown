# Production WebSocket (host-agnostic)

Один контракт: любой Linux (свой VPS, облако, машина друга).  
**Не слать пакет хосту, пока `/api/ready` не зелёный с `auth=required` и `jwtConfigured=true`.**

Домашний LAN (`npm run server:dev`, панель `/host`) — другой профиль, его этот документ не заменяет.

Полный ориентир продукта: [PLAN-DALEE.md](./PLAN-DALEE.md). Overlay-пример домена: [deploy/hosts/starkey.env.example](../deploy/hosts/starkey.env.example).

---

## Что это за сервер

```
[PWA] --wss JWT--> [Caddy :443] --> [127.0.0.1:PORT Node]
                                      RAM комнат + rooms.json
                                      конец партии → Supabase finish_game_from_server
```

- Стол во время партии — только этот процесс.
- Supabase: логин, профили, архив матчей, Elo.
- Клиент **не** вызывает `finish_game` на WS-пути.

## Требования к хосту

| | |
|--|--|
| ОС | Linux, systemd (или Docker) |
| Node | **22 LTS** (18+ допустим для LAN/`tsx`) |
| Снаружи | только 80/443 |
| Node listen | `127.0.0.1` (не публиковать игровой порт) |

БД на этой машине **не нужна**. Off-box бэкап диска — зона хоста (rsync/снапшот), не код игры.

## Env-контракт

Секреты **только** в `/etc/updown/ws.env` (`chmod 600`). Юнит в git секретов не содержит.

Шаблон: [deploy/updown-ws.env.example](../deploy/updown-ws.env.example).

| Переменная | Прод |
|------------|------|
| `NODE_ENV` / `UPDOWN_MODE` | `production` / `prod` |
| `PORT` / `HOST` | например `3001` / `127.0.0.1` |
| `PUBLIC_WS_URL` | `wss://…` как видит браузер |
| `WS_AUTH` | `required` |
| `WS_TRUST_PROXY` | `1` за Caddy |
| `SUPABASE_JWT_SECRET` | **Legacy JWT Secret** (HS256). Не anon key, не JWKS/ES256 |
| `SUPABASE_URL` | `https://….supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | только для `finish_game_from_server` |
| `ROOM_PERSIST_PATH` | `/var/lib/updown/rooms.json` |
| `ROOM_BACKUP_KEEP` | `144` ≈ 24 ч при шаге 10 мин (копии **на том же диске**) |

Без `SUPABASE_JWT_SECRET` при `WS_AUTH=required` процесс **не стартует**.

SQL один раз на проект Supabase: [supabase/migrations/20260822120000_finish_game_from_server.sql](../supabase/migrations/20260822120000_finish_game_from_server.sql).

## Установка (systemd)

```bash
sudo useradd -r -s /bin/false updown 2>/dev/null || true
sudo mkdir -p /opt/updown /var/lib/updown /etc/updown
# клон репозитория в /opt/updown, нужная ветка
cd /opt/updown
npm ci
npm run server:install
npm run server:build

sudo cp deploy/updown-ws.env.example /etc/updown/ws.env
sudo chmod 600 /etc/updown/ws.env
sudo chown root:updown /etc/updown/ws.env
# вписать секреты в /etc/updown/ws.env

sudo cp deploy/updown-ws.service /etc/systemd/system/updown-ws.service
# или deploy/updown-ws.starkey.service — тот же бинарь, другой PORT/URL
sudo chown -R updown:updown /var/lib/updown
sudo systemctl daemon-reload
sudo systemctl enable --now updown-ws

curl -sS http://127.0.0.1:3001/api/health
curl -sS http://127.0.0.1:3001/api/ready
```

`/api/health` — процесс жив. `/api/ready` — persist пишется, JWT на месте, при заданном service role — Supabase отвечает.

Caddy: [deploy/Caddyfile.example](../deploy/Caddyfile.example) или путь `/updown`: [deploy/Caddyfile.path-example](../deploy/Caddyfile.path-example). Снаружи не открывать `/api/info`.

## Docker

```bash
docker build -f Dockerfile.ws -t updown-ws .
docker run -d --name updown-ws --restart unless-stopped \
  -p 127.0.0.1:3001:3001 \
  --env-file /etc/updown/ws.env \
  -e HOST=0.0.0.0 \
  -e PUBLIC_WS_URL=wss://game.example.com \
  -v updown-ws-data:/var/lib/updown \
  updown-ws
```

## Restore снимка комнат

Копии: `/var/lib/updown/backups/rooms-*.json` (не DR, тот же диск).

```bash
sudo systemctl stop updown-ws
sudo cp /var/lib/updown/backups/rooms-STAMP.json /var/lib/updown/rooms.json
sudo chown updown:updown /var/lib/updown/rooms.json
sudo systemctl start updown-ws
```

## Обновление

```bash
cd /opt/updown
git pull
npm ci
npm run server:install
npm run server:build
sudo systemctl restart updown-ws
curl -sS http://127.0.0.1:PORT/api/ready
```

Клиенты сами reconnect. Партия в памяти поднимается из `rooms.json`, если снимок успели записать.

## Фронт (владелец продукта)

Vercel Preview/Production:

```
VITE_ONLINE_TRANSPORT=ws
VITE_WS_URL=wss://ваш-хост
```

Supabase anon/url на фронте остаются (логин). `SERVICE_ROLE` на фронт не попадает.

## LAN vs prod

| | LAN | Production |
|--|-----|------------|
| Команда | `npm run server:dev` | `node server/dist/index.js` |
| `WS_AUTH` | `optional` / `off` | `required` |
| `/host` | да | нет |
| Гости без JWT | да | нет |
| Руки соседа на сокете | да (доверенная Wi‑Fi) | нет |
