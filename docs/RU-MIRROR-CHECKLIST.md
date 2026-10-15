# Чеклист зеркала РФ + двойной деплой

Канон хостинга: [RU-MIRROR-SPACEWEB.md](./RU-MIRROR-SPACEWEB.md).

## Уже сделано (2026-10)

- [x] SpaceWeb «Старт», сайт `up2down.ru` → `…/up2down_ru/public_html`
- [x] SSL Let’s Encrypt
- [x] Заливка `dist/` + SPA `.htaccess`
- [x] www → `https://up2down.ru` (редирект)
- [x] Supabase Redirect URLs для `up2down.ru` и `www`
- [x] VK базовый домен / Яндекс хост страницы

## Добить сейчас

### 1–2. Google origins + вход без VPN — ✅ (2026-10-14)

Проверено на `https://up2down.ru`: Яндекс, VK, Google, GitHub.  
Origins в Cloud Console: `https://up2down.ru` + `https://www.up2down.ru`.

**Если зависает «Завершение входа…» / «Обмен кода…» уже на `up2down.ru` (без www):**  
1. **PWA bug (было в HAR):** SW `NavigationRoute` подменял `auth-callback.html` на `index.html` (грузился `main-*.js`, **не было** `POST …/vk-oauth-exchange`). Лечится сборкой с `scripts/patch-sw-auth-callback.mjs` + заливка `dist` + **удалить данные сайта** / Incognito.  
2. Если после этого краснеет `supabase.co` — сеть/РФ; временно VPN или `up2down.online`.

### 2a. Если в адресе всё ещё `www` при входе

Сервер уже отдаёт 301, но **старый Service Worker / кэш** может держать документ на `www`.  
Тогда VK: `invalid_origin` / «referer is not the app base domain», Яндекс/Google — «Завершение входа…» + CORS на `manifest`.

1. Инкогнито **или** очистить данные сайта для `www.up2down.ru` **и** `up2down.ru` (включая SW).  
2. Заходить только на `https://up2down.ru`.  
3. В кабинете VK ID базовый домен = `up2down.ru` (без www).  
4. Залить свежий `dist` (в HTML вшит мгновенный уход с www).

### 2b. `.htaccess` без петли HTTPS (если OAuth «Завершение входа…» зависает)

На SpaceWeb **нельзя** в `.htaccess` писать принудительный `HTTP→HTTPS` через `%{HTTPS} !=on`:
TLS уже на nginx, Apache видит «не HTTPS» → **вечный 301 на тот же URL** → ломается обмен `?code=`.

Актуальный файл: `public/.htaccess` / `dist/.htaccess` (только www→apex + SPA).  
После правки на сервере проверка:

```powershell
curl.exe -sI "https://up2down.ru/"
curl.exe -sI "https://www.up2down.ru/"
```

Ожидание: apex → `200` (не `301` на себя); www → `301` на `https://up2down.ru/...`.

### 3. Памятка двойного деплоя (каждый релиз UI)

| Куда | Как |
|------|-----|
| **Мир** `up2down.online` | push / деплой **Vercel** (как раньше) |
| **РФ** `up2down.ru` | на ПК: `npm run build` → zip **содержимого** `dist/` → залить/распаковать в SpaceWeb `public_html` |

Vercel **не** обновляет SpaceWeb. Перед сборкой зеркала: в `.env.local` прод-`VITE_*`, **без** LAN `VITE_WS_URL` / `VITE_INVITE_URL`. После сборки — вернуть LAN-строки, если нужны домашние партии.

Проверка после заливки: меню + `/auth-callback.html` + один быстрый вход.

## Позже

- [ ] Скрипт / CI заливки на SpaceWeb (SFTP/rsync), чтобы не руками
- [ ] Прокси Auth только если из РФ начнёт стабильно резаться `*.supabase.co`
