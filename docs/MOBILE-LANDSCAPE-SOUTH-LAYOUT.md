# Мобильный landscape · панель Юга

## Эталонный viewport

Раскладка **панель Юга слева + рука справа** (фиксированная ширина панели как при 9 картах, нижняя рельса заказа, имя, очки) откалибрована под:

| Параметр | Значение |
|----------|----------|
| Минимальная ширина | **660 px** |
| Минимальная высота | **330 px** |
| Ориентация | landscape |
| Эталон для проверки | **660×330** |

На viewport **меньше** 660×330 режим включается (см. `MOBILE_LANDSCAPE_MQ`), но вёрстка **не гарантируется** — возможны наложения, обрезка руки и панели.

## Источник правды в коде

- Константы и проверка: [`src/ui/mobileLandscapeSouthLayout.ts`](../src/ui/mobileLandscapeSouthLayout.ts)
- Класс на корне стола при выполнении порога: `viewport-mobile-landscape-south-tuned`
- CSS-переменные: `--mobile-landscape-south-tuned-min-w`, `--mobile-landscape-south-tuned-min-h` (в `index.css`, блок landscape)
- Логика ширины панели: `GameTable.tsx` (`useLayoutEffect` · `mobileLandscapePanelFixedWidthPx`)
- На эталоне **249 px** — константа `MOBILE_LANDSCAPE_SOUTH_PANEL_FIXED_REFERENCE_W_PX` (не DOM-замер, одинаково во всех браузерах)

## Как проверять

1. DevTools → эмуляция устройства → **660×330**, landscape.
2. Офлайн-игра, мобильный breakpoint (≤1024px).
3. Панель Юга слева, вровень с Западом по левому краю; рука справа; при 9 и ≤8 картах ширина панели не «прыгает».

Для регрессии также полезно **720×360** и реальное устройство с landscape.

## Доработка для меньших экранов

Отдельная задача: fallback-раскладка или дополнительное ужатие при `viewport-mobile-landscape` без класса `viewport-mobile-landscape-south-tuned`.
