# Панель пользователя · Юг (ПК / планшет)

Канон размеров и раскладки — **не** размазывать по `index.css` / plasma.

| Файл | Роль |
|------|------|
| [`src/styles/user-south-panel.css`](../src/styles/user-south-panel.css) | CSS: padding, ширина, имя (плашка «кабинет» на ПК и планшете), layout по режимам |
| [`src/ui/userSouthPanelCanon.ts`](../src/ui/userSouthPanelCanon.ts) | TS: `sizePx` аватара, `panelScale` взяток, укорочение имени |
| `src/index.css` | Общие layout-примитивы Юга (flex/grid-база); режимные размеры — только комментарий → канон |
| `src/styles/plasma-badge-pc-no-outer-glow.css` | Plasma-бейдж / север 4p / opponent padding — **без** Юга |

## Режимы

| Режим | Класс на `.game-table-root` | Аватар | Pad-y | Имя |
|-------|----------------------------|--------|-------|-----|
| PC 3p/4p | `:not(.viewport-mobile):not(.game-table-tablet-pc)` | 66 play / 70 bid | **11/11** (9/8 +2/+3) | плашка «кабинет» 19px; розыгрыш max **180px**; >9 после заказа **14px** + hover |
| Tablet 3p/4p | `.game-table-tablet-pc` | 50 / 58 | 7 | как ПК: база **17px**, компакт **12px**; розыгрыш max **155px** |
| Mobile | `.viewport-mobile` | свой DOM | — | портрет max **217px**; landscape max **132px**, 1 строка, fade+scroll, кегль 11–14; без «…» / two-line |

Планшет · стол: 3p `translateY(-18px)`, 4p `translateY(2px)` (−10px вниз от прежних −28 / −8).

Загрузка CSS: последним в `main.tsx` (+ дубль после plasma в `GameTable.tsx` для HMR).

После правок Юга — hard refresh; не добавлять новые `padding-top` для Юга в `index.css`.
