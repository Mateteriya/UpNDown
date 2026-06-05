# Инструкция для технического директора: игровой WebSocket-сервер Up&Down

**Только для техдиректора.** Деплой облачного онлайна (игра через интернет).  
Не путать с **LAN-утилитой** на домашнем ПК — она отдельная, для одной Wi‑Fi; на VPS её не ставим.

Владелец продукта после вашей работы: [OWNER-AFTER-WS-READY.md](./OWNER-AFTER-WS-READY.md).

---

## 1. Цель и границы ответственности

### Что вы поднимаете

Один процесс **Node.js** в папке `server/` репозитория Up&Down:

- HTTP (health, опционально API);
- **WebSocket** на том же порту (upgrade);
- комнаты в **памяти** (без PostgreSQL на первом этапе);
- авторитетное состояние партии (ходы, заказы, правила).

### Что вы **не** поднимаете на этом VPS

| Не ваш сервис | Где живёт |
|---------------|-----------|
| React/PWA фронт | Vercel / хостинг владельца |
| Supabase (auth, профили, рейтинг) | Облако Supabase |
| LAN-панель `/host`, QR для домашней Wi‑Fi | ПК пользователей (`host:app`) |
| ngrok / cloudflared / туннели | Убраны из прод-UX; не нужны |

### Что отдать владельцу продукта в конце

1. **`wss://…`** — URL WebSocket для браузеров (обязательно HTTPS/WSS в проде).
2. Подтверждение health: `GET https://тот-же-хост/api/version` → JSON, `"hostPanel": true`.
3. (Опционально) поддомен, порт, политика рестартов, контакт при падении.

---

## 2. Архитектура

```
[Браузер / PWA]  ──HTTPS──►  [Фронт: Vercel и т.д.]
       │
       │  WebSocket wss://game.домен  (тот же хост или поддомен)
       ▼
[VPS техдиректора]
  reverse proxy (Caddy/nginx) :443
       │
       ▼
  Node server/ :3001  (HTTP + WS)
       │
       └── комнаты в RAM, протокол JSON
```

**Supabase** остаётся для входа и профилей; **синхронизация стола во время партии** — только через ваш WS.

---

## 3. Требования к VPS

| Параметр | Минимум |
|----------|---------|
| ОС | Linux (Ubuntu 22.04 LTS рекомендуется) |
| RAM | 512 MB (1 GB комфортнее) |
| CPU | 1 vCPU |
| Диск | 2 GB |
| Сеть | Публичный IP или проброс 443 |
| Софт | Node.js **18+** LTS **или** Docker |

**БД не нужна** для MVP: перезапуск процесса сбрасывает активные комнаты (для Альфы это ожидаемо).

---

## 4. Исходный код: что клонировать

Сервер **импортирует игровую логику** из `src/game/` в корне репо. Недостаточно скопировать только папку `server/`.

### Вариант A — полный репозиторий (рекомендуется)

```bash
git clone <URL-репозитория-UpNDown> /opt/updown
cd /opt/updown
```

Владелец выдаёт read-доступ к GitHub/GitLab или архив.

### Вариант B — архив от владельца

Распаковать в `/opt/updown` так, чтобы были:

- `server/`
- `src/game/` (и зависимости, которые тянет `server/src/hostAutomation.ts`)

### Установка зависимостей

```bash
cd /opt/updown
npm install
npm run server:install
```

Проверка локально на VPS (до proxy):

```bash
cd /opt/updown
PORT=3001 npm run start --prefix server
curl -s http://127.0.0.1:3001/api/version
```

Ожидается JSON с `"hostPanel": true`, полем `build` (например `host-panel-2026-06-06-installer`).

Остановка теста: `Ctrl+C`.

---

## 5. Переменные окружения сервера

| Переменная | По умолчанию | Прод на VPS |
|------------|--------------|-------------|
| `PORT` | `3001` | `3001` (за proxy) |
| `HOST` | `0.0.0.0` | `0.0.0.0` |
| `NODE_ENV` | — | `production` |
| `PUBLIC_WS_URL` | пусто | **`wss://game.ваш-домен`** (без пути) |
| `PUBLIC_GAME_URL` | пусто | URL фронта, если нужны ссылки в API (опционально) |
| `WS_BACKUP_PORTS` | `3002,3003` | можно оставить или отключить, если не слушаете запасные |
| `GAME_DIST` | — | **не задавать** на облачном VPS (страница игры на Vercel) |
| `UPDOWN_HOST_PUBLIC` | — | **не нужен** (панель `/host` для LAN) |

Пример для systemd:

```ini
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=HOST=0.0.0.0
Environment=PUBLIC_WS_URL=wss://game.example.com
```

---

## 6. Запуск процесса (все варианты)

Команда старта из корня репо:

```bash
npm run start --prefix server
```

Внутри используется `tsx src/index.ts` — в `server/` должны быть установлены зависимости (`npm run server:install`).

---

### Вариант 1 — systemd (рекомендуется)

Файл `/etc/systemd/system/updown-ws.service`:

```ini
[Unit]
Description=Up&Down WebSocket game server
After=network.target

[Service]
Type=simple
User=updown
Group=updown
WorkingDirectory=/opt/updown
ExecStart=/usr/bin/npm run start --prefix server
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=HOST=0.0.0.0
Environment=PUBLIC_WS_URL=wss://game.example.com

[Install]
WantedBy=multi-user.target
```

```bash
sudo useradd -r -s /bin/false updown || true
sudo chown -R updown:updown /opt/updown
sudo systemctl daemon-reload
sudo systemctl enable updown-ws
sudo systemctl start updown-ws
sudo systemctl status updown-ws
journalctl -u updown-ws -f
```

---

### Вариант 2 — pm2

```bash
cd /opt/updown
npm install -g pm2
PORT=3001 PUBLIC_WS_URL=wss://game.example.com \
  pm2 start "npm run start --prefix server" --name updown-ws
pm2 save
pm2 startup
```

---

### Вариант 3 — Docker

В репозитории **пока нет** готового `Dockerfile` — ниже рабочий шаблон. Сохраните как `/opt/updown/Dockerfile.ws`:

```dockerfile
FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package-lock.json ./server/
RUN npm ci && npm run server:install
COPY server ./server
COPY src/game ./src/game
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
EXPOSE 3001
CMD ["npm", "run", "start", "--prefix", "server"]
```

Сборка и запуск:

```bash
cd /opt/updown
docker build -f Dockerfile.ws -t updown-ws .
docker run -d --name updown-ws --restart unless-stopped \
  -p 127.0.0.1:3001:3001 \
  -e PUBLIC_WS_URL=wss://game.example.com \
  updown-ws
```

Порт **3001** снаружи не публикуйте, если перед ним стоит reverse proxy только на 443.

---

### Вариант 4 — ручной запуск (отладка)

```bash
cd /opt/updown
PORT=3001 PUBLIC_WS_URL=wss://game.example.com npm run start --prefix server
```

Только для диагностики; для прода — systemd/pm2/Docker.

---

### Вариант 5 — тест без TLS (не прод)

`ws://IP:3001` — для проверки с машины техдиректора.  
Браузеры на **HTTPS-фронте** (Vercel) **не подключатся** к `ws://` (mixed content). Для владельца продукта нужен именно **`wss://`**.

---

## 7. Reverse proxy и TLS (обязательно для прода)

Клиент на Vercel открывается по **HTTPS** → сокет должен быть **`wss://`**.

Снаружи открыт **только 443** (и 80 для редиректа ACME). Node слушает **127.0.0.1:3001**.

---

### Вариант A — Caddy (проще всего)

`/etc/caddy/Caddyfile`:

```
game.example.com {
    reverse_proxy 127.0.0.1:3001
}
```

```bash
sudo systemctl reload caddy
```

Проверка:

```bash
curl -s https://game.example.com/api/version
```

WebSocket: `wss://game.example.com` (корень, без `/ws`).

---

### Вариант B — nginx + Let's Encrypt

```nginx
server {
    listen 443 ssl http2;
    server_name game.example.com;

    ssl_certificate     /etc/letsencrypt/live/game.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/game.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

```bash
sudo certbot --nginx -d game.example.com
sudo nginx -t && sudo systemctl reload nginx
```

---

### Вариант C — уже есть ingress / балансировщик

Пробросить на backend `http://<внутренний-ip>:3001` с поддержкой **WebSocket Upgrade**.  
Выдать владельцу публичный **`wss://`** URL, который видит браузер.

---

## 8. Файрвол

При proxy только на 443:

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Порт **3001** с интернета **закрыт** (доступен только localhost).

Если временно без proxy (только тест):

```bash
sudo ufw allow 3001/tcp
```

---

## 9. DNS

Владелец или вы создаёте запись:

| Тип | Имя | Значение |
|-----|-----|----------|
| A | `game` | IP VPS |
| или CNAME | `game` | хост провайдера |

Итог: `game.домен-проекта` → ваш VPS → Caddy/nginx → Node:3001.

---

## 10. Healthcheck и мониторинг

### Проверки после деплоя

```bash
# JSON-сборка
curl -s https://game.example.com/api/version | jq .

# WebSocket (если есть wscat)
npm install -g wscat
wscat -c wss://game.example.com
# ожидается сообщение hello: {"type":"hello","ok":true}
```

### Что логировать

- рестарты systemd/Docker;
- `EADDRINUSE` на 3001;
- рост RAM (утечки комнат — редко, но перезапуск раз в сутки допустим на Альфе).

### Алерт

Падение процесса → автоматический `Restart=on-failure` + уведомление вам (Telegram/email/uptime-робот на `/api/version`).

---

## 11. Протокол WebSocket (кратко)

Полные типы: `server/src/protocol.ts`, клиент: `src/lib/onlineGameWs.ts`.

| Клиент → сервер | Назначение |
|-----------------|------------|
| `create_room` | Создать комнату, код |
| `join_room` | Войти по коду |
| `leave_room` | Выйти |
| `subscribe_room` | Подписка на обновления |
| `update_state` | Ход / заказ / фаза |
| `list_public_waiting` | Зал столов (публичные комнаты) |
| `peek_room` | Подсказка по коду |

| Сервер → клиент | Назначение |
|-----------------|------------|
| `hello` | Подключение OK |
| `room_snapshot` | Состояние комнаты |
| `create_room_result` / `join_room_result` | Ответ на запрос |
| `error` | Ошибка |

Формат: JSON, опционально `requestId` для RPC.

---

## 12. Обновление сервера

```bash
cd /opt/updown
git pull
npm install
npm run server:install
sudo systemctl restart updown-ws
curl -s https://game.example.com/api/version
```

**Активные комнаты пропадут** при рестарте — предупредите владельца, если деплой в прайм-тайм.

---

## 13. Ограничения MVP (знать заранее)

- Комнаты **только в памяти**;
- нет полного parity с Supabase-RPC (absent host, пауза, смена хоста — урезано);
- **рейтинг / `finish_game`** в конце партии может ещё идти через Supabase на клиенте — согласовать с владельцем;
- панель `/host` на VPS **не обязательна** для облачного сценария.

---

## 14. Чеклист техдиректора

- [ ] VPS Linux, Node 18+ или Docker
- [ ] Клонирован полный репозиторий (`server/` + `src/game/`)
- [ ] `npm install` + `npm run server:install`
- [ ] Процесс под systemd / pm2 / Docker с `Restart`
- [ ] `PUBLIC_WS_URL=wss://…` в окружении
- [ ] Reverse proxy + TLS на 443
- [ ] Файрвол: снаружи 443, 3001 только localhost
- [ ] `curl https://…/api/version` → OK
- [ ] `wscat -c wss://…` → `hello`
- [ ] Передан владельцу финальный **`wss://` URL** (см. шаблон ниже)

---

## 15. Шаблон сообщения владельцу продукта

```
Готово.

WebSocket (для VITE_WS_URL):
  wss://game.example.com

Health:
  https://game.example.com/api/version

Сборка сервера (поле build в JSON): host-panel-2026-06-06-installer

Деплой: systemd updown-ws на Ubuntu 22.04, Caddy TLS.
Рестарт: sudo systemctl restart updown-ws (активные комнаты сбросятся).

Дальше — твои шаги: OWNER-AFTER-WS-READY.md
```

---

## 16. Связанные документы

| Документ | Зачем |
|----------|--------|
| [OWNER-AFTER-WS-READY.md](./OWNER-AFTER-WS-READY.md) | Шаги владельца после вашего URL |
| [server/README.md](../server/README.md) | Локальный запуск, порты |
| [ONLINE-SERVER-INSTRUCTIONS.md](./ONLINE-SERVER-INSTRUCTIONS.md) | Общая архитектура (устаревшие чеклисты «WS не реализован» игнорировать) |
| [HOST-LAN-PUBLISH.md](./HOST-LAN-PUBLISH.md) | LAN на домашнем ПК — **не этот деплой** |
