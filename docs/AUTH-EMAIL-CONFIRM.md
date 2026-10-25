# Email + пароль: подтверждение и SMTP (полная инструкция)

Клиент шлёт `signUp` с `emailRedirectTo` = **auth-callback** текущего origin  
(`https://…/auth-callback.html` или `http://IP:3001/play/auth-callback.html`).

После клика по ссылке: лёгкая страница `auth-callback` делает `setSession` из hash и сразу ведёт домой.  
(Раньше редирект шёл на полный SPA — на другом ПК казалось, что «сайт вечность грузится».)

В Redirect URLs должны быть и callback, и home (`/`, `/play/`).

---

## 1. Почему письма «нет»

| Причина | Что видит игрок | Что делать |
|---------|-----------------|------------|
| **Встроенная почта Supabase** | Письмо не приходит на Яндекс / Mail.ru / иногда Gmail | Настроить **Custom SMTP** (ниже) |
| Confirm email **выключен** | Письма нет, аккаунт сразу активен | Нормально для тестов; для продакшена обычно включают |
| Повторная регистрация того же email | «Уже зарегистрирован» / тишина | Анти-enumeration: письмо не шлётся повторно |
| Redirect URL **не в allowlist** | Письмо есть, клик → ошибка redirect | Добавить origin в Redirect URLs |
| Спам / «Промоакции» | Письмо лежит в другой папке | Проверить спам; свой SMTP + From своего домена |

Пока SMTP не настроен — вход через **Google / Яндекс / Apple / VK** надёжнее, чем ждать письмо.

---

## 2. Supabase: Email provider

1. Откройте [Supabase Dashboard](https://supabase.com/dashboard) → ваш проект.
2. **Authentication** → **Providers** → **Email**.
3. Включите **Enable Email provider**.
4. **Confirm email**:
   - **ON** — после регистрации нужно письмо (нужен SMTP для РФ-почт).
   - **OFF** — сразу можно войти без письма (удобно для LAN-тестов).
5. Save.

6. **OTP expiry** (Authentication → Providers → Email, или Auth settings):  
   если предупреждение *«OTP expiry exceeds recommended threshold»* — поставьте **≤ 3600 секунд** (лучше **1800** = 30 мин).  
   Это срок жизни кода/ссылки в письме (confirm / magic link / recovery), не «сессия игрока».

Опционально: **Secure email change** — желательно ON; **Require current password** — ON (в ЛК есть форма смены пароля).

---

## 3. Redirect URLs (обязательно)

**Authentication** → **URL Configuration**:

### Site URL

Прод-домашняя, например:

```
https://up2down.online
```

или зеркало `https://up2down.ru` — один «канон»; остальные только в Redirect URLs.

### Redirect URLs (по одной строке, Add)

Добавьте **все** origin’ы, с которых регистрируетесь и куда должна вести ссылка из письма:

```
https://up2down.online/**
https://up2down.online/play/
https://up2down.ru/**
https://up2down.ru/
http://localhost:5173/**
http://localhost:3001/play/
http://127.0.0.1:3001/play/
http://ВАШ_LAN_IP:3001/play/
```

Примеры для вечеринки (подставьте свой IP из Wi‑Fi):

```
http://192.168.1.113:3001/play/
http://192.168.0.10:3001/play/
```

Wildcard `http://192.168.*:3001/**` в Supabase **не всегда** принимается — надёжнее явный IP или тестировать с Confirm email = OFF на LAN.

Также для OAuth (не письма, но рядом в том же списке) должны быть:

```
https://up2down.online/auth-callback.html
https://up2down.ru/auth-callback.html
http://ВАШ_IP:3001/play/auth-callback.html
http://localhost:5173/auth-callback.html
```

Save.

---

## 4. Custom SMTP (рекомендуется для Яндекс / Mail.ru)

**Project Settings** (шестерёнка) → **Authentication** → раздел **SMTP Settings**  
(в новых UI иногда: **Project Settings** → **Auth** → SMTP).

Включите **Enable Custom SMTP**.

### Поля

| Поле | Пример (Resend) | Пример (Mailgun EU) |
|------|-----------------|---------------------|
| Sender email | `noreply@ваш-домен.ru` | то же |
| Sender name | `Up&Down` | то же |
| Host | `smtp.resend.com` | `smtp.eu.mailgun.org` |
| Port | `465` (SSL) или `587` (STARTTLS) | `587` |
| Username | `resend` | `postmaster@mg.ваш-домен…` |
| Password | API key провайдера | SMTP password |

**Важно:** Sender email должен быть на **верифицированном** домене у SMTP-провайдера. Иначе письма снова уйдут в спам или отбросятся.

### Вариант A — Resend (простой старт)

1. [resend.com](https://resend.com) → Sign up.
2. Domains → Add → DNS-записи (SPF/DKIM) у регистратора домена → Verify.
3. API Keys → Create → скопировать.
4. В Supabase SMTP:
   - Host `smtp.resend.com`
   - Port `465`
   - User `resend`
   - Pass = API key
   - Sender = `noreply@ваш-домен` (на верифицированном домене)

Документация: [Resend + Supabase](https://resend.com/docs/send-with-supabase-smtp).

### Вариант B — Mailgun / SendGrid / Postmark / Amazon SES

Аналогично: верифицировать домен → взять SMTP credentials → вписать в Supabase.  
Для РФ-получателей часто лучше домен `.ru` / нейтральный хостинг DNS, не «подозрительный» From.

### Вариант C временно без своего домена

Некоторые провайдеры дают тестовый From вроде `onboarding@resend.dev` — только для **ваших** тестовых ящиков, не для игроков.

---

## 5. Шаблоны писем (опционально)

**Authentication** → **Email Templates**:

- Confirm signup
- Magic Link
- Reset password
- Change email

Можно поменять тему/текст на русский. Плейсхолдеры `{{ .ConfirmationURL }}` / `{{ .Token }}` не удалять.

---

## 6. Проверка по шагам

1. Confirm email = ON, SMTP сохранён.
2. Incognito → ваш origin (прод или `http://IP:3001/play/`).
3. Войти → Регистрация → новый email (Яндекс или Mail.ru).
4. Через 1–2 мин письмо; открыть ссылку **на том же устройстве/браузере**, куда хотели войти.
5. Должны оказаться на домашней `/play/` (или `/`) уже в сессии.

Если письма нет:

- Dashboard → **Authentication** → **Users** — пользователь появился?
- SMTP-провайдер → Logs / Activity — была ли отправка?
- Spam на почте.
- Redirect URL точно в allowlist для этого origin.

---

## 7. Связь с кодом игры

- `getEmailConfirmRedirectTo()` в `src/lib/nativeAuth.ts` — домой SPA, не oauth callback.
- После успешной регистрации UI показывает «проверьте почту» или «аккаунт готов» если Confirm выключен (`needsEmailConfirm`).

Менять клиент под SMTP **не нужно** — только Dashboard + DNS.
