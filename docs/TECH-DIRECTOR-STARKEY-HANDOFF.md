# Handoff для VPS: starkey.agneko.com/updown (порт 3005)

Краткий пакет команд под договорённость с техдиректором.  
Полная общая инструкция: [TECH-DIRECTOR-ONLINE-SERVER.md](./TECH-DIRECTOR-ONLINE-SERVER.md).

| Параметр | Значение |
|----------|----------|
| Домен | `starkey.agneko.com` |
| Путь | `/updown` (Caddy `handle_path` снимает префикс) |
| Node listen | `127.0.0.1:3005` |
| Публичный WS | `wss://starkey.agneko.com/updown` |
| Health | `https://starkey.agneko.com/updown/api/health` |
| Ветка | `staging` |
| Репо | `https://github.com/Mateteriya/UpNDown` |

TLS: Caddy сам выпустит сертификат на `starkey.agneko.com`, если DNS A/AAAA уже указывает на VPS и открыты 80/443.

---

## 1. Доступ к репо (владелец продукта)

Репозиторий, скорее всего, **private**. Пароль от GitHub **не** передавать.

Один из вариантов:

1. **Collaborator (предпочтительно):** GitHub → репо → Settings → Collaborators → Invite (role **Read**).
2. **Deploy key:** на VPS `ssh-keygen -t ed25519 -f updown-deploy -N ""`, публичный ключ → Settings → Deploy keys (read-only), клон по SSH.
3. **Fine-grained PAT** (только Contents: Read) — передать лично, не в общий чат; клон по HTTPS с токеном.

После доступа техдиректор клонирует без «явок» владельца:

```bash
git clone https://github.com/Mateteriya/UpNDown.git /opt/updown
# или: git clone git@github.com:Mateteriya/UpNDown.git /opt/updown
cd /opt/updown
git checkout staging
```

---

## 2. Установка на VPS (готовые команды)

```bash
cd /opt/updown
git checkout staging
git pull origin staging

npm install
npm run server:install

sudo useradd -r -s /bin/false updown 2>/dev/null || true
sudo mkdir -p /var/lib/updown
sudo chown updown:updown /var/lib/updown
sudo chown -R updown:updown /opt/updown

sudo cp deploy/updown-ws.starkey.service /etc/systemd/system/updown-ws.service
sudo systemctl daemon-reload
sudo systemctl enable --now updown-ws

curl -s http://127.0.0.1:3005/api/health
curl -s http://127.0.0.1:3005/api/version
```

Ожидается `{"ok":true,...}` на health.

Рестарт: `sudo systemctl restart updown-ws`  
Логи: `journalctl -u updown-ws -f`

---

## 3. Caddy

Шаблон: `deploy/Caddyfile.path-example`.

В существующий блок `starkey.agneko.com` добавить:

```
handle_path /updown* {
	reverse_proxy 127.0.0.1:3005
}
```

```bash
sudo systemctl reload caddy
curl -s https://starkey.agneko.com/updown/api/health
curl -s https://starkey.agneko.com/updown/api/version
```

WebSocket клиент: `wss://starkey.agneko.com/updown` (путь `/updown`, без `/ws`).

---

## 4. Что вернуть владельцу продукта

```
WebSocket:  wss://starkey.agneko.com/updown
Health:     https://starkey.agneko.com/updown/api/health
Version:    https://starkey.agneko.com/updown/api/version
Restart:    sudo systemctl restart updown-ws
```

Владелец на Vercel (Preview/Staging, не Production main):

```
VITE_ONLINE_TRANSPORT=ws
VITE_WS_URL=wss://starkey.agneko.com/updown
```

Затем Redeploy staging.
