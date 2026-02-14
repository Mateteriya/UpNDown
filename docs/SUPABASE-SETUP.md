# Настройка Supabase для авторизации

## 1. Создать проект

1. Зайдите на [supabase.com](https://supabase.com) и войдите.
2. Создайте новый проект (или используйте существующий).
3. Дождитесь завершения создания.

## 2. Получить ключи

1. В панели проекта: **Settings** → **API**.
2. Скопируйте:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** (ключ) → `VITE_SUPABASE_ANON_KEY`

## 3. Настроить переменные окружения

1. В корне проекта создайте файл `.env.local` (он в .gitignore).
2. Добавьте:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

3. Перезапустите `npm run dev`.

## 4. Включить Email-авторизацию

1. В панели: **Authentication** → **Providers**.
2. **Email** должен быть включён (по умолчанию включён).
3. При желании отключите **Confirm email** для быстрого теста (иначе после регистрации нужно подтвердить почту).

## 5. Вход через GitHub и Google (OAuth)

В модалке входа доступны кнопки «GitHub» и «Google». Чтобы они работали, настройте провайдеров в Supabase.

### Важно: URL для редиректа

После входа через Google/GitHub Supabase возвращает пользователя по **Redirect URL**. Если приложение открыто на порту 5197, а редирект идёт на 3000 — значит в Supabase указан неверный URL.

**Supabase** → **Authentication** → **URL Configuration**:

1. **Site URL** — основной адрес приложения, например:
   - для разработки: `http://localhost:5197` (если используете порт 5197)
   - для доступа с телефона по Wi‑Fi: `http://192.168.1.5:5197` (подставьте IP вашего компьютера)
   - для продакшена: `https://yourdomain.com`

2. **Redirect URLs** — добавьте все адреса, с которых может открываться приложение:
   - `http://localhost:5197`
   - `http://127.0.0.1:5197`
   - `http://192.168.1.5:5197` (IP вашего ПК в локальной сети)
   - и т.п.

Без этого Supabase будет использовать дефолтный `http://localhost:3000`, и после OAuth откроется неверная страница.

### GitHub

1. [GitHub → Settings → Developer settings → OAuth Apps](https://github.com/settings/developers) → **New OAuth App**.
2. **Application name:** Up&Down (или любое).
3. **Homepage URL:** `http://localhost:5173` (для разработки) или ваш домен.
4. **Authorization callback URL:** возьмите из Supabase: **Authentication** → **Providers** → **GitHub** — там указан Callback URL (например `https://xxxxx.supabase.co/auth/v1/callback`).
5. Скопируйте **Client ID** и **Client Secret**.
6. Supabase: **Authentication** → **Providers** → **GitHub** → включите, вставьте Client ID и Secret.

### Google

1. [Google Cloud Console](https://console.cloud.google.com/) → создайте проект или выберите существующий.
2. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**.
3. Тип: **Web application**. Добавьте:
   - **Authorized JavaScript origins:** `http://localhost:5173`, ваш домен.
   - **Authorized redirect URIs:** Callback URL из Supabase (**Authentication** → **Providers** → **Google**).
4. Скопируйте **Client ID** и **Client Secret**.
5. Supabase: **Authentication** → **Providers** → **Google** → включите, вставьте Client ID и Secret.

### «Введите email» при входе через Google

Если при нажатии «Google» открывается страница с полем для ввода email — это стандартное поведение Google, когда:
- на устройстве не выполнен вход в Google;
- используется режим инкогнито;
- браузер запрашивает выбор аккаунта.

Пользователю нужно ввести свой Gmail и продолжить — это не ошибка приложения.

### Яндекс

Яндекс не входит в список встроенных провайдеров Supabase. Для поддержки потребуется отдельная интеграция (например, через Keycloak или свой бэкенд).

## 6. Проверка

- Нажмите «Вход» в меню.
- Зарегистрируйтесь (email + пароль) или войдите через GitHub/Google.
- Если включено подтверждение почты — проверьте почту и перейдите по ссылке.
- Войдите — в меню должна появиться кнопка «Выйти (ваш_email)».

## 7. Таблица профилей (для синхронизации имени и аватара)

Чтобы профиль синхронизировался между устройствами, создайте таблицу в Supabase:

1. В панели: **SQL Editor** → **New query**.
2. Вставьте и выполните SQL из файла `supabase/migrations/20250214000000_create_profiles.sql`.

Либо выполните вручную:

```sql
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  display_name text not null default 'Вы',
  avatar_data_url text,
  profile_id text not null default '',
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can read own profile" on public.profiles for select using (auth.uid() = user_id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = user_id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = user_id);
create policy "Users can delete own profile" on public.profiles for delete using (auth.uid() = user_id);
```

## Без настройки

Если `.env.local` не создан или ключи не заданы, приложение работает в офлайн-режиме: кнопка «Вход» открывает модалку, при отправке формы показывается «Сервер не настроен».
