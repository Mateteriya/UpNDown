# Техдиру: игровой WebSocket Up&Down

От владельца: **этот файл** + **`updown-ws.env`** (секреты, лично).

Репозиторий: `https://github.com/Mateteriya/UpNDown` · ветка **`main`** · доступ Read (Collaborator или deploy key).

---

## Готово, когда

| URL | Ожидание |
|-----|----------|
| `https://game.up2down.online/api/health` | JSON с ок |
| `https://game.up2down.online/api/ready` | **HTTP 200**, `"auth":"required"`, `"jwtConfigured":true`, `"ready":true` |
| клиентам | `wss://game.up2down.online` |

Вернуть владельцу:

```text
WebSocket:  wss://game.up2down.online
Health:     https://game.up2down.online/api/health
Ready:      https://game.up2down.online/api/ready
Restart:    sudo systemctl restart updown-ws
```

---

## Параметры

| | |
|--|--|
| Хост | `game.up2down.online` |
| Node | `127.0.0.1:3001` |
| TLS | Caddy :443 → Node |
| Код | `/opt/updown` |
| Секреты | `/etc/updown/ws.env` |
| Данные | `/var/lib/updown/` |

---

## 0. DNS

**A-запись:** имя `game` у `up2down.online` → публичный IP этого VPS.  
Пришлите IP владельцу, если запись делает она.  
Проверка: `nslookup game.up2down.online` → ваш IP.  
Шаг 3 (Caddy/TLS) — после того, как DNS указывает сюда.

Шаги 1–2 можно сделать сразу; снаружи проверить — после DNS + Caddy.

---

## 1. Код и сборка

```bash
sudo mkdir -p /opt/updown /var/lib/updown /etc/updown
sudo useradd -r -s /bin/false updown 2>/dev/null || true
sudo chown updown:updown /var/lib/updown

sudo git clone https://github.com/Mateteriya/UpNDown.git /opt/updown
# если уже клонировано:
cd /opt/updown && sudo git fetch origin && sudo git checkout main && sudo git pull origin main

cd /opt/updown
# Node 22 LTS предпочтительно (18+ ок)
npm ci
npm run server:install
npm run server:build
```

Нужен файл `/opt/updown/server/dist/index.js`.

---

## 2. Секреты + systemd

```bash
sudo cp /путь/к/updown-ws.env /etc/updown/ws.env
sudo chmod 600 /etc/updown/ws.env
sudo chown root:updown /etc/updown/ws.env
```

В `ws.env` уже должно быть: `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `PUBLIC_WS_URL=wss://game.up2down.online`.

```bash
sudo cp /opt/updown/deploy/updown-ws.service /etc/systemd/system/updown-ws.service
sudo systemctl daemon-reload
sudo systemctl enable --now updown-ws
sudo systemctl status updown-ws --no-pager

curl -sS http://127.0.0.1:3001/api/health
curl -sS http://127.0.0.1:3001/api/ready
```

Ready: HTTP 200, `"jwtConfigured":true`.  
При сбое: `journalctl -u updown-ws -n 80 --no-pager`.

```bash
sudo systemctl restart updown-ws
journalctl -u updown-ws -f
```

---

## 3. Caddy

```caddy
game.up2down.online {
	encode gzip
	reverse_proxy 127.0.0.1:3001
}
```

```bash
sudo systemctl reload caddy

curl -sS https://game.up2down.online/api/health
curl -sS https://game.up2down.online/api/ready
```

---

## 4. Обновление кода позже

```bash
cd /opt/updown
sudo git pull origin main
npm ci
npm run server:install
npm run server:build
sudo systemctl restart updown-ws
curl -sS http://127.0.0.1:3001/api/ready
```
