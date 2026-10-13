# Зеркало для РФ: `up2down.ru` (не Vercel)

Цель: игроки в России открывают игру **без VPN**.  
Мир остаётся на `https://up2down.online` (Vercel).  
Тот же билд (`npm run build` → папка `dist/`).

---

## Итоговая схема

| Домен | Хостинг | Для кого |
|-------|---------|----------|
| `up2down.online` | Vercel | мир |
| `up2down.ru` | **RU-хостинг** (не Vercel) | РФ / кто режет Vercel |

OAuth: Redirect URI у Яндекса/VK **не меняем** (как сейчас: Supabase callback / `vk-oauth-bridge`).  
Меняем только **куда возвращается игра** после входа (Redirect URLs в Supabase) и **базовый домен** в кабинете VK/Яндекс.

---

## Шаг 0 — что не трогать

- Не отвязывайте `up2down.online` от Vercel.
- Не меняйте Redirect URI VK bridge:  
  `https://jrgnsqbwwhovonxyxown.supabase.co/functions/v1/vk-oauth-bridge`
- Не меняйте Яндекс Redirect URI:  
  `https://jrgnsqbwwhovonxyxown.supabase.co/auth/v1/callback`

---

## Шаг 1 — выбрать RU-хостинг (один)

Рекомендация для «не разработчика»: **Timeweb** или **Beget** — обычный хостинг + HTTPS + загрузка файлов.

Нужно уметь:

1. Привязать домен `up2down.ru`
2. Включить **HTTPS** (Let's Encrypt)
3. Залить содержимое папки `dist/` в корень сайта
4. Для SPA: любой неизвестный путь → `index.html`, но **`/auth-callback.html` отдавать как файл**

Пример nginx (если дадут свой VPS / конфиг):

```nginx
server {
  listen 443 ssl http2;
  server_name up2down.ru www.up2down.ru;
  root /var/www/up2down.ru;
  index index.html;

  location = /auth-callback.html {
    try_files $uri =404;
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

На шаред-хостинге часто есть «перенаправление на index.html» / «SPA mode» — включите и проверьте, что `https://up2down.ru/auth-callback.html` открывается (не 404).

---

## Шаг 2 — DNS (уйти с Vercel)

Сейчас `up2down.ru` у Vercel (A `76.76.21.21` / их NS). Нужно указать DNS **хостинга РФ**.

1. В панели нового хостинга: «Привязать домен» → скопировать их A/NS.
2. У регистратора домена (где куплен `.ru`):
   - либо **NS** хостинга,
   - либо **A-запись** на IP хостинга (и `www` → CNAME/A по инструкции хостинга).
3. В **Vercel** → Project → Domains → у `up2down.ru` нажать **Remove** (чтобы Vercel не спорил за домен).  
   `up2down.online` оставить.
4. Подождать DNS (часто 15–60 мин, иногда до суток).  
   Проверка: https://up2down.ru открывается **без VPN** из РФ.

---

## Шаг 3 — собрать и залить сайт

На своём ПК (в корне репо):

```bash
npm run build
```

Залить **всё содержимое** `dist/` в корень сайта на RU-хостинге (через файловый менеджер / FTP / Git deploy — как даст хостер).

После заливки проверить:

- https://up2down.ru — меню грузится
- https://up2down.ru/auth-callback.html — не 404 (текст «Вход…» / пустая страница колбэка ок)

---

## Шаг 4 — Supabase Redirect URLs

Dashboard → Authentication → URL Configuration → **Redirect URLs** — **добавить** (не удаляя online):

```
https://up2down.ru/auth-callback.html
https://up2down.ru/**
https://www.up2down.ru/auth-callback.html
https://www.up2down.ru/**
```

Site URL можно оставить `https://up2down.online` (мир) или временно не трогать.

---

## Шаг 5 — VK ID и Яндекс (базовый домен)

**VK ID** (кабинет приложения):

- Redirect URI — **без изменений** (bridge, как сейчас).
- **Базовый домен** / домен сайта: добавить **`up2down.ru`** (если можно несколько — оставить и `up2down.online`).

**Яндекс** (oauth.yandex.ru):

- Redirect URI — без изменений (Supabase callback).
- Поле **«Хост страницы»**: добавить `https://up2down.ru` (если форма даёт вторую строку).

---

## Шаг 6 — проверка без VPN (из РФ)

Incognito, VPN **выкл.**:

1. https://up2down.ru — открылось?
2. Вход → Яндекс — вернулись в кабинет?
3. Вход → VK ID — вернулись в кабинет?
4. https://up2down.online — по-прежнему для мира (с VPN в РФ ок).

Если статика с `.ru` быстрая, а после «Разрешить» снова тупит — смотреть, не режется ли `*.supabase.co` (это уже следующий этап: прокси Auth). Сначала добейте зеркало статики.

---

## Обновление зеркала после пуша в main

Каждый релиз на Vercel **не** обновляет `.ru` сам. Нужно:

```bash
npm run build
```

и снова залить `dist/` на RU-хостинг  
(или позже настроим Git-деплой / CI — не обязательно в первый день).

---

## Чеклист

- [ ] Аккаунт Timeweb/Beget/Selectel (или свой VPS в РФ)
- [ ] `up2down.ru` DNS → RU-хостинг; убран с Domains в Vercel
- [ ] HTTPS на `.ru`
- [ ] Залит свежий `dist/`
- [ ] `/auth-callback.html` доступен
- [ ] Supabase Redirect URLs для `.ru`
- [ ] VK базовый домен = `up2down.ru` (+ online по возможности)
- [ ] Яндекс хост страницы = `https://up2down.ru`
- [ ] Тест без VPN: сайт + Яндекс + VK
