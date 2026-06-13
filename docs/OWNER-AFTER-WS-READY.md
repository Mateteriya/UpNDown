# Когда техдиректор поднял WebSocket: ваши шаги (альфа, не прод)

**Только для владельца продукта.**  
Техдиректор выполнил [TECH-DIRECTOR-ONLINE-SERVER.md](./TECH-DIRECTOR-ONLINE-SERVER.md) на ветке **`feat/lan-server-v2`** и передал **`wss://…`**.

Это **этап B** из [LAN-SERVER-V2-WORKFLOW.md](./LAN-SERVER-V2-WORKFLOW.md): интернет-тест нового сервера.  
**Vercel Production (`main`) не трогаем** — там по-прежнему Supabase.

LAN по Wi‑Fi на вашем ПК — **этап A**, без техдиректора: `npm run host:app` или `server:dev` + `dev:host`.

---

## 1. Что вы должны получить от техдиректора

| Данные | Пример | Зачем |
|--------|--------|--------|
| **URL WebSocket** | `wss://game.up2down.online` | `VITE_WS_URL` |
| **Health URL** | `https://game.up2down.online/api/version` | Проверка, что сервер жив |
| Ветка на VPS | `feat/lan-server-v2` | Совпадение с вашим фронтом |
| (Опционально) рестарт | `systemctl restart updown-ws` | При сбое |

**Проверьте до подключения фронта:**

```powershell
curl https://game.up2down.online/api/version
```

Ожидается JSON с `"hostPanel": true`. Ошибка TLS / пустой ответ — к техдиректору, **не** включать WS на проде.

---

## 2. Подключение фронта (только ветка v2)

### 2.1. Локально (рекомендуется для первого теста)

```powershell
git checkout feat/lan-server-v2
```

`.env.local`:

```env
VITE_ONLINE_TRANSPORT=ws
VITE_WS_URL=wss://game.up2down.online
```

```powershell
npm run dev:host
```

Телефон в **другой сети** (мобильный интернет): откройте `http://ВАШ_ПК_IP:5173` только если порт доступен снаружи — **проще** использовать Vercel Preview (ниже) или туннель. Для чистого интернет-теста удобнее Preview.

Для отладки против **локального** сервера (этап A):

```env
VITE_ONLINE_TRANSPORT=ws
VITE_WS_URL=ws://192.168.1.5:3001
```

После правки `.env.local` — перезапуск `npm run dev:host`.

### 2.2. Vercel Preview (опционально, не Production)

Если нужен HTTPS-URL фронта без локального Vite:

1. Убедитесь, что деплоится ветка **`feat/lan-server-v2`** (не `main`).
2. В Vercel → Environment Variables → scope **Preview** (не Production):

   | Переменная | Значение |
   |------------|----------|
   | `VITE_ONLINE_TRANSPORT` | `ws` |
   | `VITE_WS_URL` | `wss://game.up2down.online` |

3. Redeploy **Preview** этой ветки.

`VITE_WS_PROTOCOL` отдельно **не нужен** — на ветке v2 весь WS-транспорт server-authoritative.

Supabase (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) оставьте — вход и профили.

### 2.3. Что НЕ делать сейчас

| ❌ | ✅ |
|----|-----|
| `VITE_ONLINE_TRANSPORT=ws` на **Production** Vercel | Только Preview или локальный dev |
| Ждать v2 от Preview с `main` | Checkout / deploy `feat/lan-server-v2` |
| Путать с LAN `host:app` | LAN — ваш ПК; VPS — интернет-альфа |

---

## 3. Что не смешивать

| Режим | Как | Сейчас |
|-------|-----|--------|
| **Прод (`main`)** | Supabase-онлайн | Не меняем |
| **LAN (ваш ПК)** | `host:app`, `ws://IP:3001` | Этап A |
| **VPS альфа** | `wss://` + фронт v2 | Этот документ |
| **Откат** | Убрать `VITE_ONLINE_TRANSPORT` | Только на Preview / `.env.local` |

---

## 4. Сценарий проверки (обязательный)

После подключения фронта v2 к `wss://…`.

### 4.1. Два устройства из **разных сетей**

1. **A:** Preview URL (или dev) → Онлайн → **Создать комнату**.
2. **B:** другая сеть (мобильный интернет) → **Присоединиться** по коду.
3. Оба → **Войти в игру** → минимум одна полная раздача.

### 4.2. Зал столов

При создании — «Показать в зале столов». Третье устройство: Зал столов → вход.

### 4.3. QR / `/play/` на VPS

На облачном VPS обычно **нет** панели `/host`. Гости входят **по коду** в приложении. QR с IP — только для LAN на вашем ПК.

---

## 5. Ожидаемое поведение и ограничения

| Работает в v2 | Пока слабее / отложено |
|---------------|-------------------------|
| Создать / войти по коду | Комнаты пропадают при рестарте VPS |
| 3–4 игрока, ходы, заказы, взятки | Полный `finish_game` / рейтинг — Supabase на клиенте |
| Пауза, смена хоста, absent host (WS) | Чат комнаты — Supabase |
| Серверный ИИ на пустых слотах | Battle-tested прод — нет |
| Зал столов, банковый режим | |
| Вход без Google в `ws` | |

Если рейтинг после партии не обновился — зафиксировать баг ([APP-WORKPLAN-WS-IAP-CC.md](./APP-WORKPLAN-WS-IAP-CC.md)).

---

## 6. Откат (если альфа сломалась)

**Preview / локально:** уберите `VITE_ONLINE_TRANSPORT` и `VITE_WS_URL`, redeploy / перезапуск dev.

**Production на `main`:** если вы **не** включали WS там — ничего делать не нужно.

LAN на ПК не зависит от VPS.

---

## 7. Чеклист владельца

- [ ] Этап A (LAN) пройден на `feat/lan-server-v2`
- [ ] Получен `wss://…`, ветка на VPS = `feat/lan-server-v2`
- [ ] `curl …/api/version` → JSON
- [ ] Фронт: checkout `feat/lan-server-v2` + `VITE_ONLINE_TRANSPORT=ws` + `VITE_WS_URL`
- [ ] **Не** включали WS на Vercel Production
- [ ] Партия с двух устройств из **разных сетей**
- [ ] Баги записаны
- [ ] Команда знает: рестарт VPS = пустые комнаты

---

## 8. После успешной альфы — дальше

1. Стабилизация: reconnect F5, имена, банк.
2. Рейтинг после WS-партии (один вызов Supabase в конце).
3. Merge `feat/lan-server-v2` → `staging` → `main`.
4. Решение о **Production** env на Vercel — отдельно, после merge.

Подробный порядок: [LAN-SERVER-V2-WORKFLOW.md](./LAN-SERVER-V2-WORKFLOW.md).

---

## 9. Шпаргалка LAN (ваш ПК)

```powershell
cd D:\Projects\UpNDown
git checkout feat/lan-server-v2
npm run host:app
```

Облачная альфа — через `wss://` техдиректора + фронт v2 (локально или Preview).

---

## 10. Кому писать при проблемах

| Симптом | Кому |
|---------|------|
| `wss://` не коннектится, 502, сертификат | Техдиректор |
| Лобби есть, ходы/банк/синхрон | Разработка / репо |
| Вход Google, профиль | Supabase / фронт |
| Откат Preview | Вы (env) |
