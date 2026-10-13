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

## Шаг 1 — Timeweb (подробно, виртуальный хостинг)

Панель: [https://hosting.timeweb.ru](https://hosting.timeweb.ru)  
(если у вас **Timeweb Cloud** — интерфейс другой; напишите, распишем Cloud отдельно. Ниже — классический хостинг «Сайты».)

Официально: [привязка домена](https://timeweb.com/ru/docs/virtualnyj-hosting/rabota-s-sajtom/privyazka-domena/), [работа с сайтом](https://timeweb.com/ru/docs/virtualnyj-hosting/rabota-s-sajtom/).

### 1.1. Войти и убедиться, что хостинг активен

1. Откройте панель Timeweb, войдите тем же аккаунтом, что для другого проекта.
2. На главной должен быть **тариф виртуального хостинга** (не только «домены»).
3. Если тарифа нет — «Заказать хостинг» / самый простой тариф с PHP (нам PHP не нужен, нужна только раздача файлов + SSL).

### 1.2. Создать сайт (папку)

1. Слева: **«Сайты»** → **«Мои сайты»**.
2. **«Создать новый сайт»** / «+».
3. Имя директории, например: `up2down` (латиница, без пробелов).
4. Создать. Появится сайт; файлы будут в  
   `/up2down/public_html/`  
   (имя папки = то, что задали).

### 1.3. Добавить домен `up2down.ru` в панель

1. **«Домены и SSL»** → **«Мои домены»** → **«Добавить домен»**.
2. Введите `up2down.ru` (и при желании сразу `www.up2down.ru`, если предложат).
3. Домен уже куплен у другого регистратора — выбирайте вариант **«У меня уже есть домен»** / добавить существующий, **не** «купить заново».

### 1.4. Привязать домен к сайту

Вариант A — из доменов:

1. **«Домены и SSL»** → у `up2down.ru` нажмите **«+» / привязать**.
2. Выберите сайт `up2down` (вашу директорию).
3. Сохранить.

Вариант B — из сайтов:

1. **«Сайты»** → иконка **глобуса** у сайта `up2down`.
2. Найти `up2down.ru` → **«Привязать»**.

То же для `www.up2down.ru`, если добавили отдельно (или алиас www в настройках домена).

### 1.5. DNS — увести домен с Vercel на Timeweb

Сейчас у `up2down.ru` DNS указывает на Vercel. Нужно направить на Timeweb.

**Способ проще (рекомендуется) — NS Timeweb:**

На сайте **регистратора**, где лежит `.ru` (nic.ru / RF / Reg.ru / где покупали):

1. Управление доменом → **DNS-серверы** / Nameservers.
2. Поставить NS Timeweb:

   - `ns1.timeweb.ru`
   - `ns2.timeweb.ru`
   - `ns3.timeweb.org`
   - `ns4.timeweb.org`

3. Сохранить. Ожидание: обычно до нескольких часов, иногда до 24 ч.

**Способ B — только A-запись** (если NS менять нельзя):

1. В панели Timeweb на **главной** / дашборде скопируйте **IP сервера**.
2. У держателя DNS (сейчас это Vercel — неудобно) лучше сначала сменить NS на Timeweb (способ A).  
   Если DNS остаётся у Vercel — A-запись на IP Timeweb теоретически возможна, но проще **убрать домен из Vercel** и перейти на NS Timeweb.

### 1.6. Убрать `up2down.ru` из Vercel

1. [vercel.com](https://vercel.com) → ваш проект Up&Down → **Settings** → **Domains**.
2. У строки `up2down.ru` (и `www`, если есть) → **Remove**.
3. **`up2down.online` не трогать.**

### 1.7. Дождаться DNS и проверить «сырой» сайт

Без VPN из РФ (или через друга в РФ):

- http://up2down.ru — должна открыться **заглушка Timeweb** или пустая папка (ещё не залили игру) — главное, **не** страница Vercel и не вечная «Загрузка…» от старого деплоя.

Проверка NS: whois / «проверка DNS» на любом сервисе — должны светиться `ns*.timeweb.*`.

### 1.8. Бесплатный SSL (HTTPS)

1. Домен уже **привязан** к сайту и открывается по HTTP без 5xx.
2. **«Домены и SSL»** → **«SSL-сертификаты»**.
3. Заказать / выпустить **бесплатный** сертификат (Let's Encrypt / «Бесплатный SSL» Timeweb) для `up2down.ru` (+ www, если используете).
4. Дождаться статуса «установлен» / «активен».
5. В настройках сайта включить **редирект HTTP → HTTPS**, если есть такая галочка.

Проверка: https://up2down.ru открывается с замочком.

Подробнее у Timeweb: [SSL](https://timeweb.com/ru/docs/ssl-sertifikaty/zakaz-ustanovka-i-prodlenie-ssl/).

### 1.9. Собрать игру и залить в `public_html`

На своём ПК в папке проекта:

```bash
npm run build
```

Появится папка **`dist/`**. Нужно залить **всё её содержимое** (не саму папку `dist`, а файлы внутри: `index.html`, `assets/`, `auth-callback.html`, …) в:

```
/up2down/public_html/
```

**Как залить:**

1. Панель → **«Файловый менеджер»**.
2. Зайти в `up2down` → `public_html`.
3. Удалить дефолтный `index.html` / `index.php` заглушки Timeweb (если мешает).
4. **«Загрузить»** / «Файл → Загрузить на сервер» — лучше zip:
   - на ПК упаковать содержимое `dist` в `up2down-dist.zip`;
   - загрузить zip в `public_html`;
   - в файловом менеджере **«Распаковать»**;
   - удалить zip.
5. Убедиться, что в корне `public_html` лежат именно `index.html` и `auth-callback.html` (не `dist/index.html` вложенным уровнем).

Альтернатива: FTP (FileZilla) — логин/пароль FTP в панели Timeweb («FTP-аккаунты»).

### 1.10. SPA / `.htaccess` (чтобы роуты не 404)

В корне `public_html` создайте файл **`.htaccess`** с содержимым:

```apache
Options -MultiViews
RewriteEngine On

# Реальные файлы и папки (assets, auth-callback.html, иконки) — отдаём как есть
RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]

# Остальное — на index.html (меню / PWA)
RewriteRule ^ index.html [L]
```

Так `https://up2down.ru/auth-callback.html` останется настоящим файлом, а глубокие пути меню уйдут в `index.html`.

### 1.11. Быстрая проверка после заливки

Без VPN:

1. https://up2down.ru — меню Up&Down  
2. https://up2down.ru/auth-callback.html — страница «Вход…» / колбэк (не 404)  
3. Дальше — шаги Supabase / VK / Яндекс ниже  

---

## Шаг 2 — DNS (кратко, если ещё не сделали в 1.5)

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
