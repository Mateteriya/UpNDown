# ТЗ: вынос редактора аватарки в переиспользуемый продукт

**Статус:** бэклог / соседний чат (не блокирует работу в Up&Down)  
**Источник:** редактор аватарки в Up&Down (ателье: фото · варианты · фон · кисть · рамки · стикеры · инициалы)  
**Цель документа:** единое ТЗ, чтобы в отдельном чате/репо вынести редактор «себе» и при желании предложить другим разработчикам.

---

## 1. Зачем

В Up&Down получился не «кроппер кружка», а цельный **игровой avatar atelier**: слои, пресеты, неон-кисть, штампы, стикеры, рамки, инициалы, премиум-шаблоны, dirty-save, мобильный/ПК UI в одной атмосфере.

| Вариант | Зачем |
|---------|--------|
| **A. Свой kit** | Переиспользовать в других своих проектах без копипасты монолита |
| **B. Предложить другим** | Узкая ниша: игры, соц-профили, neon/casino UI, PWA — не конкурировать с Canva/Photopea |

Рынок простых crop/resize насыщен. Рынок **готового ателье с характером** — заметно уже; продаёт polish + демо, не «ещё одна lib».

---

## 2. Продуктовый результат

### 2.1 Для себя (минимум успеха)

- Отдельный пакет / мини-репо с редактором.
- Подключение в чужой React-проект за **≤1 час**: импорт модалки + `onSave(dataUrl)`.
- Тема (цвета/токены) и i18n — снаружи, без хардкода Up&Down.
- Ассеты и премиум-флаги — через конфиг, не через `useAuth` игры.

### 2.2 Для других разработчиков (если пойдём дальше)

- Публичное демо (статический сайт) + 5–8 скринов «до/после».
- README: install, props API, theming, license, «что не входит».
- Лицензия и явная политика по ассетам (какие шаблоны/иконки можно переиспользовать).
- Опционально: npm-пакет `@…/avatar-atelier` (или аналог имени).

---

## 3. Границы продукта

### 3.1 Входит в вынос (ядро)

| Область | Сейчас в Up&Down (ориентир) | В пакете |
|---------|-----------------------------|----------|
| UI-шелл модалки | `AvatarEditorModal.tsx` + `src/ui/avatarEditor/*` | Да, как публичный компонент |
| Canvas-база / шаблоны | `avatarEditorTemplates.ts` | Да |
| Кисть / штампы / заливка | `avatarBrushTools.ts`, `avatarNeonBrush.ts` | Да |
| Стикеры / масти / звезда / искра | `avatarEditorStickers.ts` | Да |
| Рамки | `avatarEditorFrames.ts` | Да |
| 3D-финиш / премиум-отрисовка | `avatar3dFinish.ts`, части `avatarPremium.ts` | Да (флаги через props) |
| Камера / галерея | `avatarCamera.ts`, `avatarImage.ts` | Да (адаптеры) |
| Черновик проекта | `avatarEditorProject.ts` | Да, но **storage — injectable** |
| Стили редактора | `src/styles/avatar-editor.css` | Да (отдельный CSS entry) |
| Палитра неона | `AvatarNeonColorPicker.tsx` | Да |

### 3.2 Не входит (остаётся в Up&Down)

- `getPlayerProfile` / `savePlayerProfile`, рейтинг, `profileId`.
- Supabase / premium entitlement игры (`isPremiumAvatarJokerStickerEnabled` и т.п.) — только **callback/флаг** снаружи.
- Игровой i18n (`src/i18n/ru.ts` / `en.ts`) — словарь редактора копируется или передаётся props/`messages`.
- Меню, южный панельный канон, `PlayerAvatar` отображение за столом — потребители, не часть пакета.
- Правила CSS «не трогать index.css» — внутреннее правило Up&Down; в пакете — свой entry CSS.

### 3.3 Принцип разреза

```
┌─────────────────────────────────────────────┐
│  Host app (Up&Down / другой проект)         │
│  profile · auth · premium · i18n · storage  │
└──────────────────┬──────────────────────────┘
                   │ props / adapters
┌──────────────────▼──────────────────────────┐
│  avatar-atelier (пакет)                     │
│  UI · canvas layers · tools · CSS tokens    │
│  export: PNG/WebP dataURL (+ optional blob) │
└─────────────────────────────────────────────┘
```

Пакет **не знает** про игру. Хост знает про пакет.

---

## 4. Публичный API (черновик контракта)

### 4.1 Главный компонент

```ts
type AvatarAtelierProps = {
  open: boolean;
  displayName: string;
  initialAvatarDataUrl?: string | null;

  onSave: (avatarDataUrl: string | null) => void;
  onCancel: () => void;
  /** Опционально: сейф после селфи до Save (мобильные перезагрузки). */
  onPhotoCaptured?: (avatarDataUrl: string) => void;

  /** Фичи / гейты — хост решает. */
  features?: {
    premiumStickers?: boolean;
    premiumTemplates?: boolean;
    camera?: boolean;
    gallery?: boolean;
    initials?: boolean;
    neonBrush?: boolean;
  };

  /** Тема: CSS variables или partial theme object. */
  theme?: AvatarAtelierTheme;

  /** Строки UI; если нет — en fallback внутри пакета. */
  messages?: Partial<AvatarAtelierMessages>;

  /** Где хранить черновик (по умолчанию memory / opt-in localStorage key). */
  projectStore?: AvatarAtelierProjectStore;

  className?: string;
  canvasSize?: number; // default как в Up&Down
};
```

### 4.2 Минимальный happy path для хоста

```tsx
<AvatarAtelier
  open={open}
  displayName={profile.displayName}
  initialAvatarDataUrl={profile.avatarDataUrl}
  onSave={(url) => { saveProfileAvatar(url); setOpen(false); }}
  onCancel={() => setOpen(false)}
  features={{ premiumStickers: userHasPremium }}
  messages={ruMessages}
/>
```

### 4.3 Экспорт

- Основной: `image/png` (или WebP) **data URL** круга/квадрата — совместимо с текущим Up&Down.
- Опционально (фаза 2): `Blob`, размер стороны, `quality`, без UI (`renderPresetToDataUrl(id, opts)` для серверного/батч-превью).

---

## 5. Темизация и бренд

Чтобы чужой проект не выглядел как Up&Down:

| Токен (пример) | Назначение |
|----------------|------------|
| `--aa-bg` / `--aa-panel` | Фон модалки / панелей |
| `--aa-accent` / `--aa-accent-2` | Неон / CTA |
| `--aa-rim-gradient` | Перелив обода вкладок |
| `--aa-danger` / `--aa-ok` | Отмена / применено |
| `--aa-radius` / `--aa-font` | Форма и типографика |
| `--aa-dock-*` | Шапка вкладки («Своё» и кружки секций) |

Требования:

1. Дефолтная тема = текущий «cosmic neon» (как в Up&Down) — чтобы демо сразу «вау».
2. Вторая тема в демо: нейтральная (светлая или спокойная тёмная) — доказательство skin API.
3. **Brand test:** после смены токенов не должно торчать имя/лого Up&Down.

---

## 6. Архитектура выноса (технически)

### 6.1 Фазы

| Фаза | Что сделать | Критерий готово |
|------|-------------|-----------------|
| **0. Инвентаризация** | Список файлов, зависимостей (`useT`, `useAuth`, premium, persistence), CSS-графов | Таблица «переносим / адаптер / выкидываем» |
| **1. Адаптеры в Up&Down** | Убрать прямые импорты auth/i18n/profile из модалки → props/hooks-injection | Up&Down ведёт себя как сейчас |
| **2. Пакет-скелет** | Отдельная папка `packages/avatar-atelier` или sibling-repo; CSS entry; peerDeps: `react`, `react-dom` | `pnpm/npm` link в Up&Down |
| **3. Перенос ядра** | lib + ui + css; Up&Down импортирует из пакета | Регрессии редактора нет |
| **4. Демо-стенд** | Vite app: 2 темы, mock premium on/off, EN/RU | Скриншоты для README |
| **5. (Опц.) Публикация** | npm / GitHub Release, LICENSE, CHANGELOG | `npm i` у внешнего дева работает |

Фазы 0–3 = «забрать себе». 4–5 = «предложить другим».

### 6.2 Зависимости — правила

- **Peer:** React 18+.
- **Не тянуть** в пакет: Supabase, игровой store, Capacitor (камера — через HTML input / injectable `getUserMedia` helper).
- Canvas-логика — чистые функции без DOM, где возможно (удобно тестировать и для headless export).

### 6.3 CSS

- Один entry: `avatar-atelier.css` (аналог нынешнего `avatar-editor.css`).
- Хост подключает **после** своих base styles.
- Никаких правок «чужого» огромного `index.css`.
- Prefers-reduced-motion: ослабить/выключить бесконечные rim-анимации.

### 6.4 Storage черновика

Интерфейс roughly:

```ts
type AvatarAtelierProjectStore = {
  load: () => AvatarAtelierProject | null;
  save: (project: AvatarAtelierProject) => void;
  clear: () => void;
  // source photo / working flat — по текущей модели Up&Down
};
```

Дефолт: in-memory. Opt-in: `createLocalStorageStore(key)`.

---

## 7. Функциональный чеклист (паритет с Up&Down)

Перед объявлением «готово к своим проектам» — всё ниже работает в пакете:

- [ ] Открытие с `displayName` + опциональным `initialAvatarDataUrl`
- [ ] Базы: Своё (камера/галерея), Варианты, Фон, Пусто
- [ ] Инструменты: Кисть (неон), Рамки, Стикеры
- [ ] Штампы с палитрой неона (капсула), всегда neon-double где задумано
- [ ] Стикеры: масти ♠♥♦♣, звезда 3D, искра, премиум-гейты
- [ ] Инициалы: состав/стиль, палитра не перекрывает подсказки
- [ ] Undo/Redo слоёв рисования
- [ ] Dirty-индикатор + спокойный ack «Сохранено» (без CTA-зелёной галки)
- [ ] Мобильный dock: кружки секций не едят Save; «Своё» — перелив обода **без** вращения формы
- [ ] ПК / планшет: без поломки мобильной вёрстки (как в правилах Up&Down)
- [ ] Экспорт dataURL; хост сам пишет в профиль

---

## 8. Лицензия, ассеты, риски

### 8.1 Код

- Решить лицензию **до** предложения другим: MIT / Apache-2.0 (просто) или source-available (если хотите контроль).
- В Up&Down зафиксировать: пакет — fork/extract, копирайт общий / ваш.

### 8.2 Ассеты

Явно разделить:

| Тип | Примеры | Политика |
|-----|---------|----------|
| Генеративные (canvas) | lucky-7, star, spark, suits | Можно в пакете |
| UI-глифы / SVG | камера, галерея, кисть | Проверить происхождение |
| Растровые из `public/` | референс-скрины, брендовые pngнки | **Не** в npm без прав |
| Шрифты | если используются кастомные | Лицензия шрифта |

### 8.3 Риски

- Модалка сейчас толстая (`AvatarEditorModal.tsx`) — вынос без предварительного разреза на секции/hooks будет болезненным; фаза 1 обязательна.
- Анимации ободов (conic / `@property`) — проверить Safari/iOS; fallback на статичный градиент.
- «Вау»-эффект держится на теме; без skin API чужие проекты будут клонами Up&Down.

---

## 9. Позиционирование (если предлагать другим)

**Не говорить:** «альтернатива Canva / полный графический редактор».  
**Говорить:** «React avatar atelier для игр и продуктов с сильным UI: пресеты + кисть + стикеры + рамки из коробки, тема за час».

Кому потенциально:

- инди-игры / card & casino web;
- соц-фичи внутри продукта (профиль, клан, комната);
- PWA с neon/dark UI;
- прототипы персонализации без дизайнера.

Кому не целиться:

- фоторедакторы, дизайн-студии, enterprise DAM.

Материалы для «продажи» впечатления:

1. Живое демо (мобильный viewport + desktop).
2. GIF перелива «Своё» + премиум-семёрка + масти на превью.
3. Side-by-side: default theme vs re-skinned.
4. 10 строк кода в README.

---

## 10. Критерии приёмки

### Своё использование

1. Up&Down подключён к пакету и регрессий редактора нет (ручной смоук по §7).
2. Второй учебный хост (пустой Vite) поднимает редактор без импортов из `src/` игры.
3. Смена темы не требует правки исходников пакета — только tokens/props.

### Предложение другим (опциональный гейт)

4. Публичный демо-URL или GitHub Pages.
5. LICENSE + явная таблица ассетов.
6. Внешний человек по README ставит и открывает модалку без созвона.

---

## 11. Оценка порядка работ (ориентир, не жёсткий дедлайн)

| Объём | Оценка |
|-------|--------|
| Фаза 0–1 (адаптеры в текущем репо) | ~1–2 дня фокуса |
| Фаза 2–3 (пакет + перенос + линк в Up&Down) | ~3–7 дней |
| Фаза 4 (демо + 2 темы + README) | ~1–2 дня |
| Фаза 5 (npm/release polish) | ~1 день |

Параллелить с фичами редактора в Up&Down можно **после** фазы 1 (чтобы не плодить два источника правды в модалке).

---

## 12. Что сделать в соседнем чате (стартовый промпт)

Краткий бриф для нового чата:

> По ТЗ `docs/TZ-AVATAR-EDITOR-EXTRACT.md` начни **фазу 0–1**: инвентаризация зависимостей `AvatarEditorModal` / `src/lib/avatar*` / `avatar-editor.css` от auth, i18n, profile, premium; предложи конкретный список адаптеров (props) и план папки `packages/avatar-atelier` без поломки текущего Up&Down. Код редактора в игре пока не удалять — сначала injection, потом перенос.

---

## 13. Связанные файлы в Up&Down (снимок на момент ТЗ)

- UI: `src/ui/AvatarEditorModal.tsx`, `src/ui/avatarEditor/*`, `src/ui/AvatarNeonColorPicker.tsx`
- Lib: `src/lib/avatarEditorTemplates.ts`, `avatarBrushTools.ts`, `avatarNeonBrush.ts`, `avatarEditorStickers.ts`, `avatarEditorFrames.ts`, `avatarEditorProject.ts`, `avatar3dFinish.ts`, `avatarPremium.ts`, `avatarCamera.ts`, `avatarImage.ts`
- CSS: `src/styles/avatar-editor.css` (подключение после `index.css` в `main.tsx`)
- Контекст продукта: `docs/AVATARS-AND-NAMES-PLAN.md`, правила в `AGENTS.md` / `.cursor/rules/avatar-editor-css.mdc`

---

*Документ для выноса редактора; правки фич внутри Up&Down ведутся отдельно и не ждут этого ТЗ.*
