# LAN Server v2 — как работать (ветка, локально, VPS)

**Главный документ для владельца и разработки.**  
Прод (Vercel Production на `main`) — **в последнюю очередь**. Сейчас всё в ветке **`feat/lan-server-v2`**.

---

## 1. Схема веток (коротко)

```
main / staging          →  Supabase-онлайн, стабильный прод. НЕ трогаем.
feat/lan-server-v2      →  новый WS-сервер v2, локальные тесты, VPS техдиректора.
                          Когда всё ок → merge в staging → main.
```

| Где | Что запущено | Когда |
|-----|--------------|--------|
| `main` | Фронт на Vercel **Production**, онлайн через **Supabase** | Сейчас и до merge |
| `feat/lan-server-v2` | Новый код: server-authoritative v2 | **Вся разработка и приёмка** |
| Локальный ПК | `server:dev` + `dev:host` или `host:app` | **Первый этап** |
| VPS техдиректора | Тот же `server/` с ветки `feat/lan-server-v2` | **Второй этап** (интернет, не прод) |
| Vercel Preview | Только деплой **с ветки** `feat/lan-server-v2` + env `ws` | Опционально, если нужен URL без локального Vite |

**Правильно понимаете:** ветка `feat/lan-server-v2` — **отдельная песочница**. Не подмешивать в прод и не ожидать, что обычный Preview с `main` подключится к новому серверу. Экспериментируете в этой ветке → подключаете VPS техдиректора → когда стабильно — **тогда** merge в `main`.

---

## 2. Этапы (порядок работ)

### Этап A — локально по Wi‑Fi (обязательно)

1. `git checkout feat/lan-server-v2`
2. Два терминала: `npm run server:dev` и `npm run dev:host` (или один `npm run host:app`)
3. `.env.local`:

   ```env
   VITE_ONLINE_TRANSPORT=ws
   VITE_WS_URL=ws://ВАШ_IP:3001
   ```

4. 3–4 устройства в одной Wi‑Fi: создать комнату, войти по коду, полная раздача.

Подробно: [ЛОКАЛЬНЫЙ-ЗАПУСК-WIFI.md](./ЛОКАЛЬНЫЙ-ЗАПУСК-WIFI.md), [server/README.md](../server/README.md).

### Этап B — VPS техдиректора (альфа, не прод)

1. Техдиректор клонирует репо и **`git checkout feat/lan-server-v2`**
2. Поднимает Node + `wss://` по [TECH-DIRECTOR-ONLINE-SERVER.md](./TECH-DIRECTOR-ONLINE-SERVER.md)
3. Передаёт вам `wss://…`
4. Вы подключаете фронт **только из этой ветки**:
   - **Вариант 1 (проще):** `.env.local` → `VITE_WS_URL=wss://…`, `npm run dev:host`, тест с телефона по `http://IP:5173`
   - **Вариант 2:** Vercel → Environment Variables для **Preview** (не Production!) на ветке `feat/lan-server-v2` → redeploy Preview

Шаги владельца после URL: [OWNER-AFTER-WS-READY.md](./OWNER-AFTER-WS-READY.md).

### Этап C — merge в main (позже)

Только когда:

- [ ] LAN на 4 устройствах без критичных багов
- [ ] Интернет-тест VPS + фронт v2 (два устройства, разные сети)
- [ ] Документы и команда согласны

Тогда: `feat/lan-server-v2` → `staging` → `main`, env на Vercel Production — **отдельное решение**, не автоматически.

---

## 3. Что такое протокол v2

| Было (v1 WS) | Стало (v2) |
|--------------|------------|
| Клиент шлёт весь стол `update_state` | Команды: `start_game`, `place_bid`, `play_card` |
| Клиент сам `completeTrick` / `startNextDeal` | Таймеры на сервере (2 с / 4.5 с) |
| Merge и «лечение» рассинхрона на клиенте | Push `game_state@revision` |

Спецификация: [LAN-SERVER-V2-RFC.md](./LAN-SERVER-V2-RFC.md).

При `VITE_ONLINE_TRANSPORT=ws` клиент на ветке `feat/lan-server-v2` **всегда** использует server-authoritative путь (`OnlineGameContextV2`). Отдельный `VITE_WS_PROTOCOL` на Vercel не обязателен — для LAN-сборки QR он зашит в `vite.host.config.ts`.

Новые комнаты на сервере: **`protocol_version: 2`** по умолчанию (`protocolVersion: 1` — только откат).

---

## 4. Что НЕ смешивать

| ❌ Не делать | ✅ Делать |
|-------------|----------|
| `VITE_ONLINE_TRANSPORT=ws` на Vercel **Production** (`main`) до merge | Тесты только в ветке `feat/lan-server-v2` |
| Ждать, что Preview с `main` увидит v2-сервер | Preview / локальный dev с checkout на `feat/lan-server-v2` |
| Деплоить на VPS код с `main` без v2 | VPS: `git checkout feat/lan-server-v2` |
| Путать LAN (`host:app`) и облачный VPS | LAN — ваш ПК; VPS — интернет-альфа |

---

## 5. Известные ограничения (альфа)

| Работает в v2 | Пока слабее / отложено |
|---------------|-------------------------|
| Лобби, код, 3–4 игрока | Комнаты в RAM — рестарт сервера = потеря столов |
| Ходы, заказы, взятки, раздачи | Полный `finish_game` / рейтинг — через Supabase на клиенте |
| Пауза, возврат слота, смена хоста (WS) | Чат комнаты — Supabase, не WS |
| Серверный ИИ на пустых слотах | Несколько инстансов сервера (шардинг) — нет |
| Зал столов (`room_kind: public`) | Battle-tested прод-нагрузка — нет |

---

## 6. Быстрые команды

```powershell
cd D:\Projects\UpNDown
git checkout feat/lan-server-v2

# LAN (два терминала)
npm run server:dev
npm run dev:host

# Или всё в одном (сервер + сборка /play/ + браузер)
npm run host:app
```

Тесты сервера: `npm test --prefix server` (vitest, `GameSession`).

---

## 7. Связанные документы

| Документ | Кому |
|----------|------|
| [TECH-DIRECTOR-ONLINE-SERVER.md](./TECH-DIRECTOR-ONLINE-SERVER.md) | Техдиректор (VPS, ветка `feat/lan-server-v2`) |
| [OWNER-AFTER-WS-READY.md](./OWNER-AFTER-WS-READY.md) | Владелец после `wss://` (альфа, не прод) |
| [LAN-SERVER-V2-RFC.md](./LAN-SERVER-V2-RFC.md) | Протокол v2 |
| [server/README.md](../server/README.md) | Локальный запуск сервера |
| [ONLINE-SERVER-INSTRUCTIONS.md](./ONLINE-SERVER-INSTRUCTIONS.md) | Историческая архитектура (чеклисты «сервер не реализован» устарели) |
