<!--
  RUNBOOK-ID: UPNDOWN-ONLINE-MAINT-2026-04-26
  Назначение: единая операционная память по фоновому тику онлайн-комнат,
  Edge Function online-room-maintenance, pg_cron, Vault и типовым сбоям.
  Продуктовая логика фаз комнаты и RPC — в docs/ONLINE-ABSENT-HOST.md
-->

================================================================================
**RUNBOOK-ID: `UPNDOWN-ONLINE-MAINT-2026-04-26`**

Фоновый тик онлайн-комнат · Edge `online-room-maintenance` · Cron · Vault · JWT  
*Не удалять без замены на актуальный runbook — здесь зафиксировано «как заведено в проде».*
================================================================================

## Зачем это вообще нужно

Один вызов Postgres-RPC **`updown_online_room_maintenance_tick()`** (только роль **`service_role`**) делает два вида обслуживания:

1. **`updown_auto_transfer_host_if_stale`** — если комната в **`room_phase = 'playing'`**, хост не обновлял **`host_last_seen_at`** дольше порога (в миграции — порядка **90 с**), назначается другой хост из слотов с живым `userId`.
2. **`updown_absent_wait_expired_tick`** — если фаза **`waiting_return`** и истёк **`absent_until`**, фаза снова становится **`waiting_host_action`**.

Без периодического вызова тика эти ветки **не срабатывают сами**. Клиентское приложение этот RPC **не вызывает** — только инфраструктура (Edge + Cron или `pg_cron` и т.д.).

Контекст фаз комнаты, выход игрока, `host_resolve`, передача хоста — в **[`ONLINE-ABSENT-HOST.md`](./ONLINE-ABSENT-HOST.md)**.

---

## Что сделано в репозитории (код / SQL / конфиг)

| Артефакт | Смысл |
|----------|--------|
| `supabase/functions/online-room-maintenance/index.ts` | Edge Function: читает `SUPABASE_URL` и **`SUPABASE_SERVICE_ROLE_KEY`** из окружения, вызывает **`updown_online_room_maintenance_tick()`**, возвращает JSON `{ ok, data \| error }`. |
| `supabase/migrations/20260427120000_game_rooms_room_phase_absent_host.sql` | Базовая схема: поля комнаты, RPC тика, `mark_absent`, `host_resolve`, и т.д. |
| `supabase/migrations/20260428103000_mark_absent_transfer_host_if_leaver_was_host.sql` | Исправление: если подтверждённо выходит **текущий** `host_user_id`, в том же апдейте назначается **другой** живой игрок из слотов — иначе комната зависала в `waiting_host_action`, а гость видел баннер «ждём хоста», хотя хост уже ушёл. |
| `supabase/config.toml` | Удалён ключ **`[db].health_timeout`** — часть версий CLI Supabase его **не парсит**, из‑за этого падал `supabase db push` с ошибкой `invalid keys: health_timeout`. |
| `docs/ONLINE-ABSENT-HOST.md` | Продуктовое описание фаз и RPC; дополнены абзацы про **401** на Edge и про миграцию выше. |

Применение миграций к удалённой БД: **`npx supabase db push`** (после исправления `config.toml`).

---

## Как это заведено в Supabase (операционная схема)

1. Функция **задеплоена**: Edge **`online-room-maintenance`**, URL вида  
   `https://<PROJECT_REF>.supabase.co/functions/v1/online-room-maintenance`.

2. **Проверка JWT (legacy)** на шлюзе Edge: запрос без заголовка **`Authorization: Bearer <JWT>`** получает **401** до выполнения кода функции. Подходит **legacy anon JWT** (`eyJ...`) из **Project Settings → API** (не путать с `sb_publishable_...`, если для вашей настройки шлюз требует именно JWT).

3. **Vault** (встроено в Postgres): секреты создаются в **SQL Editor**, например:
   - имя **`project_url`** — базовый URL проекта без лишнего слэша в конце;
   - имя **`anon_key`** — строка anon JWT.

   Повторный `vault.create_secret(..., 'project_url', ...)` даёт **`duplicate key ... secrets_name_idx`** — это **нормально**, секрет уже есть; второй раз с тем же **именем** создавать нельзя.

4. **Расписание** — не внутри файла Edge, а в **Supabase Dashboard → Integrations → Cron → Jobs** (шаблон пути: `/dashboard/project/<ref>/integrations/cron/jobs`). Задача — это **`pg_cron`**: в теле вызывается **`net.http_post`** на URL функции.

---

## Рабочий шаблон Cron (эталон)

Пустые **`headers:=jsonb_build_object()`** давали **401**. Рабочий вариант — Bearer из Vault:

```sql
select cron.schedule(
  'online-room-maintenance-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/online-room-maintenance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 8000
  );
  $$
);
```

Перед созданием новой задачи старую с тем же смыслом лучше снять:

```sql
select jobid, jobname, command from cron.job;
-- затем, подставив имя:
select cron.unschedule('СТАРОЕ_jobname');
```

**`timeout_milliseconds`:** не ставить слишком мало (например 1000 ms) — холодный старт Edge может не уложиться.

---

## Как проверить, что всё живо

| Проверка | Ожидание |
|----------|----------|
| **Edge Functions →** `online-room-maintenance` **→ Invocations / Logs** | Периодически **200 POST**, не цепочка только **401**. |
| Тело ответа при 200 | Обычно `{"ok":true,"data":{...}}` с полями вроде счётчиков из тика (как вернёт RPC). |
| Логи **booted / shutdown** | Нормальное поведение serverless, не ошибка. |

---

## Если что-то пошло не так (чеклист)

### Снова 401 на вызовах

- В **Integrations → Cron → Jobs** открыть команду джоба: в **`headers`** должен быть **`Authorization: Bearer ...`**.
- Убедиться, что в Vault **`anon_key`** — именно **JWT** (`eyJ...`), не publishable-строка, если шлюз настроен на legacy JWT.
- Альтернатива (осознанно): в настройках функции выключить **Verify JWT** и защитить вызов иным способом (секрет в заголовке + проверка в коде) — в текущем репозитории отдельной проверки секрета в Edge **нет**.

### `duplicate key ... secrets_name_idx`

Секрет с таким **именем** уже создан. Не дублировать `create_secret` с тем же именем; для смены значения — удалить/обновить секрет по доке Vault или завести новое имя и поправить SQL Cron.

### `supabase db push` падает на `health_timeout`

В **`supabase/config.toml`** в секции **`[db]`** не должно быть неподдерживаемого ключа **`health_timeout`** для вашей версии CLI (уже убран в репозитории).

### Комната «зависла» после выхода хоста

Убедиться, что на базе применена миграция **`20260428103000_mark_absent_transfer_host_if_leaver_was_host.sql`** (`db push`). Логика описана в таблице выше.

### Две задачи Cron бьют одну и ту же функцию

Удалить/выключить лишнюю (**Inactive** или `cron.unschedule`), чтобы не плодить лишние вызовы и не путаться в логах.

---

## Связанные документы

- **[`ONLINE-ABSENT-HOST.md`](./ONLINE-ABSENT-HOST.md)** — фазы комнаты, RPC, UI, порядок PR.
- Официально про расписание и Jobs: [Supabase Cron quickstart](https://supabase.com/docs/guides/cron/quickstart).
- Официально про вызов Edge по расписанию: [Schedule Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions).

---

*Обновляя инфраструктуру (другой проект, другой ref, смена ключей), правь этот runbook или выпусти преемника с новым **RUNBOOK-ID** в шапке.*
