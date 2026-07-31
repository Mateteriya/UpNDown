# Лучшие элементы дизайна Up&Down

Личная копилка удачных визуальных решений — чтобы не потерять и переиспользовать.

---

## Support iridescent (cyan ↔ blue ↔ violet)

**Где родился:** текст футера на странице «Поддержать проект» (Comic Neue + перелив).  
**Сейчас живёт на:** лидах той же страницы (`.support-page__lead`, `.support-page__lead-cta`).  
**Почему топ:** насыщенный градиент без бледных/белых стопов — читается на тёмном фоне, «дорогой» перелив без кислотного glow.

### Рецепт CSS

```css
background: linear-gradient(
  105deg,
  #0891b2 0%,
  #2563eb 28%,
  #7c3aed 58%,
  #0e7490 100%
);
background-size: 180% 100%;
-webkit-background-clip: text;
background-clip: text;
color: transparent;
-webkit-text-fill-color: transparent;
/* опционально (на лидах с float НЕ ставить — ломает композитинг): */
/* filter: drop-shadow(0 1px 0 rgba(8, 4, 24, 0.65)); */

/* linear: скорость задаём keyframes (быстрый выход из тёмного края) */
animation: support-iridescent-sheen 9s linear infinite;

@keyframes support-iridescent-sheen {
  0% {
    background-position: 0% 50%; /* тёмный старт — коротко */
  }
  12% {
    background-position: 100% 50%; /* быстрое посветление */
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%; /* обратный перелив — спокойнее */
  }
}
```

### Стопы (палитра)

| Stop | Hex       | Ощущение   |
|------|-----------|------------|
| 0%   | `#0891b2` | cyan       |
| 28%  | `#2563eb` | royal blue |
| 58%  | `#7c3aed` | violet     |
| 100% | `#0e7490` | deep teal  |

### Заметки

- Для `prefers-reduced-motion`: сплошной `#2563eb` без анимации.
- Рядом с `float` и картинками — без `filter` на том же блоке.
- Inline SVG внутри такого текста: сбросить `-webkit-text-fill-color: initial` на иконке.
- Не убирать тёмный край градиента — только ускорять уход от него в начале цикла (~первые 12% времени).

### Убранный текст (архив формулировки)

> Не дайте разработчику буксовать на багах и лагах в одиночку — подтолкните игру к новым режимам.

Убран как слишком «клянчащий» тон для страницы поддержки; перелив сохранён и перенесён на лиды.

---

## FaceCheerKind — inline-смайл в лиде

**Где:** `SupportDonatePage.tsx` → `FaceCheerKind` (в тексте самурайского лида: «довольные игроки 🙂»).  
**Почему сохранить:** космический мини-смайл без ушек — cyan/violet/rose штрихи, добрая ирония, хорошо сидит в потоке текста.

### SVG (рецепт; `uid` уникален на странице)

```tsx
function FaceCheerKind({ uid }: { uid: string }) {
  return (
    <svg className="support-page__face support-page__face--inline" viewBox="0 0 40 40" aria-hidden>
      <defs>
        <linearGradient id={`${uid}-cheer-stroke`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="45%" stopColor="#c084fc" />
          <stop offset="100%" stopColor="#fb7185" />
        </linearGradient>
        <radialGradient id={`${uid}-cheer-plate`} cx="45%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#312e81" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#0f172a" stopOpacity="0.15" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="15.5" fill={`url(#${uid}-cheer-plate)`} opacity="0.9" />
      <circle
        cx="20"
        cy="20"
        r="15.5"
        fill="none"
        stroke={`url(#${uid}-cheer-stroke)`}
        strokeWidth="0.45"
        opacity="0.4"
      />
      <path
        d="M10.2 14.2c2.1-2.6 5.8-2.8 7.6-0.4"
        fill="none"
        stroke={`url(#${uid}-cheer-stroke)`}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M22.8 13.6c1.6-1.2 4.6-1 6.2 0.6"
        fill="none"
        stroke={`url(#${uid}-cheer-stroke)`}
        strokeWidth="1.85"
        strokeLinecap="round"
        opacity="0.95"
      />
      <circle cx="14.2" cy="18.6" r="1.85" fill="#e9d5ff" />
      <circle cx="14.2" cy="18.6" r="1.1" fill="#67e8f9" opacity="0.9" />
      <circle cx="25.8" cy="18.7" r="1.85" fill="#e9d5ff" />
      <circle cx="25.8" cy="18.7" r="1.1" fill="#f472b6" opacity="0.9" />
      <path
        d="M14.8 25.2c2.4 2.6 7.8 2.6 10.4 0"
        fill="none"
        stroke={`url(#${uid}-cheer-stroke)`}
        strokeWidth="2.05"
        strokeLinecap="round"
      />
    </svg>
  );
}
```

### CSS рядом

```css
.support-page__face {
  display: inline-block;
  vertical-align: -0.35em;
  flex-shrink: 0;
  -webkit-text-fill-color: initial; /* важно внутри iridescent-текста */
  color: initial;
}
.support-page__face--inline {
  width: 1.35em;
  height: 1.35em;
  margin: 0 0.12em;
}
```

### Не сохранился

`FacePushBuddy` (кот с ушками/очками из футера) ушёл вместе с футер-текстом и в git не коммитился — восстановить из репо нельзя. Если снова понадобится — рисовать заново или доставать из бэкапа чата.
