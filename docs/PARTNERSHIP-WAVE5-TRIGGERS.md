# Волна 5: триггеры partnership и Cash Arena

См. также [PARTNERSHIP-AU-CALL-GUIDE.md](./PARTNERSHIP-AU-CALL-GUIDE.md), [SOLO-OWNERSHIP-CHECKLIST.md](./SOLO-OWNERSHIP-CHECKLIST.md).

## Триггеры (≥2 из 3)

- [ ] 500+ MAU онлайн **или** 50+ CC-турниров завершено
- [ ] Пользователи запросили покупку CC
- [ ] PSP отказал solo / физлицу — нужен AU entity

## Чеклист волны 5

1. [ ] MOU подписан (equity, vesting, roles)
2. [ ] Pty Ltd (или иная юрисдикция по lawyer)
3. [ ] Gambling lawyer: AU + 1 целевая страна
4. [ ] `VITE_CASH_ARENA_ENABLED=true` только после legal sign-off
5. [ ] Geo-block: RU, AU (если lawyer требует)
6. [ ] KYC vendor выбран
7. [ ] PSP merchant account на entity
8. [ ] Separate ToS для Cash Arena

## Feature flags

| Flag | Default | Волна |
|------|---------|-------|
| `VITE_CASH_ARENA_ENABLED` | false | 5 |
| `VITE_GEO_RU_CC_ONLY` | true | 1+ |
| `VITE_CC_LEDGER_ENABLED` | false | 3 |
| `VITE_PUBLIC_HALL_ENABLED` | false | 2 |
| `VITE_CC_TOURNAMENTS_ENABLED` | false | 4 |

## Не делать до волны 5

- Real-money buy-in / payout
- Crypto wallet in-app
- Marketing «выиграй деньги» в РФ
