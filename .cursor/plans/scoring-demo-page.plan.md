---
name: Демо фишки и победитель
overview: "Демо-страница /scoring-demo с листанием 6 способов; подсветка памяти (1,5) и интереса (3,4). Код готов к вставке после смены на Agent mode."
todos:
  - id: add-scoring-module
    content: Создать src/game/partyMoneyScoring.ts
    status: pending
  - id: add-demo-page
    content: Создать src/ui/ScoringDemoPage.tsx
    status: pending
  - id: wire-main
    content: Подключить /scoring-demo в main.tsx
    status: pending
  - id: menu-link
    content: Кнопка в App.tsx «Демо фишки и победитель»
    status: pending
isProject: true
---

# Демо-страница (апрув пользователя)

Пользователь: похоже вариант 1 (середина), возможно 5; интересны 3 и 4.

## Файлы

1. `src/game/partyMoneyScoring.ts` — расчёты + SCORING_DEMO_PARTY
2. `src/ui/ScoringDemoPage.tsx` — UI, листание, быстрые кнопки на 1/3/4/5
3. `main.tsx` — `isScoringDemo`, рендер без devMode guard
4. `App.tsx` — кнопка в меню для всех

## Открыть

`/scoring-demo` или кнопка в главном меню.

## В игре позже

По умолчанию `vs_average`; 3 и 4 — опционально в настройках.
