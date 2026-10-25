# Владельцу: три проверки, пока техдир недоступен

Делай по порядку. Секреты в чат/git не класть.

---

## A. Полный локальный `/api/ready` с твоим `updown-ws.env`

Нужен файл `updown-ws.env`, который готовила для техдира (рядом с проектом или в любом месте).

### PowerShell (из корня репо `D:\Projects\UpNDown`)

```powershell
cd D:\Projects\UpNDown
npm run server:build

# подставить СВОЙ путь к файлу:
Get-Content "D:\путь\к\updown-ws.env" | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
  $p = $_.Split('=', 2)
  if ($p.Length -eq 2) { Set-Item -Path "Env:$($p[0].Trim())" -Value $p[1].Trim() }
}

$env:WS_AUTH = 'required'
$env:UPDOWN_MODE = 'prod'
$env:NODE_ENV = 'production'
$env:HOST = '127.0.0.1'
$env:PORT = '3011'
$env:ROOM_PERSIST = '1'
$env:ROOM_PERSIST_PATH = "$PWD\server\data\owner-gate-rooms.json"
$env:WS_BACKUP_PORTS = 'none'

node server/dist/index.js
```

Окно не закрывай. **Второй** терминал:

```powershell
curl.exe -sS http://127.0.0.1:3011/api/ready
```

### Успех

В JSON должно быть примерно:

- `"ready": true`
- `"auth": "required"`
- `"jwtConfigured": true`
- `"supabaseConfigured": true`
- `"supabaseOk": true`
- HTTP-код **200** (не 503)

Потом в первом окне `Ctrl+C`.

### Если не так

| Симптом | Что проверить в `updown-ws.env` |
|---------|--------------------------------|
| процесс сразу падает про JWT | пустой / не тот **Legacy JWT secret** (не ECC) |
| `jwtConfigured: false` | нет `SUPABASE_JWT_SECRET` |
| `supabaseOk: false` / 503 | неверный `SUPABASE_URL` или `SERVICE_ROLE`, или нет сети до Supabase |
| `supabaseConfigured: false` | не хватает URL или service_role |

Альтернатива одной командой (если переменные уже в текущей сессии PowerShell):

```powershell
$env:GATE_FULL_SUPABASE = '1'
npm run server:prod-gate-local
```

(для этого в том же окне должны быть заданы `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` — например после `Get-Content` блока выше.)

---

## B. Фронт «под ключ» — только Preview / локаль, не Production

Шаблон переменных: [../deploy/env.ws.preview.example](../deploy/env.ws.preview.example).

### B1. Локально (когда друг скажет «ready зелёный»)

В **`.env.local`** в корне проекта (файл уже может быть — добавь/замени две строки, остальные Supabase не трогай):

```env
VITE_ONLINE_TRANSPORT=ws
VITE_WS_URL=wss://game.up2down.online
```

Перезапуск:

```powershell
npm run dev:host
```

Пока `game…` не отвечает — эти две строки **закомментируй** или убери, иначе онлайн в dev будет бить в мёртвый WS.

### B2. Vercel Preview (заранее можно завести, не включать Production)

1. [vercel.com](https://vercel.com) → проект Up&Down → **Settings → Environment Variables**.  
2. Добавь (scope = **Preview** only, не Production):

| Name | Value |
|------|--------|
| `VITE_ONLINE_TRANSPORT` | `ws` |
| `VITE_WS_URL` | `wss://game.up2down.online` |

3. **Не** ставь эти две на **Production**, пока не прошла хотя бы одна партия на Preview/локали.  
4. Когда друг сдаст ready — **Redeploy** нужного Preview (или push в ветку preview).

Production (`up2down.online` / зеркало `.ru`) — отдельный шаг после дыма.

---

## C. Миграция `finish_game_from_server` в Supabase

Файл в репо: `supabase/migrations/20260822120000_finish_game_from_server.sql`.

### Проверка «уже применена?»

1. [Supabase Dashboard](https://supabase.com/dashboard) → твой проект.  
2. Слева **SQL** → **New query**.  
3. Вставь и Run:

```sql
select
  p.proname as name,
  pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'finish_game_from_server';
```

**Есть строка** с именем `finish_game_from_server` → миграция на месте, ничего не делай.

**0 rows** → нужно применить (один раз):

4. Открой в редакторе файл  
   `supabase/migrations/20260822120000_finish_game_from_server.sql`  
5. Скопируй **весь** SQL → вставь в SQL Editor → **Run**.  
6. Снова выполни `select` из шага 3 — должна появиться строка.

Без этой функции сервер может играть, но запись матча/Elo с WS в облако не пройдёт (`service_role` вызовет RPC и получит ошибку).
