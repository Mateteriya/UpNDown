# Solo ownership (волны 1–4)

Минимум бюрократии до волны 5 (Cash Arena).

## Владение активами

- [ ] Домен и бренд Up&Down — на ваше имя
- [ ] GitHub repo — ваш аккаунт (AU-друг — collaborator при Go)
- [ ] Supabase project — ваш; secrets в `.env.local` только у вас
- [ ] Vercel/hosting — ваш аккаунт

## Feature flags

См. [`src/lib/productFlags.ts`](../src/lib/productFlags.ts):

- `CASH_ARENA_ENABLED` — `false` до волны 5
- `GEO_RU_CC_ONLY` — `true` (РФ: только CC, без cash-out)
- `CC_LEDGER_ENABLED` — включается на волне 3
- `PUBLIC_HALL_ENABLED` — включается на волне 2

Env overrides: `VITE_CASH_ARENA_ENABLED`, `VITE_GEO_RU_CC_ONLY`, и т.д.

## Триггеры partnership (волна 5)

Запускать переговоры о Pty Ltd, когда **≥2 из 3**:

- [ ] 500+ MAU онлайн или 50+ CC-турниров
- [ ] Пользователи запросили покупку CC
- [ ] PSP отказал solo / физлицу — нужен AU entity

## До MOU

AU-друг может: code review, EN copy.  
Не может: director, подписант ToS, merchant account.
