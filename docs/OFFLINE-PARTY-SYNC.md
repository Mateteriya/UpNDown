# Синхронизация вечеринки / офлайн → аккаунт

Канон продукта (2026-10). См. также `partyArchive`, `partyClaim`, миграцию `20261009140000_party_claim_receipts.sql`.

## Оси (не «тип Wi‑Fi»)

| Ось | Смысл |
|-----|--------|
| LAN к хосту | Стол / QR |
| Облако доступно | Реальный Auth/API (LTE ок даже на точке доступа) |
| Сессия | Вход → аватар/история/статы с аккаунта |

## После партии без сессии

Диалог:

1. **Да, аккаунт есть** → email → квитанция + OTP/magic link → в ЛК «принять».
2. **Да, аккаунта нет** → email → ссылка регистрации; по `claimToken` партия **сразу** вешается на новый аккаунт (`intent=new_account`).
3. **Нет** → только локальный `partyArchive`.

Payload = **снимок с экрана отправителя** (его очки/фишки/точность/таблица), не «угадай Юга».

## matchKey

- Офлайн vs ИИ: новый UUID.
- Онлайн/LAN: `room:{roomId}` — один ключ на стол (склейка v2 позже).

## Деплой Supabase

Применить SQL:

`supabase/migrations/20261009140000_party_claim_receipts.sql`

Нужна рабочая почта Auth (OTP). Redirect URL должен включать ваш callback (`…/auth-callback.html` или `/play/auth-callback.html`).

## Файлы

| Файл | Роль |
|------|------|
| `src/game/matchKey.ts` | Ключи |
| `src/game/partyClaim.ts` | Outbox на устройстве |
| `src/lib/partyClaimCloud.ts` | RPC + OTP |
| `src/ui/PartyClaimOffer.tsx` | Диалог после партии |
| `src/ui/PartyClaimInbox.tsx` | ЛК: принять / отклонить |
