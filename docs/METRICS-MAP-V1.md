# Карта метрик v1 → v1.6 (персональная статистика + рекорды)

Зафиксировано при внедрении skill-слоя (2026-10); **v1.6** — зал рекордов, тиры итога 300–1000+, расширенные стили, публичный Hall of Fame (облако). ELO остаётся главным рейтингом силы; точность заказов и соседние метрики — **вторая ось** (характер + соревнование с собой), не замена победе.

См. также: [PLAN-RATING-ELO-HISTORY-TIERS.md](./PLAN-RATING-ELO-HISTORY-TIERS.md), [PLAN-DALEE.md](./PLAN-DALEE.md).

## Слои

| Слой | Что считает | Где в UI | v1 / v1.6 |
|------|-------------|----------|-----------|
| Ladder (сила) | ELO / место в rated-онлайне | Таблица лидеров | без изменений; **точность в строку лидера не тащим** |
| Skill (заказ) | точность, недобор/перебор, серии, **flavor стиля** | ЛК, RatingModal, post-game | **да** + long/tip/flavor |
| Progress | офлайн/онлайн, тренд, тиры ELO, яркие раздачи | ЛК | **да** (v1.5) |
| Records | итоги 300–1000+, exact 8–10, perfect party | ЛК «Зал рекордов», post-game | **v1.6** (local + archive backfill) |
| Hall of Fame | публичные highlights из облака | Leaderboard вкладка | **v1.6** (default rated online) |
| Goals / Rewards | lifetime-вехи → бейджи/титулы + рамки авы | ЛК + AvatarEditor | **да** + party_300/400/500, exact_deal_10 |
| Analytics (premium) | heatmap, режимы, тренды | stub / подписка | документ + hint в ЛК |

## Уже было

- `LocalRating`: games / wins / средняя точность партий
- Онлайн summary: games / rated / wins / points
- Post-game: точность по игрокам за партию
- Архив: `dealHistory` с `bids` + `takens` (IndexedDB)
- Облако per-match: `match_players.bid_accuracy`

## Free — ЛК «Моя статистика»

- Игры / победы / win% (из рейтинга; при backfill v2 — sync из архива, если games был 0)
- Герой: точность по **раздачам** (`exact / deals`) + пояснение
- Полоса и доли: точно / недобор / перебор
- Характер стиля (снайпер / охотник / осторожный / …) + bias-инсайт
- Среднее место, рекорд серии, текущая серия, победы/партии
- Hint: подробный разбор — в подписке (stub)

## Free — Goals / Rewards (lifetime MVP)

- Каталог вех: серии точных (5/10), N точных раздач (25/100), 10 онлайн-побед, уровни ELO adept/expert, закреплённый стиль
- Награды: бейджи / титулы + косметика рамок (`orbit` за серию≥5, `neon` за 10 онлайн-побед; `cosmic` всегда free)
- Премиум-рамки tech/science: `gold` (Адепт), `saturn` (серия×10), `neural` (стиль + 50 точных), `pulsar` (25 онлайн-побед)
- Персист: `localStorage` `updown_achievements_{profileId}` (без Supabase в v1)
- UI: блок «Цели и награды» в ЛК (избранные вехи + лента наград); гейт рамок в AvatarEditor
- Weekly-челленджи — **v2**, не в этой волне

## Free — RatingModal

- Компактный skill-блок: точность + недобор/перебор (+ среднее место / серия при наличии)

## Free — post-game

- Плашка «Ваш заказ»: точность партии, N точно / недобор / перебор
- Один insight: сравнение со средней на устройстве **или** худшая раздача партии
- Только в expanded (не раздувать celebration)

## Free — блок «Прогресс» (v1.5)

- Карточки **офлайн / онлайн** (архив + cloud summary для онлайн, если локально пусто)
- **Тренд** точности и среднего места (последние N vs предыдущие N) + sparkline
- **Уровни ELO** (клиентская таблица тиров) + место в топе + сравнение с серединой лидерборда
- **Лучшие / худшие раздачи** (топ-3) из локального архива
- Глобальный compare **точности** с полем — ещё не в free (stub / premium)

## Premium (cosmetic + analytics stubs)

- Рамки «Золото» / «Сатурн» / «Нейросеть» / «Пульсар» — вехи + `isMilestoneCosmeticPremiumEnabled` (сейчас stub `true` для теста; в проде — подписка)
- Разбивка по типам раздач (когда тип стабильно пишется в архив)
- Heatmap заказ × взято
- Полный топ просадок / тренд 30 дней
- Облачный skill-профиль + отдельный board «Точность» (только rated)
- Сравнение точности с медианой поля
- Тема карт как вторая косметика — задел (`CARD_THEME_COSMETIC_PLANNED`), не полный рескин в MVP

## Данные на устройстве

- Инкремент при конце офлайн-партии → расширенный `LocalRating` (`exactDeals` / `underDeals` / `overDeals` / place / streaks)
- One-shot backfill из IndexedDB (`skillVersion`), если counters пустые
- Чистая логика: `src/game/playerSkillStats.ts`, вехи: `src/game/playerMilestones.ts`

## v1.6 — рекорды и зал славы

- Детектор: `src/game/matchHighlights.ts` (тиры итога, exact ≥8, perfect, серии)
- Личный store: `src/game/playerRecords.ts` (`updown_records_{profileId}`) + backfill из IndexedDB
- UI: `PlayerRecordsHallPanel`, celebration в game-over
- Облако: таблица `match_highlights`, RPC `updown_get_hall_of_fame` / `updown_insert_match_highlights`
- Публичный дефолт scope = `rated_online`; вкладки online_all / offline_cloud

## Вне scope v1 / v1.6

- Миграции Supabase / колонки `player_ratings` под avg accuracy
- Публичный лидерборд точности
- Mode breakdown / heatmap UI
- Cloud sync всех ачивок / anti-cheat
- IAP / реальный entitlement (только флаги-stub)
- Недельные челленджи (Goals v2)
