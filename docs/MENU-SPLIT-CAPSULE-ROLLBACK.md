# Split Capsule — откат

## v1 — две половины без рельсы режима

Сохранён **вариант v1** (две половины без общего глифа режима), дата: 2026-07-12.

| Файл | Содержимое |
|------|------------|
| `src/ui/_rollback/MenuPlaySplitCapsule.v1-two-halves.tsx` | Компоненты v1 |
| `src/ui/_rollback/menu-split-capsule.v1.css` | CSS v1 |

## v2 — левая рельса «Онлайн/Офлайн»

Сохранён **вариант v2** (глиф + вертикальная подпись + неоновая точка в левой секции), дата: 2026-07-12.

| Файл | Содержимое |
|------|------------|
| `src/ui/_rollback/MenuPlaySplitCapsule.v2-left-rail.tsx` | `MenuPlaySplitCapsule` с mode-rail слева |
| `src/ui/_rollback/menu-split-capsule.v2-left-rail.css` | CSS блок `.menu-split-capsule*` для v2 |

### Как откатиться на v2 (левая рельса)

1. В `src/ui/MenuEntryActions.tsx` заменить `SplitCapsuleModeCrest` + `MenuPlaySplitCapsule` на код из `MenuPlaySplitCapsule.v2-left-rail.tsx` (встроить `SplitCapsuleHalf`, убрать лишние props в экспорте).
2. В `src/index.css` заменить блок `/* Split Capsule B4` на содержимое `menu-split-capsule.v2-left-rail.css`.
3. `npx tsc --noEmit`, проверить главное меню.

## Текущая версия (B4 crest)

**Mode crest** — глиф + «Онлайн»/«Офлайн» + индикатор по центру капсулы, над вертикальным разделителем между половинками. Левая рельса убрана.

## Как откатиться на v1

1. Заменить компонент и CSS на файлы v1 (см. выше).
2. Проверить меню без левой рельсы и без crest.
