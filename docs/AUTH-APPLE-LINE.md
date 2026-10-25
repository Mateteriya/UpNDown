# Apple и LINE — полная настройка (кабинет + Supabase)

Кнопки уже в модалке входа (`AuthModal`):

| Регион UI | Порядок (сначала) |
|-----------|-------------------|
| **JP** (`ja` / локаль `ja`) | LINE → Apple → Google → GitHub |
| **RU** | Яндекс → VK ID·Mail.ru → Google → Apple → GitHub |
| default | Google → Apple → GitHub → Яндекс → VK → LINE |

Без включения провайдеров в **Apple / LINE Developers** и **Supabase** кнопки дадут ошибку провайдера — это ожидаемо.

**Callback для IdP (Apple / LINE / Google / Яндекс) — всегда Supabase**, не URL игры:

```
https://jrgnsqbwwhovonxyxown.supabase.co/auth/v1/callback
```

(подставьте свой project ref, если другой проект)

После успеха GoTrue редиректит на **Redirect URL игры** (`…/auth-callback.html` текущего origin).

---

## Общие Redirect URLs в Supabase

**Authentication** → **URL Configuration** → **Redirect URLs** — добавьте:

```
https://up2down.online/auth-callback.html
https://up2down.online/play/auth-callback.html
https://up2down.ru/auth-callback.html
http://ВАШ_IP:3001/play/auth-callback.html
http://localhost:5173/auth-callback.html
http://localhost:3001/play/auth-callback.html
```

И домашние (для email и возврата):

```
https://up2down.online/
https://up2down.online/play/
https://up2down.ru/
http://ВАШ_IP:3001/play/
```

---

# Часть A — Sign in with Apple (built-in Supabase)

Официально: [Supabase Auth — Apple](https://supabase.com/docs/guides/auth/social-login/auth-apple).

Нужен платный **Apple Developer Program** ($99/год).

## A1. Identifiers в Apple Developer

1. [developer.apple.com](https://developer.apple.com) → **Certificates, Identifiers & Profiles**.
2. **Identifiers** → **+**.

### App ID (если ещё нет)

- Type: **App IDs** → App.
- Description / Bundle ID — как у приложения (можно web-only Services ID ниже).
- Capabilities: включить **Sign In with Apple**.

### Services ID (для веба — это Client ID в Supabase)

1. Identifiers → **+** → **Services IDs**.
2. Description: `UpDown Web`, Identifier например `online.up2down.web` (уникальный).
3. Enable **Sign In with Apple** → Configure:
   - **Primary App ID** — ваш App ID.
   - **Domains and Subdomains**: `jrgnsqbwwhovonxyxown.supabase.co`  
     (без `https://`, только хост Supabase).
   - **Return URLs**:
     ```
     https://jrgnsqbwwhovonxyxown.supabase.co/auth/v1/callback
     ```
4. Save → Continue → Register.

## A2. Ключ Sign in with Apple (.p8)

1. **Keys** → **+**.
2. Name: `UpDown Apple Auth`.
3. Enable **Sign In with Apple** → Configure → выбрать Primary App ID → Save.
4. Register → **Download** `.p8` (**один раз**; сохраните в сейф).
5. Запомните **Key ID** и **Team ID** (Membership details).

## A3. Secret JWT для Supabase

Supabase просит **Secret**, это JWT, подписанный `.p8`, не сам файл.

Сгенерировать можно:

- скриптом из [доки Supabase Apple](https://supabase.com/docs/guides/auth/social-login/auth-apple#configuration-using-the-supabase-dashboard), или
- онлайн-генератором из доки / `node` с `jsonwebtoken`.

Claims типично:

- `iss` = Team ID  
- `sub` = Services ID (Client ID)  
- `aud` = `https://appleid.apple.com`  
- срок ~6 месяцев (потом ротация)

## A4. Включить в Supabase

1. **Authentication** → **Providers** → **Apple**.
2. **Enable**.
3. **Client ID** = Services ID (`online.up2down.web`).
4. **Secret** = сгенерированный JWT.
5. Save.

## A5. Проверка

1. Прод или `http://IP:3001/play/` → Войти → **Apple**.
2. Apple ID → согласие → возврат на `auth-callback` → главная, сессия есть.
3. JP-браузер: Apple выше в списке.

**Частые ошибки:** Domain/Return URL не совпали с Supabase; Secret просрочен; Client ID = Bundle ID вместо Services ID.

---

# Часть B — LINE Login (Custom Provider)

Официально LINE: [LINE Login](https://developers.line.biz/en/docs/line-login/).  
У Supabase нет built-in LINE → **Custom OAuth2**.

## B1. LINE Developers

1. [developers.line.biz](https://developers.line.biz/) → Console → Create **Provider** (если нет).
2. Create channel → **LINE Login** (не только Messaging, если нужен вход).
3. Channel → **LINE Login** settings:
   - **Callback URL** = ровно:
     ```
     https://jrgnsqbwwhovonxyxown.supabase.co/auth/v1/callback
     ```
   - OpenID Connect / email permission — включить запрос email при необходимости.
4. Скопировать **Channel ID** и **Channel secret** (Basic settings).

## B2. Custom Provider в Supabase

**Authentication** → **Providers** → **Custom** / **Custom Providers** → **Add**.

Method: **Manual configuration (OAuth2)** — **не** OIDC Auto-discovery  
(у LINE web ID token часто HS256; у Supabase custom OIDC ожидают ES256 → ломается).

| Поле | Значение |
|------|----------|
| Identifier | `line` → в коде будет `custom:line` |
| Name | LINE |
| Client ID | Channel ID |
| Client Secret | Channel secret |
| Issuer URL | `https://access.line.me` |
| Authorization URL | `https://access.line.me/oauth2/v2.1/authorize` |
| Token URL | `https://api.line.me/oauth2/v2.1/token` |
| Userinfo URL | `https://api.line.me/oauth2/v2.1/userinfo` |
| JWKS URI | *(пусто)* |
| Scopes | `profile openid email` |
| Allow users without email | **ON** (часто у LINE нет email) |

Enabled → Save.

### Лимит Free plan

На Free часто **не больше 3 custom-провайдеров**. Если уже заняты `yandex` + `vkid` + ещё один — LINE не влезет без Pro или отключения лишнего.

Код уже ждёт identifier **`line`** (`OAUTH_LINE = 'custom:line'`).

## B3. Проверка

1. Локаль `ja` или `navigator.language` ja → LINE первая кнопка.
2. Войти → LINE → согласие → сессия как у Google.

---

## После настройки

Пересборка игры **не обязательна** — кнопки уже в билде. Нужны только кабинеты.

Если кнопка есть, а ошибка «provider is not enabled» / 400 — провайдер выключен или Identifier не `line` / не Apple Enabled.
