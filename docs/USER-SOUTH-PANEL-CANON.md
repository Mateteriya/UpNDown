# Панель пользователя · Юг (ПК / планшет)

| Файл | Роль |
|------|------|
| [`UserSouthPcAvatarRail.tsx`](../src/ui/UserSouthPcAvatarRail.tsx) | стек: absolute ★+имя + аватар; dock по getBoundingClientRect |
| [`south-avatar-chrome.css`](../src/styles/south-avatar-chrome.css) | колонка `.left-chrome`; форма «D» |
| [`user-south-panel.css`](../src/styles/user-south-panel.css) | padding панели / плашка |
| [`userSouthPanelCanon.ts`](../src/ui/userSouthPanelCanon.ts) | sizePx, panelScale, rail width |

## Стык с ободом

`.user-player-panel-pc-left-chrome` — **absolute sibling** стека (не в потоке).

`left = chromeOuterLeft − stackLeft − railWidth`  
→ правая кромка колонки на **внешней** левой кромке обода (`scale`/`ring` через `getBoundingClientRect`).

Высота колонки = `wrap.offsetHeight` (layout, без scale) — слот не раздувается.

Отступ от левой гирлянды панели: `padding-left` ≈ railWidth + chromeOut + inset (ПК ~42px, планшет ~36px).

Стык рельса с ободом: `.user-player-panel-pc-rail-bridge` — 2 узких вертикальных фиолетовых соединителя (верх / низ).

## Состав колонки

1. ★ (`.rail-stars`) сверху  
2. Имя (`.name-dock`) ниже, `flex: 1 1 0` + `overflow: hidden`, ширина 24/20  

Мобилка: ★ = `.panel-corner-stars--south` TL.

Hard refresh после правок.
