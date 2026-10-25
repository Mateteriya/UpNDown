# Инвентарь сервисов Up&Down

Живой список внешних сервисов и того, **что у вас на них заведено**.  
Секреты / пароли сюда **не** писать — только имена, URL, роль.

*Собрано по репозиторию и вашей настройке Auth/SMTP (2026-10). Уточняйте строки по факту панели.*

---

## 1. Домены

| Домен | Где DNS / хостинг | Назначение |
|-------|-------------------|------------|
| **up2down.online** | Vercel (Domains) | Мир: сайт игры / PWA |
| **up2down.ru** | SpaceWeb (NS / хостинг) | Зеркало РФ без VPN |
| **www.up2down.ru** | → канон `up2down.ru` (редирект в клиенте) | алиас |
| **game.up2down.online** | DNS A → VPS (план) | Только игровой WebSocket `wss://…` |
| Почта **support@up2down.ru** | SpaceWeb mailbox | Поддержка (письма Auth → mailto) |
| Отправитель **noreply@up2down.online** | Resend (домен verified) | SMTP писем Supabase Auth |

Регистратор домена `.ru` / `.online` — тот, где покупали (nic.ru / Reg.ru / …); NS могут быть у SpaceWeb или Vercel.

---

## 2. Хостинг сайтов

### Vercel
- **Что:** прод [up2down.online](https://up2down.online) (+ часто preview `*.vercel.app`).
- **Откуда деплой:** GitHub `Mateteriya/UpNDown` (ветка main / preview).
- **Env:** `VITE_SUPABASE_*`, при необходимости `VITE_WS_URL`, premium/donate flags — Settings → Environment Variables.
- **Не путать** с игровым WS: меню на Vercel, стол — отдельно (`game.…`).

### SpaceWeb (sweb.ru)
- **Что:** зеркало [up2down.ru](https://up2down.ru) — статика в `public_html`, SSL Let’s Encrypt.
- **Деплой:** вручную `npm run build` → заливка (см. `docs/RU-MIRROR-SPACEWEB.md`).
- **Почта:** ящик `support@up2down.ru` (физлицо / хостинг).
- Тариф «Старт» / пробный период — по панели.

### Timeweb Cloud (исторически / опционально)
- В доках фигурировал как вариант для `.ru` / VDS; для зеркала выбран **SpaceWeb**.  
- App Platform Timeweb — «можно не оплачивать» (`RU-MIRROR-SPACEWEB.md`).

---

## 3. Supabase (ядро Auth + данные)

| | |
|--|--|
| **Project ref** | `jrgnsqbwwhovonxyxown` |
| **API URL** | `https://jrgnsqbwwhovonxyxown.supabase.co` |
| **Auth callback (IdP)** | `…/auth/v1/callback` |
| **Роль** | Аккаунты, профили, рейтинг/история, Realtime (запасной онлайн), Edge Functions |

### Auth / Providers (по коду и докам)
| Провайдер | Тип | Статус у вас |
|-----------|-----|----------------|
| Email + password | built-in | ✅ + Confirm email, Custom SMTP |
| Google | built-in | ✅ (используется) |
| GitHub | built-in | в UI |
| Apple | built-in | кнопка есть → нужен кабинет Apple |
| Yandex | custom `yandex` | ✅ (доки + Edge `yandex-userinfo`) |
| VK ID · Mail.ru | прямой VK + Edge bridge | ✅ `vk-oauth-*` functions |
| LINE | custom `line` | кнопка → кабинет LINE |

### Edge Functions (деплой в проект)
- `vk-oauth-bridge`, `vk-oauth-authorize`, `vk-oauth-token`, `vk-oauth-userinfo`, `vk-oauth-exchange`
- `yandex-userinfo`
- `online-room-maintenance` (и др. по `supabase/functions/`)

### SMTP
- Provider: **Resend** → Host `smtp.resend.com`, From `noreply@up2down.online`
- Домен Resend: `up2down.online` **verified** (Vercel DNS / Forge)

### URL Configuration (типичный набор)
Site URL: `https://up2down.online`  
Redirect URLs: online / ru / localhost:5173 / `http://IP:3001/play/` (+ wildcards `192.168.*` если принялись) + `…/auth-callback.html`

---

## 4. Почта и транзакционные письма

| Сервис | Роль |
|--------|------|
| **Resend** | Custom SMTP для Supabase (confirm, reset, security mails) |
| **SpaceWeb Mail** | Ящик поддержки `support@up2down.ru` |
| Встроенная почта Supabase | **не использовать** для Яндекс/Mail.ru (спам) |

---

## 5. OAuth-кабинеты (внешние IdP)

| Кабинет | Redirect / важное |
|---------|-------------------|
| [Google Cloud Console](https://console.cloud.google.com/) | OAuth client → callback Supabase |
| [GitHub OAuth Apps](https://github.com/settings/developers) | callback Supabase |
| [Яндекс OAuth](https://oauth.yandex.ru/) | callback Supabase; хост кнопки — доступный из РФ |
| [VK ID](https://id.vk.com/) | Redirect = **Edge** `…/functions/v1/vk-oauth-bridge`; базовый домен `up2down.online` |
| Apple Developer | Services ID + Sign in with Apple (когда включите) |
| LINE Developers | LINE Login callback = Supabase (когда включите) |

---

## 6. Git и CI

| | |
|--|--|
| **GitHub** | `https://github.com/Mateteriya/UpNDown` |
| Связка | Vercel deploy from GitHub |
| Collaborator / deploy key | техдир WS (Read) — `TECH-DIRECTOR-WS-1PAGE.md` |

---

## 7. Игровой сервер (WebSocket)

| | |
|--|--|
| **Прод (план)** | `wss://game.up2down.online` на VPS друга (Starkey / техдир) |
| **Локально / вечеринка** | `npm run host:app` → `:3001` + `dist-host` `/play/` |
| Env | `deploy/updown-ws.env.example`, `docs/PRODUCTION-WS.md` |
| Auth стола | JWT Supabase (`WS_AUTH=required` на проде) |

---

## 8. Платежи / донаты (витрина)

| | |
|--|--|
| **CloudTips** | ссылка в env `VITE_DONATE_CLOUDTIPS` |
| **ЮMoney** | `VITE_DONATE_YOOMONEY` |
| Premium web | entitlement в игре (`#premium`); стор/IAP — позже |
| Google Play / App Store IAP | ещё не стартовали (Capacitor) |

---

## 9. Разработка / инструменты

| Инструмент | Зачем |
|------------|--------|
| **Cursor** | IDE / агент |
| **Node / npm** | сборка Vite, host, server |
| **Vite** | web + `vite.host.config` → `dist-host` |
| **Capacitor** | LAN-APK вечеринки; магазинный APK — бэклог |
| **Supabase CLI** | `npx supabase functions deploy …` |
| **Handbook** | `npm run handbook:dev` → localhost:5199 |

---

## 10. Что сознательно не прод (или отказ)

| | |
|--|--|
| Tauri как десктоп-игра | отказ |
| Свой Auth вместо Supabase | бэклог |
| Timeweb App Platform для `.ru` | ушли на SpaceWeb |
| MFA Supabase | не включаем до премиума/хвоста плана |

---

## 11. Быстрый чеклист «где что крутить»

1. **Сломался вход Google/Яндекс** → Supabase Redirect URLs + кабинет IdP.  
2. **Нет писем** → Resend logs + Supabase SMTP.  
3. **Зеркало РФ** → SpaceWeb `public_html` + DNS.  
4. **Мир-сайт** → Vercel deploy / Domains.  
5. **Онлайн-стол** → VPS + DNS `game.up2down.online`.  
6. **Вечеринка дома** → host `:3001` + allowlist LAN в Supabase.  
7. **Письмо в поддержку** → `support@up2down.ru`.

---

*Обновляйте этот файл при подключении нового сервиса (Cloudflare, Play Console, эквайринг…).*
