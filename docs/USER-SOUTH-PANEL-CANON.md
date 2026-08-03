# Панель пользователя · Юг (ПК / планшет)

Канон размеров и раскладки — **не** размазывать по `index.css` / plasma.

| Файл | Роль |
|------|------|
| [`src/styles/user-south-panel.css`](../src/styles/user-south-panel.css) | CSS: padding, ширина, имя (космическая плашка только ПК), layout по режимам |
| [`src/ui/userSouthPanelCanon.ts`](../src/ui/userSouthPanelCanon.ts) | TS: `sizePx` аватара, `panelScale` взяток, укорочение имени |
| `src/index.css` | Общие layout-примитивы Юга (flex/grid-база); режимные размеры — только комментарий → канон |
| `src/styles/plasma-badge-pc-no-outer-glow.css` | Plasma-бейдж / север 4p / opponent padding — **без** Юга |

## Режимы

| Режим | Класс на `.game-table-root` | Аватар | Pad-y | Имя |
|-------|----------------------------|--------|-------|-----|
| PC 3p/4p | `:not(.viewport-mobile):not(.game-table-tablet-pc)` | 58 play / 70 bid | **11/11** (9/8 +2/+3) | космическая плашка + Cormorant |
| Tablet 3p/4p | `.game-table-tablet-pc` | 38 / 54 | 7 | под аватаром, без плашки |
| Mobile | `.viewport-mobile` | свой DOM | — | **не трогать** этими файлами |

Планшет · стол: 3p `translateY(-18px)`, 4p `translateY(2px)` (−10px вниз от прежних −28 / −8).

Загрузка CSS: последним в `main.tsx` (+ дубль после plasma в `GameTable.tsx` для HMR).

После правок Юга — hard refresh; не добавлять новые `padding-top` для Юга в `index.css`.
