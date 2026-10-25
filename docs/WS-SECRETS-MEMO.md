# Памятка: секреты для игрового WS (владелец)

Нужны **три** значения + одна строка URL.  
Передавать техдиру **лично** (избранное / файл 1:1) — **не** в общий чат и **не** в git.

Шаблон: [deploy/updown-ws.env.example](../deploy/updown-ws.env.example).  
DNS поддомена (отдельно): [DNS-GAME-UP2DOWN.md](./DNS-GAME-UP2DOWN.md).

---

## Куда кликать в Supabase

1. Открой [https://supabase.com/dashboard](https://supabase.com/dashboard).  
2. Выбери **свой проект** Up&Down (не Organization).  
3. Слева внизу иконка **шестерёнки** → **Project Settings**.  
4. В меню слева внутри Settings → пункт **API**  
   (полный путь: **Project Settings → API**).

На этой странице лежат URL и ключи. Ниже — что именно копировать.

---

## 1. `SUPABASE_URL` — что копировать

На странице **API**:

| Поле на экране | Копировать? |
|----------------|-------------|
| **Project URL** | **Да** — целиком, вида `https://abcdefgh.supabase.co` |
| Project API keys / anon | нет |
| service_role | нет (это п. 3) |

В файл для техдира:

```env
SUPABASE_URL=https://abcdefgh.supabase.co
```

---

## 2. `SUPABASE_JWT_SECRET` — Legacy, не ECC

Наш сервер проверяет токены алгоритмом **HS256**. Ему нужен только:

### **Legacy JWT secret (still used)**  
«Used only to verify JWTs.»

| Вариант в UI | Нужен? |
|--------------|--------|
| **Legacy JWT secret (still used)** | **Да — копируй его** (Reveal / Copy) |
| ECC (P-256) / новый JWT Signing Key | **Нет** — наш WS его не понимает |
| JWKS URL | **Нет** |
| anon / service_role keys | **Нет** (это другие строки) |

Текст вроде «Legacy JWT secret has been migrated to new JWT Signing Keys» — нормально: legacy **всё ещё жив** для проверки старых JWT (anon/service_role и сессии пользователей). Пока у тебя есть блок **«Legacy JWT secret (still used)»** — бери **его**.

В файл:

```env
SUPABASE_JWT_SECRET=очень_длинная_строка_из_Reveal
```

Если блока Legacy нет совсем (только ECC) — напиши мне: тогда меняем код сервера под новый тип ключей. **Сейчас код ждёт Legacy.**

---

## 3. `SUPABASE_SERVICE_ROLE_KEY` — что копировать

На той же странице **API** → блок **Project API keys** (иногда «Legacy API keys»).

| Ключ | Копировать? |
|------|-------------|
| `anon` / `public` | **Нет** (он уже на фронте в `VITE_`) |
| **`service_role`** (`secret`) | **Да** — Reveal → Copy |

Это длинный JWT, часто начинается с `eyJ...`.  
**Никогда** в Vercel `VITE_*`, в git, в общий чат.

```env
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Если видишь новые **publishable** / **secret** API keys — для нашего текущего WS всё ещё нужен классический **`service_role`**, пока не перейдём на новый тип.

---

## 4. `PUBLIC_WS_URL` (не секрет)

```env
PUBLIC_WS_URL=wss://game.up2down.online
```

---

## Мини-файл техдиру (собери так)

```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_JWT_SECRET=...только Legacy JWT secret...
SUPABASE_SERVICE_ROLE_KEY=...только service_role...
PUBLIC_WS_URL=wss://game.up2down.online
```

Он кладёт это в `/etc/updown/ws.env` (`chmod 600`).

---

## Проверка у себя

```powershell
npm run server:build
$env:WS_AUTH='required'
$env:SUPABASE_JWT_SECRET='<Legacy JWT secret>'
$env:SUPABASE_URL='https://xxxxx.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY='<service_role>'
$env:ROOM_PERSIST='1'
$env:PORT='3011'
node server/dist/index.js
```

Другой терминал: `curl.exe http://127.0.0.1:3011/api/ready`  
Ждём: `"ready":true`, `"auth":"required"`, `"jwtConfigured":true`.

Без боевых секретов (механика): `npm run server:prod-gate-local`.  
С облаком: `$env:GATE_FULL_SUPABASE='1'; npm run server:prod-gate-local`.
