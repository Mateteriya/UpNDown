# Зеркало РФ на SpaceWeb (тариф «Старт») — `up2down.ru`

Цель: игра без VPN в России. Мир остаётся на `up2down.online` (Vercel).

Официальная помощь SpaceWeb: [создать сайт](https://help.sweb.ru/entry/980/), [загрузить сайт](https://help.sweb.ru/entry/940/), [привязать домен](https://help.sweb.ru/kak-privyazat6-domen-k-hostingu_1345.html), [Let’s Encrypt](https://help.sweb.ru/ustanovka-besplatnogo-sertifikata-let-s-encrypt-s-avtoprodleniem_1213.html).

**Объём:** текущий `dist/` ≈ **100–110 МБ**. На «Старт» (1 ГБ) хватает; при росте медиа — апгрейд на «Взлёт».

**Домен:** оставляем у текущего регистратора, меняем только **NS** (или A-записи) на SpaceWeb — **не** обязательно переносить регистрацию домена.

---

## 0. Что не трогать

- `up2down.online` на Vercel — не удалять.
- Redirect URI Яндекса / VK bridge — **не** менять.
- App Platform Timeweb Cloud — можно не оплачивать / отменить.

---

## 1. Заказ хостинга SpaceWeb

1. Откройте [https://sweb.ru](https://sweb.ru) / панель SpaceWeb.
2. Зарегистрируйтесь или войдите.
3. Закажите тариф **«Старт»** (1 сайт, 1 ГБ).
4. Оплатите (месяц или год — как удобнее).
5. Дождитесь письма с логином панели (часто `https://cp.spaceweb.ru` или ссылка из письма).

---

## 2. Добавить домен `up2down.ru` в панель

1. Войдите в панель управления SpaceWeb.
2. Раздел **«Домены»** / **«Мои домены»** → **«Добавить домен»**.
3. Укажите `up2down.ru`.
4. **Не** ставьте «зарегистрировать новый», если домен уже ваш — только добавить существующий.
5. При желании добавьте `www.up2down.ru` (алиас / отдельным доменом — как предложит панель).

Сайт по умолчанию часто уже смотрит в папку **`public_html`**.

---

## 3. DNS у регистратора (увести с Vercel)

### Способ A — NS SpaceWeb (предпочтительно)

У регистратора, где лежит `.ru` (nic.ru / RF / Reg.ru / …):

1. Управление доменом → **DNS-серверы** / Nameservers.
2. Укажите NS SpaceWeb (актуальные в панели в карточке домена; обычно):

   - `ns1.spaceweb.ru`
   - `ns2.spaceweb.ru`
   - `ns3.spaceweb.pro`
   - `ns4.spaceweb.pro`

3. Сохраните. Ждите от **нескольких часов до 24 ч**.

### Способ B — только A-запись

1. В панели SpaceWeb найдите **IP сервера** аккаунта.
2. У регистратора: A `@` → этот IP; `www` → тот же IP или CNAME на `up2down.ru`.

### Vercel

1. vercel.com → проект → **Domains**.
2. **Remove** `up2down.ru` (и www, если был).
3. **`up2down.online` оставить.**

Проверка: `http://up2down.ru` открывает **заглушку SpaceWeb**, не Vercel.

---

## 4. SSL (HTTPS)

1. Когда домен уже открывается по HTTP с SpaceWeb.
2. Панель → **SSL** / **«SSL/Установить»** → вкладка **Let’s Encrypt**.
3. Выберите `up2down.ru` (+ www при необходимости).
4. Подтверждение: DNS (если NS уже SpaceWeb) или HTTP.
5. Дождитесь «установлен».
6. Включите редирект на HTTPS (галочка в панели или строки в `.htaccess` ниже).

Проверка: `https://up2down.ru` с замочком.

---

## 5. Собрать игру на ПК

В корне репо Up&Down:

1. В `.env.local` для сборки прода должны быть **прод**-значения (как на Vercel), **не** LAN:

   ```
   VITE_SUPABASE_URL=…          # как на Vercel
   VITE_SUPABASE_ANON_KEY=…     # как на Vercel
   VITE_PUBLIC_HALL_ENABLED=true
   VITE_DONATE_CLOUDTIPS=…
   VITE_DONATE_YOOMONEY=…
   ```

   Временно **закомментируйте** (чтобы не вшить дом в билд):

   ```
   # VITE_ONLINE_TRANSPORT=ws
   # VITE_WS_URL=ws://192.168.…
   # VITE_INVITE_URL=http://192.168.…
   ```

2. Сборка:

   ```bash
   npm run build
   ```

3. Появится папка **`dist/`** (~100 МБ).

4. Упакуйте **содержимое** `dist` (не саму папку-обёртку) в zip, например `up2down-ru.zip`  
   (внутри zip сразу `index.html`, `assets/`, `auth-callback.html`, …).

После сборки верните LAN-строки в `.env.local`, если нужны для дома.

---

## 6. Залить файлы в `public_html`

1. Панель → **«Файловый менеджер»**.
2. Откройте **`public_html`** (или папку сайта, привязанную к `up2down.ru`).
3. Удалите дефолтные `index.html` / заглушку SpaceWeb (и старый `.htaccess`, если будете писать свой).
4. **Загрузить** → выберите `up2down-ru.zip` → **Распаковать** в `public_html`.
5. Убедитесь: в корне `public_html` лежат `index.html` и `auth-callback.html`  
   (не `public_html/dist/index.html`).
6. Удалите zip с сервера.

Альтернатива: FTP (логин/пароль в панели, порт 21) — FileZilla.

---

## 7. Файл `.htaccess` в корне `public_html`

Создайте/замените `.htaccess`:

```apache
Options -MultiViews
RewriteEngine On

# HTTP → HTTPS (если панель сама не редиректит)
RewriteCond %{HTTPS} !=on
RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

# Реальные файлы и папки — как есть (assets, auth-callback.html, иконки)
RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]

# SPA: остальное → index.html
RewriteRule ^ index.html [L]
```

Сохранить.

---

## 8. Проверка сайта

Без VPN (из РФ):

1. https://up2down.ru — меню игры  
2. https://up2down.ru/auth-callback.html — не 404 (текст про вход)  

Если чёрный экран «Загрузка…» — жёсткое обновление / другой браузер (старый SW с Vercel на этом домене мог остаться в кэше: очистить данные сайта для up2down.ru).

---

## 9. Supabase Redirect URLs

Dashboard → Authentication → URL Configuration → добавить:

```
https://up2down.ru/auth-callback.html
https://up2down.ru/**
https://www.up2down.ru/auth-callback.html
https://www.up2down.ru/**
```

Не удаляйте строки `up2down.online`.

---

## 10. VK и Яндекс (базовый домен / хост)

- **VK ID:** Redirect URI bridge **без изменений**. Добавить **базовый домен** `up2down.ru`.
- **Яндекс:** Redirect URI Supabase **без изменений**. В «Хост страницы» добавить `https://up2down.ru`.

---

## 11. Тест входа без VPN

Incognito, VPN выкл.:

1. https://up2down.ru → Вход → Яндекс  
2. Вход → VK ID · Mail.ru  

---

## 12. Обновление после правок в коде

```bash
npm run build
```

Снова zip содержимого `dist` → залить/распаковать в `public_html` (заменить файлы).

---

## Чеклист

- [ ] SpaceWeb «Старт» оплачен, панель доступна  
- [ ] Домен `up2down.ru` в панели  
- [ ] NS (или A) на SpaceWeb; убран с Vercel Domains  
- [ ] Let’s Encrypt, https работает  
- [ ] `dist` (~100 МБ) в `public_html` + `.htaccess`  
- [ ] Меню и `/auth-callback.html` открываются  
- [ ] Supabase Redirect URLs  
- [ ] VK/Яндекс хост = up2down.ru  
- [ ] Вход Яндекс + VK без VPN  
