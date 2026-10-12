# Вход через Яндекс и VK ID (Mail.ru)

Кнопки в модалке уже есть. Нужно завести приложения у провайдеров и **Custom Providers** в Supabase.

---

## С нуля: куда кликать (Яндекс)

У вас в `.env.local` уже есть `VITE_SUPABASE_URL`.  
**Единственная строка для Яндекса (Redirect URI)** — всегда такая:

```
https://jrgnsqbwwhovonxyxown.supabase.co/auth/v1/callback
```

(это ваш проект; если смените Supabase-проект — поменяется середина URL).

### Шаг 1 — открыть Яндекс

1. Браузер → [https://oauth.yandex.ru/](https://oauth.yandex.ru/)
2. Войти своим Яндекс-аккаунтом.
3. Открыть своё приложение (или «Создать новое»).

### Шаг 2 — в Яндексе вставить Redirect URI

1. Найти поле **Redirect URI** / **Callback URI** (платформа «Веб-сервисы»).
2. Вставить **ровно**:

   ```
   https://jrgnsqbwwhovonxyxown.supabase.co/auth/v1/callback
   ```

3. Сохранить.
4. Рядом скопировать **ID** и **Пароль** приложения (Client ID / Secret) — понадобятся в шаге 4.

**Сюда НЕ вставлять:** `up2down.online`, `localhost`, `192.168…:3001`, `updown://…`.

Платформы **Android** и **iOS** в кабинете Яндекса **не заполняйте** — см. ниже после шага 4.

### Шаг 3 — доступы в Яндексе

В том же приложении включить галочки:

- доступ к **email**
- доступ к **имени / фамилии** (профиль)

Сохранить.

### Шаг 4 — открыть Supabase и создать провайдер

1. Браузер → [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Выбрать проект Up&Down.
3. Слева: **Authentication**.
4. Внутри: **Sign In / Providers** (или **Providers**).
5. Блок **Custom Providers** → кнопка **New Provider** / **Add**.
6. Тип: **Manual configuration** / **OAuth2** (не Auto-discovery OIDC).
7. Заполнить:

| Поле в Supabase | Что писать |
|-----------------|------------|
| Identifier | `custom:yandex` (или в поле без префикса: `yandex` — `custom:` допишется само) |
| Name | `Yandex` |
| Client ID | ID из Яндекса (шаг 2) |
| Client Secret | Пароль из Яндекса |
| **Issuer URL** | `https://oauth.yandex.ru` (**не** оставлять placeholder `https://auth.company.com`) |
| Authorization URL | `https://oauth.yandex.ru/authorize` |
| Token URL | `https://oauth.yandex.ru/token` |
| UserInfo URL | `https://login.yandex.ru/info?format=json` |
| JWKS URI | **пусто** (у Яндекса ID нет нормального JWKS; URL `…/jwks.json` — битый) |
| Scopes | `login:email, login:info` (в форме Supabase — через запятую) |
| Allow users without email | можно включить на всякий случай |

**Про Issuer URL:** в Manual оно тоже есть и **обязательно** (форма не даст сохранить пустым). Это не «discovery Яндекса» — просто базовый адрес провайдера. Пишите `https://oauth.yandex.ru`. Три URL ниже всё равно заполните вручную: у Яндекса пути не `/oauth/authorize`.

8. В форме Supabase будет серое поле **Callback URL** — оно должно совпасть со строкой из шага 2. Если совпало — ок.
9. Включить провайдер (**Enabled** / галочка) → Save.

### Android / iOS в кабинете Яндекса

**Сейчас ничего не добавляйте** в платформы Android и iOS у Яндекса.

У нас вход идёт так: приложение (веб / APK) → Яндекс как **веб-сервис** → callback **Supabase** → уже потом возврат в игру (`/play/auth-callback.html` или `updown://auth-callback`).  
Яндекс видит только Redirect URI веб-сервиса (строка Supabase выше). Отдельные Redirect для Android/iOS в oauth.yandex.ru для этой схемы **не нужны**.

### Если в списке приложений статус «Не подключен»

Redirect URI с Supabase может быть уже правильным — статус часто висит из‑за **пустого «Хоста»** или **неверифицированного аккаунта**.

**A. Хост страницы (не путать с Redirect URI)**

В форме два разных поля:

| Поле | Что писать |
|------|------------|
| Redirect URI | `https://jrgnsqbwwhovonxyxown.supabase.co/auth/v1/callback` |
| **Хост страницы**, где кнопка/виджет входа | origin, **доступный Яндексу без VPN**. Если `up2down.online` из РФ «не открывается» — не ставьте его: лучше `https://up-n-down.vercel.app` или `https://up2down.ru` (что реально открывается с обычного RU-интернета). Redirect URI по-прежнему только Supabase. |

Хост — **не** supabase.co.

**Как добавить localhost / LAN в «Хост страницы»:**

1. В том же блоке «Платформы» / Web, под полем хоста ищите **«+»**, **«Добавить»**, вторую пустую строку или иконку рядом с полем.
2. В **первой** строке хоста оставьте:
   `https://up2down.online`
3. Во **второй** (новая строка) впишите **целиком origin**, со схемой и портом, **без** пути:
   - `http://localhost:3001`
   - `http://192.168.1.113:3001`
4. Не пишите сюда `/play`, `/auth-callback.html`, supabase.
5. Сохранить.

Если кнопки «Добавить» нет — в одном поле часто можно только **один** хост: оставьте `https://up2down.online`. Для локалки через Supabase classic OAuth хост Яндекса **не** обязан совпадать с LAN (важно Redirect URI = Supabase). Локальный хост — плюс для виджета Яндекса, не обязателен для кнопки в нашей игре.

**B. Верификация аккаунта**

1. [https://oauth.yandex.ru/](https://oauth.yandex.ru/) → баннер **«Снять ограничения»** / Госуслуги ([дока](https://yandex.ru/dev/id/doc/ru/confirm-account)).
2. Приложение должно быть **«Для авторизации пользователей»** (`/client/new/id/`), не «для API».
3. Сверьте с **ПроТекст** (у него «Подключен»): заполнен ли Хост, есть ли галочка верификации.

Без «Подключен» Яндекс часто рвёт вход (`unauthorized_client`). CSP в консоли обычно ни при чём.

### Шаг 5 — проверить в игре

1. Открыть игру → **Вход**.
2. Кнопка **Яндекс**.
3. Должно открыться окно Яндекса → согласие → возврат в игру уже вошедшими.

**Смена Яндекс-аккаунта:** `force_confirm=yes` снова показывает экран согласия. Если в браузере в Яндекс уже вошли только одним аккаунтом — он и подставится. Чтобы выбрать другой: на экране Яндекса «Войти другим» / смена аккаунта, либо в другой вкладке выйти на [passport.yandex.ru](https://passport.yandex.ru/) и снова **Вход → Яндекс** в игре. В игре сначала **Выйти**.

### Яндекс пустил, а кабинет всё ещё «вне аккаунта»

CSP / `mark.js` / логи Vite HMR — **игнорировать**.

#### Ошибка в адресе: `oauth_client_state_not_found`

Пример:

`http://192.168.1.113:3001/play/?error=server_error&error_code=oauth_client_state_not_found&…`

Supabase не находит server-side OAuth state после возврата с Яндекса (часто из‑за PKCE у Custom Provider).

**Фикс провайдера** (нужен `SUPABASE_SERVICE_ROLE_KEY` в `.env.local`):

```bash
node scripts/fix-yandex-custom-provider.mjs
```

Ставит `email_optional: true`, чистит JWKS, **PKCE снова включён** (без PKCE старт/state у Яндекса хуже).  
Только если снова `oauth_client_state_not_found` и Incognito не помог:  
`node scripts/fix-yandex-custom-provider.mjs --no-pkce`

**Важно при тесте:** обычный Chrome/Edge → **окно Incognito без расширений** →  
`http://192.168.1.113:3001/play/` → Яндекс.  
Не Cursor Simple Browser: в CSP видно `chrome-extension://…` — расширения ломают страницу Яндекса (`mark.js`).  
`npm run dev` на `:5173` к редиректу на `:3001` не относится.

#### `error missing provider id`

Яндекс в userinfo отдаёт `id` / `default_email`, а Supabase ждёт OIDC-поля `sub` / `email`.

Нужен прокси Edge Function `yandex-userinfo` (мапит поля) и Userinfo URL провайдера на него:

```bash
npx supabase functions deploy yandex-userinfo --project-ref jrgnsqbwwhovonxyxown
node scripts/fix-yandex-custom-provider.mjs
```

Код: `supabase/functions/yandex-userinfo/index.ts` (`verify_jwt = false` в `config.toml`).

#### `PKCE code verifier not found in storage`

Обычно гонка на `auth-callback.html` (клиент съел verifier до ручного exchange) или wipe ключей `sb-*-auth-token*`.  
В коде: `detectSessionInUrl` выключен на callback; wipe не трогает `*-code-verifier`.  
Пересоберите `npm run build:host-game`, перезапустите хост, тест в Incognito с того же origin (`:3001/play/`), без смены IP/порта.

#### Если ошибки state / provider id нет

1. Allow users without email — вкл.
2. В адресной строке при успехе: `…/play/auth-callback.html?code=…`.
3. Supabase → Authentication → Logs.

---

## Два адреса (чтобы не смешивать)

| Экран | Поле | Строка |
|-------|------|--------|
| **Яндекс** oauth.yandex.ru | Redirect URI | `https://jrgnsqbwwhovonxyxown.supabase.co/auth/v1/callback` |
| **Supabase** → Authentication → **URL Configuration** | Redirect URLs | адреса **игры** (`…/play/auth-callback.html` и т.д.) — см. ниже |

Цепочка: игра → Яндекс → адрес Supabase → снова игра.

---

## Полный список Redirect URLs (Supabase → URL Configuration)

Подставьте свой LAN IP вместо `192.168.1.113`.

```
https://up2down.online/auth-callback.html
https://up2down.online/**
http://192.168.1.113:3001/play/auth-callback.html
http://192.168.*.*:3001/**
http://localhost:3001/play/auth-callback.html
http://localhost:5173/auth-callback.html
http://127.0.0.1:5173/auth-callback.html
updown://auth-callback
```

На вечер вечеринки **Site URL** можно временно:

```
http://192.168.1.113:3001/play/
```

(без `?code=` и без `#`). После вечеринки верните `https://up2down.online`.

Готовые строки с вашим IP — на панели хоста → **Клуб · APK · журнал**.

---

## Яндекс ID — с нуля (пошагово)

Официально: [Регистрация приложения](https://yandex.ru/dev/id/doc/ru/register-client), кабинет [oauth.yandex.ru](https://oauth.yandex.ru/).

### A. Приложение в Яндексе

1. Войдите на [https://oauth.yandex.ru/](https://oauth.yandex.ru/) под Яндекс-аккаунтом разработчика.
2. **Создать новое приложение** (или откройте уже созданное).
3. **Название:** например `Up&Down`.
4. **Платформы:** отметьте **Веб-сервисы**.
5. **Redirect URI** — вставьте **Callback URL из Supabase** (см. выше):

   ```
   https://ВАШ_PROJECT_REF.supabase.co/auth/v1/callback
   ```

6. **Доступы (scopes)** — группа **Яндекс ID** / Login. Включите минимум:
   - **Доступ к адресу электронной почты** → это `login:email`
   - **Доступ к имени, фамилии…** → это `login:info`
   - По желанию **аватар** → `login:avatar`

7. Сохраните. Скопируйте:
   - **ID** (= Client ID)
   - **Пароль** (= Client Secret) — показать/сгенерировать в карточке приложения.

Проверить разрешённые scopes:  
`https://oauth.yandex.ru/client/<ClientID>/info`

### B. Custom Provider в Supabase

1. Supabase → **Authentication** → **Providers** → **Custom Providers** → **New Provider**.
2. Method: **Manual configuration (OAuth2)**.
3. Заполните:

| Поле | Значение |
|------|----------|
| Identifier | `custom:yandex` (**точно так**, как в коде) |
| Name | Yandex |
| Client ID | из oauth.yandex.ru |
| Client Secret | пароль приложения |
| Issuer URL | `https://oauth.yandex.ru` (обязательно даже в Manual) |
| Authorization URL | `https://oauth.yandex.ru/authorize` |
| Token URL | `https://oauth.yandex.ru/token` |
| UserInfo URL | `https://login.yandex.ru/info?format=json` |
| JWKS URI | пусто |
| Scopes | `login:info` и `login:email` (часто через пробел или как принимает форма; при ошибке — `login:info login:email`) |

4. Включите провайдер (**Enabled**).
5. Ещё раз скопируйте **Callback URL** и убедитесь, что он же в Redirect URI у Яндекса.

### C. Проверка

В игре: **Вход** → **Яндекс** → согласие → возврат в игру залогиненными.

---

## Mail.ru — почему VK ID

С **1 июля 2025** новые OAuth-приложения «чистого» Mail.ru оформляют через **VK ID**. Старый кабинет [o2.mail.ru](https://o2.mail.ru/app/) для **новых** клиентов часто ведёт туда же.

Для игрока это нормально: на экране VK ID можно войти **почтой Mail.ru**, аккаунтом VK или ОК — один поток.

В приложении кнопка: **«VK ID · Mail.ru»** → провайдер `custom:vkid`.

### VK ID — кратко

1. Кабинет: [https://id.vk.com/business/go](https://id.vk.com/business/go) / [dev.vk.com](https://dev.vk.com/ru/vkid).
2. Создайте приложение (Web).
3. **Redirect URL** = тот же Callback Supabase:  
   `https://ВАШ_PROJECT_REF.supabase.co/auth/v1/callback`
4. Скопируйте Client ID / Secret (и при необходимости параметры Web).
5. В Supabase → Custom Provider:

| Поле | Значение |
|------|----------|
| Identifier | `custom:vkid` |
| Name | VK ID |
| Client ID / Secret | из кабинета VK ID |
| Authorization / Token / UserInfo | по [доке VK ID OAuth без SDK](https://id.vk.com/about/business/go/docs/ru/vkid/latest/vk-id/connection/start-integration/auth-without-sdk/auth-without-sdk-web) (актуальные URL на момент настройки) |
| Scopes | обычно `email` (и openid, если OIDC) |

Точные URL VK ID иногда меняют — берите из их «OAuth без SDK» / OpenAPI на дату настройки. Если VK отдаёт OIDC discovery — в Supabase можно выбрать **Auto-discovery (OIDC)** и указать Issuer.

---

## Scopes — шпаргалка

| Провайдер | Что включить в кабинете приложения | Что писать в Supabase Scopes |
|-----------|-------------------------------------|------------------------------|
| **Яндекс** | Доступ к email + к имени/фамилии (группа Login) | `login:email` `login:info` (+ опц. `login:avatar`) |
| **VK ID** | Email / базовый профиль (как в мастере приложения) | как в доке VK ID (часто `email`) |

Смотреть разрешённые у Яндекса:  
`https://oauth.yandex.ru/client/<ClientID>/info`

---

## Код приложения

- Кнопки: `src/ui/AuthModal.tsx`
- Провайдеры: `src/lib/oauthProviders.ts` — `custom:yandex`, `custom:vkid`
- Identifier в Supabase **обязан** совпадать с этими строками.

Пока Custom Provider не создан/не Enabled, кнопка покажет ошибку от Supabase — это ожидаемо.

---

## Чеклист

- [ ] Callback Supabase скопирован и вставлен в Яндекс Redirect URI  
- [ ] В Яндексе включены `login:email` + `login:info`  
- [ ] Supabase Custom Provider `custom:yandex` Enabled  
- [ ] (Опц.) VK ID → `custom:vkid`  
- [ ] Redirect URLs игры (список выше) сохранены в URL Configuration  
- [ ] Тест: кнопка Яндекс → вход → кабинет с email  
