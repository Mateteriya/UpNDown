# Портал — лёгкая CRM для команды

Program portal (`docs-site/`) — roadmap с **общими статусами задач** для троих основателей.

## Сущности

| Уровень | В коде | Пример |
|---------|--------|--------|
| Программа / фаза | `PHASE1_GROUP_IDS`, `PHASE2_GROUP_IDS` | Фаза 1, Волна 2 |
| Направление (подпроект) | `Direction` в `data.ts` | а · Грузия, в · WebSocket |
| Трек | `APP_TRACKS` | ws, iap, cc, overview |
| Эпик / блок | `TaskGroup` в `tasks.ts` | `ws-server`, `iap-infra` |
| Задача (лист) | `TaskItem` | `ws-1`, `mob-2` |
| Веха | `Milestone` | WS локально, IAP sandbox |

**Определения задач** — в git ([`docs-site/src/portal/tasks.ts`](../docs-site/src/portal/tasks.ts)).  
**Операционное состояние** (статус, кто в работе) — в Supabase таблица `portal_task_states`.

## Статусы (волна 1)

| Статус | UI |
|--------|-----|
| `todo` | Не начато |
| `in_progress` | В работе — видно имя исполнителя |
| `done` | Готово (галочка) |

Действия (после входа через Google):

- **Взять в работу** → `in_progress` + ваше имя
- **Готово** → `done`
- **Снять** → вернуть в `todo`

## Роли (мягкая рекомендация)

В шапке портала: выпадающий список **Роль…** (`product`, `tech`, `intl`, `legal`, `all`).

Фильтр **«Рекомендовано мне»** на странице `/work` показывает открытые задачи, где `TaskItem.owner` совпадает с выбранной ролью.

Это рекомендация, не блокировка — любой авторизованный участник может взять любую задачу.

## Настройка Supabase

### 1. Миграция

Применить:

`supabase/migrations/20260529160000_portal_task_states.sql`

### 2. Redirect URLs (Authentication → URL Configuration)

- `http://localhost:5199/UpNDown/auth-callback.html`
- `https://mateteriya.github.io/UpNDown/auth-callback.html`

### 3. Локально

```bash
cp docs-site/.env.example docs-site/.env.local
# подставить VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY (те же, что у игры)
npm run handbook:dev
```

### 4. GitHub Pages (CI)

В **Settings → Secrets → Actions** репозитория:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Workflow [`deploy-portal.yml`](../.github/workflows/deploy-portal.yml) передаёт их при сборке.

## Разделы портала

| URL | Назначение |
|-----|------------|
| `#/` | Дашборд + блок «Сейчас в работе» |
| `#/work` | Фильтры: все / в работе / мои / рекомендовано |
| `#/roadmap` | Чеклисты с кнопками статуса |
| `#/app/*` | Треки WS · IAP · CC |

## Офлайн / экспорт

Без входа прогресс остаётся в **localStorage** (как раньше).  
**Экспорт / импорт JSON** в шапке — для бэкапа локальных галочек.

После входа источник правды для статусов — **Supabase**.

## Волна 2 (не в MVP)

- Realtime (без F5)
- Канбан drag-and-drop
- Подзадачи (`parentTaskId`)
- История изменений (`portal_task_events`)
