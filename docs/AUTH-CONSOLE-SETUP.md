# Авторизация «в облаке»: полный чеклист консолей

Клиент (кнопки, emailRedirectTo, VK LAN-мост) уже в коде.  
**Без настроек в Dashboard / кабинетах** письма и Apple/LINE «сами» не заработают.

| Тема | Документ |
|------|----------|
| Письма Confirm email + SMTP | [AUTH-EMAIL-CONFIRM.md](./AUTH-EMAIL-CONFIRM.md) |
| Apple + LINE | [AUTH-APPLE-LINE.md](./AUTH-APPLE-LINE.md) |
| Яндекс + VK ID · Mail.ru (+ LAN :3001) | [AUTH-YANDEX-VK-MAIL.md](./AUTH-YANDEX-VK-MAIL.md) |
| Общий Supabase | [SUPABASE-SETUP.md](./SUPABASE-SETUP.md) |

---

## 0. Redirect URLs (сделать первым)

Supabase → **Authentication** → **URL Configuration** → **Redirect URLs**:

```
https://up2down.online/**
https://up2down.online/play/
https://up2down.online/auth-callback.html
https://up2down.ru/**
https://up2down.ru/auth-callback.html
http://localhost:5173/**
http://localhost:5173/auth-callback.html
http://localhost:3001/play/
http://localhost:3001/play/auth-callback.html
http://ВАШ_LAN_IP:3001/play/
http://ВАШ_LAN_IP:3001/play/auth-callback.html
```

**Site URL** — канон прода, например `https://up2down.online`.

IdP callback (Google/Яндекс/Apple/LINE) — **не** эти URL, а всегда:

```
https://<PROJECT_REF>.supabase.co/auth/v1/callback
```

VK ID redirect — **Edge-мост**:

```
https://<PROJECT_REF>.supabase.co/functions/v1/vk-oauth-bridge
```

---

## 1. Письма (email + пароль)

1. Providers → **Email** → Confirm email ON/OFF по желанию.
2. **Custom SMTP** (Resend / Mailgun / …) — иначе Яндекс/Mail.ru часто не получают встроенную почту Supabase.
3. Проверка: регистрация → письмо → клик → **auth-callback** (быстро) → домой уже в сессии.

Подробно: [AUTH-EMAIL-CONFIRM.md](./AUTH-EMAIL-CONFIRM.md).

---

## 2. Apple

1. Apple Developer → Services ID + Key `.p8` → Secret JWT.
2. Domain/Return = хост и `/auth/v1/callback` Supabase.
3. Supabase → Providers → **Apple** → Enable + Client ID + Secret.

Подробно: [AUTH-APPLE-LINE.md](./AUTH-APPLE-LINE.md) часть A.

---

## 3. LINE

1. LINE Developers → LINE Login → Callback = Supabase `/auth/v1/callback`.
2. Supabase → **Custom** provider identifier `line` (Manual OAuth2, не OIDC discovery).
3. Free: лимит ~3 custom — место рядом с yandex/vkid.

Подробно: [AUTH-APPLE-LINE.md](./AUTH-APPLE-LINE.md) часть B.

---

## 4. Яндекс / VK · Mail.ru

Уже могли быть настроены раньше. Кратко:

- Яндекс: custom `yandex`, redirect = GoTrue callback.
- VK: базовый домен `up2down.online`, redirect URI = **vk-oauth-bridge** Edge Function; кнопка одна (**VK ID · Mail.ru**).
- На `:3001` кнопка **видима**; старт через `https://up2down.online/vk-lan-bridge.html` (нужен деплой этого файла на прод).

Подробно: [AUTH-YANDEX-VK-MAIL.md](./AUTH-YANDEX-VK-MAIL.md).

---

## 5. Порядок кнопок в игре

| UI-регион | Приоритет |
|-----------|-----------|
| JP | LINE, Apple, Google, GitHub |
| RU | Яндекс, VK·Mail.ru, Google, Apple, GitHub |
| иначе | Google, Apple, GitHub, Яндекс, VK, LINE |

Регион: `updown-locale` / `navigator.language`.

---

## 6. Что деплоить после правок клиента

```bash
npm run build:host-game   # вечеринка → dist-host → хост :3001
# + выкладка сайта up2down.online: vk-lan-bridge.html и свежий auth-callback
```

Без свежего `vk-lan-bridge.html` + hop в online `auth-callback` вход VK с LAN оборвётся после VK.
