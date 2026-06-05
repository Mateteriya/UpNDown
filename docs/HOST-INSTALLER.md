# Установщик «Up&Down — игра в сети» (Windows)

Один ярлык на ПК: **создать комнату**, QR, код, «Поделиться». Игроки в **той же Wi‑Fi** открывают ссылку в браузере телефона.

**Не нужно у пользователя:** Node.js, терминал, npm, VPN, ngrok, аккаунт в игре.

**Сборка и публикация на сайте (Rust, NSIS):** [HOST-LAN-PUBLISH.md](./HOST-LAN-PUBLISH.md) — вам лично это нужно только когда будете выкладывать `.exe` для других.

---

## Для игрока (после установки)

| Нужно | Зачем |
|--------|--------|
| **Windows 10/11** | Программа под Windows |
| **Wi‑Fi** | ПК и телефоны в одной сети |
| **Разрешить в брандмауэре** | При первом запуске — доступ для «Up&Down — игра в сети» |

**На телефонах:** тот же Wi‑Fi + браузер (QR или ссылка из «Поделиться»).

---

## Сборка установщика (разработчик / релиз)

Один раз на машине сборки:

1. [Node.js 18+](https://nodejs.org) — `npm install` в корне репозитория  
2. [Rust](https://rustup.rs/)  
3. [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) — workload «Desktop development with C++»

Команды:

```powershell
cd D:\Projects\UpNDown
npm run host:installer:prep
npm run host:desktop:build
```

Готовый установщик NSIS:

`host-desktop\src-tauri\target\release\bundle\nsis\`

Файл вида `Up&Down — игра в сети_1.0.0_x64-setup.exe` — отдать пользователям или выложить на сайт.

### Что делает `host:installer:prep`

- Собирает игру для гостей → `dist-host/`
- Собирает сервер в `host-desktop/bundle/server.cjs` (без туннелей/UPnP)
- Скачивает portable `node.exe` (только для упаковки, пользователю Node не ставить)
- Копирует `dist-host` и `server/public` в `host-desktop/bundle/`

### Проверка без полной сборки Tauri

```powershell
npm run host:installer:prep
# вручную из bundle (как в установщике):
cd host-desktop\bundle
$env:GAME_DIST="$PWD\dist-host"
$env:UPDOWN_HOST_PUBLIC="$PWD\public"
.\node\node.exe .\server.cjs
# браузер: http://localhost:3001/host
```

---

## Режим разработки (браузер, без .exe)

```powershell
npm run host:app
```

Нужен Node.js на ПК. См. [HOST-UTILITY.md](./HOST-UTILITY.md).

---

## Облачный онлайн (не эта утилита)

Игра через интернет с VPS (`wss://`) — отдельный трек техдиректора. LAN-установщик **только одна Wi‑Fi**.
