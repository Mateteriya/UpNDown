# Окно «Игра в сети» (Tauri, Windows)

Установщик упаковывает: **окно с панелью хоста**, **встроенный сервер**, **страницу игры для QR** (`/play/`). Пользователю Node.js не нужен.

---

## Сборка установщика

**На машине сборки** (не у конечного пользователя):

| Компонент | Ссылка |
|-----------|--------|
| Node.js 18+ | https://nodejs.org |
| Rust | https://rustup.rs |
| VS Build Tools (C++) | https://visualstudio.microsoft.com/visual-cpp-build-tools/ |

```powershell
cd D:\Projects\UpNDown
npm install
npm run host:installer:prep
npm run host:desktop:build
```

Результат: `host-desktop\src-tauri\target\release\bundle\nsis\` — файл `*-setup.exe`.

Полная инструкция для пользователей установщика: [HOST-INSTALLER.md](./HOST-INSTALLER.md).

---

## Разработка окна (без NSIS)

```powershell
npm run build:host-game
npm run host:installer:prep
npm run host:desktop
```

Если есть `host-desktop/bundle/`, сервер стартует из бандла (как в релизе). Без bundle — fallback на `npm run server:dev` (нужен Node).

---

## Браузер вместо .exe

```powershell
npm run host:app
```

См. [HOST-UTILITY.md](./HOST-UTILITY.md).

---

## Версия панели

Проверка: `powershell -File scripts/verify-host-panel.ps1`  
Ожидается `host-panel-2026-06-05` и текст «Игра в сети».
