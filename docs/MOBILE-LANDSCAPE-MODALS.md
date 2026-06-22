# Мобильный landscape · модалки и оверлеи

## Эталонный viewport

Как у панели Юга: **660×330**, landscape, мобильный breakpoint (≤1024px).

| Параметр | Значение |
|----------|----------|
| Ширина | 660 px |
| Высота | 330 px |
| Класс стола | `viewport-mobile viewport-mobile-landscape` |
| Калибровка Юга | `viewport-mobile-landscape-south-tuned` при ≥660×330 |

## Правило порталов

Модалки и оверлеи рендерятся в `document.body`. Их корень **обязан** получать те же классы, что и `game-table-root` на столе:

- Хелпер: [`src/ui/mobileLandscapePortalRoot.ts`](../src/ui/mobileLandscapePortalRoot.ts) → `buildMobileGamePortalRootClass()`
- В `GameTable`: `mobilePortalRootClass` (useMemo)
- В `DealResultsMobileModalOverlay`: prop `portalRootClass`

Без `viewport-mobile-landscape` landscape-CSS на порталах не срабатывает.

## Чеклист проверки (660×330)

### Между раздачами (оверлей 2×2)

- [ ] Завершить раздачу — панель влезает в экран, не обрезается снизу
- [ ] Цифры и имена читаемы, без гигантских отступов
- [ ] Схлопывание к кнопке Σ без скачка

### Модалка «Результаты» (Σ)

- [ ] Открыть на 5-й и 20-й раздаче
- [ ] Таблица скроллится, капсула stretch работает
- [ ] Док «Выигрыш» не перекрывает таблицу критично
- [ ] Закрытие по backdrop / Escape

### Прочие модалки

- [ ] Итоги партии (game over)
- [ ] Последняя взятка
- [ ] Подтверждения: новая игра, выход, в меню
- [ ] Меню аватара
- [ ] Инфо по клику на аватар оппонента

### Регрессия

- [ ] Портрет мобилки (375×667) — без изменений
- [ ] ПК (≥1025px) — без изменений

## CSS-точки входа

| UI | Селектор (landscape) |
|----|----------------------|
| Оверлей раздачи | `.viewport-mobile.viewport-mobile-landscape .deal-results-overlay-animation` |
| Модалка Σ | `.deal-results-modal-overlay-mobile.viewport-mobile-landscape` |
| Общие токены | `--mobile-landscape-modal-pad`, `--mobile-landscape-modal-max-h` |
| Game over | `.game-over-dialog.viewport-mobile-landscape` |
| Last trick | `.last-trick-modal-card` внутри портала |
| Confirms | `[role=dialog].viewport-mobile-landscape > div` |

## Связанные файлы

- [`src/ui/GameTable.tsx`](../src/ui/GameTable.tsx) — порталы, measure модалки Σ
- [`src/ui/dealResultsModalStretch.ts`](../src/ui/dealResultsModalStretch.ts) — layout таблицы + высота tbody
- [`src/index.css`](../src/index.css) — landscape-блоки модалок
- [`docs/MOBILE-LANDSCAPE-SOUTH-LAYOUT.md`](./MOBILE-LANDSCAPE-SOUTH-LAYOUT.md) — раскладка стола
