/** Шаблоны для мини-редактора аватарки (рисуются на canvas). */

import {
  avatarImageHasTransparentBadgePad,
  getAvatarBadgePadFaceRect,
} from './avatarImage';

export type AvatarEditorTemplateId =
  /* фоны */
  | 'none'
  | 'elite-black'
  | 'neutral'
  | 'plaid-iris'
  | 'plaid-sand'
  | 'nebula'
  | 'aurora'
  | 'ember'
  | 'violet-crown'
  | 'deep-space'
  | 'prism'
  /* нативные */
  | 'monogram'
  | 'soft-disk'
  | 'status-ring'
  | 'silhouette'
  /* умные / фишки */
  | 'bluff'
  | 'lucky-7'
  | 'mirror'
  | 'player-rise';

export type AvatarEditorTemplateGroup = 'native' | 'clever' | 'bg';

/** Состав текста инициалов (что писать). */
export type AvatarInitialsSource = 'first' | 'firstDigits' | 'capitals';

/** Расположение / стиль инициалов. `off` = инициалы не рисуем. */
export type AvatarInitialsStyle = 'off' | 'center' | 'arc' | 'ghost' | 'neon' | 'badge';

export const AVATAR_INITIALS_SOURCES: readonly AvatarInitialsSource[] = [
  'first',
  'firstDigits',
  'capitals',
] as const;

export const AVATAR_INITIALS_STYLES: readonly AvatarInitialsStyle[] = [
  'off',
  'center',
  'arc',
  'ghost',
  'neon',
  'badge',
] as const;

/** Стили в панели (без off — off только условный чип «убрать»). */
export const AVATAR_INITIALS_STYLE_CHIPS: readonly Exclude<AvatarInitialsStyle, 'off'>[] = [
  'center',
  'arc',
  'ghost',
  'neon',
  'badge',
] as const;

export function isAvatarInitialsSource(v: unknown): v is AvatarInitialsSource {
  return typeof v === 'string' && (AVATAR_INITIALS_SOURCES as readonly string[]).includes(v);
}

export function isAvatarInitialsStyle(v: unknown): v is AvatarInitialsStyle {
  return typeof v === 'string' && (AVATAR_INITIALS_STYLES as readonly string[]).includes(v);
}

/**
 * @deprecated Старый единый режим. Только для миграции LS.
 * letters≈capitals+center, letters-digits≈firstDigits+center, остальное — style + capitals.
 */
export type AvatarInitialsMode =
  | 'off'
  | 'letters'
  | 'letters-digits'
  | 'arc'
  | 'ghost'
  | 'neon'
  | 'badge';

const LEGACY_INITIALS_MODES: readonly AvatarInitialsMode[] = [
  'off',
  'letters',
  'letters-digits',
  'arc',
  'ghost',
  'neon',
  'badge',
] as const;

export function isAvatarInitialsMode(v: unknown): v is AvatarInitialsMode {
  return typeof v === 'string' && (LEGACY_INITIALS_MODES as readonly string[]).includes(v);
}

/** Миграция старого initialsMode → source + style. */
export function migrateLegacyInitialsMode(mode: unknown): {
  initialsSource: AvatarInitialsSource;
  initialsStyle: AvatarInitialsStyle;
} {
  if (!isAvatarInitialsMode(mode)) {
    return { initialsSource: 'capitals', initialsStyle: 'off' };
  }
  switch (mode) {
    case 'off':
      return { initialsSource: 'capitals', initialsStyle: 'off' };
    case 'letters':
      return { initialsSource: 'capitals', initialsStyle: 'center' };
    case 'letters-digits':
      return { initialsSource: 'firstDigits', initialsStyle: 'center' };
    case 'arc':
    case 'ghost':
    case 'neon':
    case 'badge':
      return { initialsSource: 'capitals', initialsStyle: mode };
    default:
      return { initialsSource: 'capitals', initialsStyle: 'off' };
  }
}

export interface AvatarEditorTemplate {
  id: AvatarEditorTemplateId;
  label: string;
  group: AvatarEditorTemplateGroup;
}

/** Порядок фонов: пустой → чёрный → нейтральный → клеточки → цветные. Фото — отдельно в UI первым. */
export const AVATAR_EDITOR_BG_TEMPLATES: AvatarEditorTemplate[] = [
  { id: 'none', label: 'Пустой', group: 'bg' },
  { id: 'elite-black', label: 'Чёрный', group: 'bg' },
  { id: 'neutral', label: 'Нейтральный', group: 'bg' },
  { id: 'plaid-iris', label: 'Клетка iris', group: 'bg' },
  { id: 'plaid-sand', label: 'Клетка sand', group: 'bg' },
  { id: 'nebula', label: 'Туманность', group: 'bg' },
  { id: 'aurora', label: 'Аврора', group: 'bg' },
  { id: 'ember', label: 'Закат', group: 'bg' },
  { id: 'violet-crown', label: 'Корона', group: 'bg' },
  { id: 'deep-space', label: 'Космос', group: 'bg' },
  { id: 'prism', label: 'Призма', group: 'bg' },
];

export const AVATAR_EDITOR_STYLE_TEMPLATES: AvatarEditorTemplate[] = [
  { id: 'monogram', label: 'Монограмма', group: 'native' },
  { id: 'soft-disk', label: 'Диск', group: 'native' },
  { id: 'status-ring', label: 'Кольцо', group: 'native' },
  { id: 'silhouette', label: 'Силуэт', group: 'native' },
  { id: 'bluff', label: 'Блеф', group: 'clever' },
  { id: 'lucky-7', label: 'Семёрка', group: 'clever' },
  { id: 'mirror', label: 'Зеркало', group: 'clever' },
  { id: 'player-rise', label: 'Игрок', group: 'clever' },
];

export const AVATAR_EDITOR_TEMPLATES: AvatarEditorTemplate[] = [
  ...AVATAR_EDITOR_STYLE_TEMPLATES,
  ...AVATAR_EDITOR_BG_TEMPLATES,
];

export const AVATAR_EDITOR_TEMPLATE_GROUPS: {
  id: AvatarEditorTemplateGroup;
  templates: AvatarEditorTemplate[];
}[] = (
  [
    { id: 'native' as const, templates: AVATAR_EDITOR_STYLE_TEMPLATES.filter((t) => t.group === 'native') },
    { id: 'clever' as const, templates: AVATAR_EDITOR_STYLE_TEMPLATES.filter((t) => t.group === 'clever') },
    { id: 'bg' as const, templates: AVATAR_EDITOR_BG_TEMPLATES },
  ] as const
).filter((g) => g.templates.length > 0);

function hashHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h) + name.charCodeAt(i) | 0;
  return Math.abs(h % 360);
}

/** Первая буква первого слова (только буква). */
export function getAvatarFirstLetter(name: string): string {
  const t = name.trim();
  if (!t) return '?';
  const firstWord = t.split(/\s+/).filter(Boolean)[0] ?? t;
  for (const ch of firstWord) {
    if (/\p{L}/u.test(ch)) return ch.toUpperCase();
  }
  const fallback = firstWord[0];
  return fallback ? fallback.toUpperCase() : '?';
}

/**
 * До 2 первых букв слов (без учёта регистра) — для монограмм шаблонов / fallback плашки.
 * Не путать с capitals (заглавные слова).
 */
export function getAvatarLettersOnly(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters: string[] = [];
  for (const w of words) {
    for (const ch of w) {
      if (/\p{L}/u.test(ch)) {
        letters.push(ch.toUpperCase());
        break;
      }
    }
    if (letters.length >= 2) break;
  }
  if (letters.length) return letters.join('');
  return '?';
}

/** Буква первого слова + до 4 цифр из всего имени. */
export function getAvatarLettersAndDigits(name: string): string {
  const t = name.trim();
  if (!t) return '?';
  const firstWord = t.split(/\s+/).filter(Boolean)[0] ?? t;
  let letter: string | null = null;
  for (const ch of firstWord) {
    if (/\p{L}/u.test(ch)) {
      letter = ch;
      break;
    }
  }
  const digits = (t.match(/\d/g) ?? []).join('').slice(0, 4);
  if (letter && digits) return `${letter.toUpperCase()}${digits}`;
  if (letter) return letter.toUpperCase();
  if (digits) return digits;
  const fallback = firstWord[0];
  return fallback ? fallback.toUpperCase() : '?';
}

/**
 * 1–3 буквы из слов, начинающихся с заглавной (split: пробелы + дефисы).
 * «Мария фон Деер»→МД; «светка-Конфетка»→К; «Я о Чень уМный»→ЯЧ.
 */
export function getAvatarCapitalWordLetters(name: string): string {
  const parts = name.trim().split(/[\s-]+/).filter(Boolean);
  const letters: string[] = [];
  for (const w of parts) {
    const ch = w[0];
    if (!ch || !/\p{L}/u.test(ch)) continue;
    if (ch !== ch.toUpperCase() || ch === ch.toLowerCase()) continue;
    letters.push(ch.toUpperCase());
    if (letters.length >= 3) break;
  }
  if (letters.length) return letters.join('');
  return getAvatarFirstLetter(name);
}

/** Текст инициалов по выбранному составу. */
export function resolveAvatarInitialsText(name: string, source: AvatarInitialsSource): string {
  switch (source) {
    case 'first':
      return getAvatarFirstLetter(name);
    case 'firstDigits':
      return getAvatarLettersAndDigits(name);
    case 'capitals':
      return getAvatarCapitalWordLetters(name);
    default:
      return getAvatarCapitalWordLetters(name);
  }
}

function initialsFontPx(size: number, text: string, compact = false): number {
  const len = Math.max(1, [...text].length);
  const base = len <= 1 ? 0.44 : len === 2 ? 0.34 : len === 3 ? 0.28 : 0.22;
  return Math.round(size * base * (compact ? 0.72 : 1));
}

/** Готовые яркие цвета инициалов (не полная палитра). */
export const AVATAR_INITIALS_COLORS = [
  '#ffffff',
  '#00f6ff',
  '#ffe600',
  '#ff2d9b',
  '#b84dff',
  '#39ff14',
  '#ff6a00',
] as const;

export type AvatarInitialsColor = (typeof AVATAR_INITIALS_COLORS)[number];

export function isAvatarInitialsColor(v: unknown): v is AvatarInitialsColor {
  return typeof v === 'string' && (AVATAR_INITIALS_COLORS as readonly string[]).includes(v);
}

const ARC_FONT_STACK = '"Comic Sans MS", "Comic Sans", "Chalkboard SE", "Comic Neue", cursive';
/** Изящный тонкий шрифт для премиум-плашки (ник / имя). */
export const AVATAR_BADGE_FONT_STACK =
  '"Cormorant Garamond", "Cormorant", "Palatino Linotype", "Book Antiqua", Georgia, serif';
export const AVATAR_BADGE_MAX_CHARS = 9;

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function normalizeAvatarBadgeText(raw: string): string {
  return [...raw.replace(/\s+/g, ' ').trim()].slice(0, AVATAR_BADGE_MAX_CHARS).join('');
}

export function defaultAvatarBadgeText(displayName: string): string {
  const fromName = normalizeAvatarBadgeText(displayName);
  if (fromName) return fromName;
  return getAvatarLettersOnly(displayName).slice(0, AVATAR_BADGE_MAX_CHARS) || 'Aa';
}

/** Геометрия капсулы: снизу, ширина по тексту + умеренные поля. */
export function measureAvatarBadgeLayout(
  size: number,
  text: string,
  opts?: { showcase?: boolean },
): { x: number; y: number; w: number; h: number; fontPx: number; text: string } {
  const t = normalizeAvatarBadgeText(text) || '?';
  const len = Math.max(1, [...t].length);
  const showcase = Boolean(opts?.showcase);
  const boost = showcase ? 1.42 : 1;
  /* Превью: чуть компактнее (~9%), чтобы не наезжать на дуги кнопок */
  const h = size * (showcase ? 0.29 : 0.178) * boost;
  if (showcase) {
    /* Витрина: целиком в кадре — нижний обод и буквы читаются */
    const y = size - h - size * 0.02;
    const baseW = size * 0.68;
    const maxW = size * 0.96;
    const padX = size * 0.035;
    const maxFont = Math.min(h * 0.78, size * 0.23);
    const minFont = size * 0.13;
    let fontPx = Math.round(maxFont);
    const probe =
      typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
    let textW = fontPx * len * 0.5;
    if (probe) {
      while (fontPx > minFont) {
        probe.font = `600 ${fontPx}px ${AVATAR_BADGE_FONT_STACK}`;
        textW = probe.measureText(t).width;
        if (textW + padX * 2 <= maxW) break;
        fontPx -= 1;
      }
      probe.font = `600 ${fontPx}px ${AVATAR_BADGE_FONT_STACK}`;
      textW = probe.measureText(t).width;
    }
    const w = Math.min(maxW, Math.max(baseW, textW + padX * 2));
    return { x: (size - w) / 2, y, w, h, fontPx, text: t };
  }

  /* Превью: чуть выше ободка, скромный свес — не перекрывает кнопки снаружи */
  const y = size - h * 0.52 - size * 0.04;
  const baseW = size * 0.5;
  const maxW = size * 1.08;
  /* Самый минимальный боковой зазор (CSS-шрифт чуть шире canvas-меры) */
  const padX = size * 0.038;
  const maxFont = Math.min(h * 0.78, size * 0.155);
  const minFont = size * 0.085;
  let fontPx = Math.round(maxFont);

  const probe =
    typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  let textW = fontPx * len * 0.5;
  if (probe) {
    while (fontPx > minFont) {
      probe.font = `600 ${fontPx}px ${AVATAR_BADGE_FONT_STACK}`;
      textW = probe.measureText(t).width * 1.08;
      if (textW + padX * 2 <= maxW) break;
      fontPx -= 1;
    }
    probe.font = `600 ${fontPx}px ${AVATAR_BADGE_FONT_STACK}`;
    textW = probe.measureText(t).width * 1.08;
  } else {
    fontPx = Math.round(Math.min(maxFont, (maxW - padX * 2) / Math.max(1, len * 0.48)));
    textW = fontPx * len * 0.52;
  }

  const w = Math.min(maxW, Math.max(baseW, textW + padX * 2));
  const x = (size - w) / 2;
  return { x, y, w, h, fontPx, text: t };
}

export function hitTestAvatarBadge(
  size: number,
  text: string,
  px: number,
  py: number,
  pad = 4,
): boolean {
  const { x, y, w, h } = measureAvatarBadgeLayout(size, text);
  return px >= x - pad && px <= x + w + pad && py >= y - pad && py <= y + h + pad;
}

/** Тёмный ореол + обводка — буквы читаются на ярких градиентах. */
function strokeInitialsGlyph(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  strength = 1,
): void {
  const line = Math.max(1.5, size * 0.045 * strength);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.lineWidth = line * 1.65;
  ctx.strokeStyle = 'rgba(2, 6, 23, 0.92)';
  ctx.shadowColor = 'rgba(2, 6, 23, 0.85)';
  ctx.shadowBlur = size * 0.06 * strength;
  ctx.strokeText(text, x, y);
  ctx.shadowBlur = 0;
  ctx.lineWidth = line;
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeText(text, x, y);
  ctx.restore();
}

function drawCenterInitials(
  ctx: CanvasRenderingContext2D,
  size: number,
  text: string,
  opts: {
    fill?: string;
    alpha?: number;
    shadowColor?: string;
    shadowBlur?: number;
    neonPass?: boolean;
    fontStack?: string;
    outlined?: boolean;
    /** Мягкий край (полупрозрачный режим) — без второго «твёрдого» прохода. */
    softEdge?: boolean;
  } = {},
): void {
  const t = (text.trim() || '?').slice(0, 5);
  const fontPx = initialsFontPx(size, t);
  const fill = opts.fill ?? '#ffffff';
  const x = size / 2;
  /* Неон — строго в центре; остальным лёгкая оптическая поправка вниз */
  const y = opts.neonPass ? size / 2 : size / 2 + size * 0.02;
  const outlined = opts.outlined !== false;
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.font = `800 ${fontPx}px ${opts.fontStack ?? '"Exo 2", system-ui, sans-serif'}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (opts.neonPass && 'letterSpacing' in ctx) {
    try {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
        t.length <= 2 ? '0.04em' : '0.02em';
    } catch {
      /* ignore */
    }
  }

  if (outlined) {
    /* Неон: тонкий тёмный контур — иначе «съедает» свечение */
    strokeInitialsGlyph(ctx, t, x, y, size, opts.neonPass ? 0.38 : opts.softEdge ? 0.55 : 1);
  }

  if (opts.neonPass) {
    const neon = fill.startsWith('#') ? fill : '#22d3ee';
    const hot = mixHexTowardWhite(neon, 0.35);

    /* Глубокий bloom */
    ctx.shadowColor = withAlpha(neon, 0.95);
    ctx.shadowBlur = size * 0.2;
    ctx.fillStyle = neon;
    ctx.fillText(t, x, y);

    /* Второй цветной слой (чуть смещён — «хром» неона) */
    ctx.shadowColor = withAlpha(hot, 0.85);
    ctx.shadowBlur = size * 0.12;
    ctx.fillStyle = neon;
    ctx.fillText(t, x + size * 0.004, y);

    /* Насыщенный корпус */
    ctx.shadowColor = withAlpha(neon, 0.8);
    ctx.shadowBlur = size * 0.06;
    ctx.fillStyle = neon;
    ctx.fillText(t, x, y);

    /* Белая кромка / горячее ядро */
    ctx.shadowBlur = size * 0.025;
    ctx.shadowColor = withAlpha('#ffffff', 0.7);
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = Math.min(1, (opts.alpha ?? 1) * 0.78);
    ctx.fillText(t, x, y);
    ctx.globalAlpha = opts.alpha ?? 1;
    ctx.shadowBlur = 0;
    ctx.fillStyle = hot;
    ctx.globalAlpha = Math.min(1, (opts.alpha ?? 1) * 0.62);
    ctx.fillText(t, x, y);
  } else {
    /* Лёгкий цветной ореол — цветные инициалы ближе к яркости палитры */
    if (fill.startsWith('#') && fill.toLowerCase() !== '#ffffff' && fill.toLowerCase() !== '#f8fafc') {
      ctx.shadowColor = withAlpha(fill, 0.7);
      ctx.shadowBlur = size * 0.075;
      ctx.fillStyle = fill;
      ctx.fillText(t, x, y);
    }
    ctx.shadowColor = opts.shadowColor ?? 'rgba(2, 6, 23, 0.75)';
    ctx.shadowBlur = opts.shadowBlur ?? size * 0.055;
    ctx.fillStyle = fill;
    ctx.fillText(t, x, y);
    if (!opts.softEdge) {
      /* второй проход без тени — чёткая кромка */
      ctx.shadowBlur = 0;
      ctx.fillText(t, x, y);
    }
  }
  ctx.restore();
}

/** Смешать hex к белому (горячее ядро неона). */
function mixHexTowardWhite(hex: string, t: number): string {
  const c = hex.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(c)) return '#e0f2fe';
  const r = parseInt(c.slice(1, 3), 16);
  const g = parseInt(c.slice(3, 5), 16);
  const b = parseInt(c.slice(5, 7), 16);
  const k = Math.min(1, Math.max(0, t));
  const to = (n: number) =>
    Math.round(n + (255 - n) * k)
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Неоновая аура за буквами — читаемый «неон» даже на мелком превью. */
function drawNeonAura(ctx: CanvasRenderingContext2D, size: number, color: string): void {
  const c = color.startsWith('#') ? color : '#00f6ff';
  const hot = mixHexTowardWhite(c, 0.4);
  const cx = size / 2;
  const cy = size / 2;
  ctx.save();

  /* Мягкая подложка — контраст на ярком фоне */
  const pad = ctx.createRadialGradient(cx, cy, size * 0.06, cx, cy, size * 0.48);
  pad.addColorStop(0, withAlpha('#020617', 0.45));
  pad.addColorStop(0.55, withAlpha('#020617', 0.18));
  pad.addColorStop(1, withAlpha('#020617', 0));
  ctx.fillStyle = pad;
  ctx.fillRect(0, 0, size, size);

  const rings: Array<[number, number, number, string]> = [
    [0.44, 0.22, 0.08, c],
    [0.32, 0.38, 0.055, hot],
    [0.2, 0.55, 0.036, c],
  ];
  for (const [radius, alpha, width, stroke] of rings) {
    ctx.beginPath();
    ctx.arc(cx, cy, size * radius, 0, Math.PI * 2);
    ctx.strokeStyle = withAlpha(stroke, alpha);
    ctx.lineWidth = size * width;
    ctx.shadowColor = withAlpha(c, 0.95);
    ctx.shadowBlur = size * 0.15;
    ctx.stroke();
  }

  /* Ядро */
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha(hot, 0.38);
  ctx.shadowColor = withAlpha(c, 0.95);
  ctx.shadowBlur = size * 0.18;
  ctx.fill();

  /* Тонкие «лучи» — намёк на tube neon */
  ctx.shadowBlur = size * 0.08;
  ctx.strokeStyle = withAlpha(c, 0.28);
  ctx.lineWidth = Math.max(1, size * 0.01);
  for (let i = 0; i < 4; i += 1) {
    const a = (Math.PI / 4) * i - Math.PI / 8;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * size * 0.16, cy + Math.sin(a) * size * 0.16);
    ctx.lineTo(cx + Math.cos(a) * size * 0.4, cy + Math.sin(a) * size * 0.4);
    ctx.stroke();
  }
  ctx.restore();
}
/** Буквы по верхней дуге — Comic Sans, «живой» акцент. */
function drawArcInitials(
  ctx: CanvasRenderingContext2D,
  size: number,
  text: string,
  color = '#ffffff',
): void {
  const chars = [...(text.trim() || '?').slice(0, 4)];
  if (!chars.length) return;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.36;
  const spread = Math.min(1.15, 0.38 + chars.length * 0.16);
  const start = -Math.PI / 2 - spread / 2;
  const step = chars.length > 1 ? spread / (chars.length - 1) : 0;
  const fontPx = Math.round(size * (chars.length <= 2 ? 0.22 : 0.17));

  ctx.save();
  ctx.font = `800 ${fontPx}px ${ARC_FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  chars.forEach((ch, i) => {
    const angle = start + step * i;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + Math.PI / 2);
    strokeInitialsGlyph(ctx, ch, 0, 0, size, 0.95);
    ctx.shadowColor = 'rgba(2, 6, 23, 0.7)';
    ctx.shadowBlur = size * 0.035;
    ctx.fillStyle = color;
    ctx.fillText(ch, 0, 0);
    ctx.shadowBlur = 0;
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  });
  ctx.restore();
}

/** Плашка-капсула: тёмный космос + цветные звёзды + лазерные буквы. */
function drawBadgeInitials(
  ctx: CanvasRenderingContext2D,
  size: number,
  text: string,
  color = '#ecfeff',
  opts?: { showcase?: boolean },
): void {
  const layout = measureAvatarBadgeLayout(size, text, opts);
  const { x, y, w, h, fontPx } = layout;
  const t = layout.text;
  const r = h / 2;
  const accent = color.startsWith('#') ? color : '#c084fc';

  const pathCapsule = () => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  ctx.save();

  /* Мягкое внешнее свечение */
  pathCapsule();
  ctx.shadowColor = withAlpha('#a78bfa', 0.55);
  ctx.shadowBlur = size * 0.05;
  ctx.strokeStyle = withAlpha('#7c3aed', 0.4);
  ctx.lineWidth = Math.max(3, size * 0.026);
  ctx.stroke();
  ctx.shadowBlur = 0;

  /* Фиолетово-космический фон */
  pathCapsule();
  const cosmos = ctx.createLinearGradient(x, y, x + w * 0.2, y + h);
  cosmos.addColorStop(0, 'rgba(46, 16, 84, 0.92)');
  cosmos.addColorStop(0.35, 'rgba(30, 16, 68, 0.94)');
  cosmos.addColorStop(0.7, 'rgba(15, 10, 40, 0.96)');
  cosmos.addColorStop(1, 'rgba(49, 20, 90, 0.92)');
  ctx.fillStyle = cosmos;
  ctx.fill();

  /* Звёздное небо внутри капсулы */
  ctx.save();
  pathCapsule();
  ctx.clip();
  const starColors = ['#67e8f9', '#f0abfc', '#fde68a', '#a5b4fc', '#6ee7b7', '#fda4af'];
  /* Детерминированные «звёзды» от геометрии — без Math.random при каждом кадре */
  const seed = Math.round(x * 13 + y * 17 + w * 7 + h * 3 + t.length * 11);
  const starCount = Math.max(7, Math.round(w / (size * 0.055)));
  for (let i = 0; i < starCount; i++) {
    const sx = x + ((seed * (i + 3) * 17) % 997) / 997 * w;
    const sy = y + ((seed * (i + 5) * 29) % 991) / 991 * h;
    const sr = size * (0.004 + ((seed * (i + 2)) % 5) * 0.0012);
    const sc = starColors[i % starColors.length]!;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fillStyle = sc;
    ctx.globalAlpha = 0.55 + ((i * 17) % 40) / 100;
    ctx.shadowColor = sc;
    ctx.shadowBlur = size * 0.018;
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  /* Туманность / блик сверху */
  const haze = ctx.createRadialGradient(x + w * 0.3, y, 0, x + w * 0.45, y + h * 0.4, w * 0.55);
  haze.addColorStop(0, 'rgba(167, 139, 250, 0.28)');
  haze.addColorStop(0.55, 'rgba(124, 58, 237, 0.1)');
  haze.addColorStop(1, 'rgba(15, 10, 40, 0)');
  ctx.fillStyle = haze;
  ctx.fillRect(x, y, w, h);
  ctx.restore();

  /* Радужная рамка */
  const rim = ctx.createLinearGradient(x, y, x + w, y + h);
  rim.addColorStop(0, '#67e8f9');
  rim.addColorStop(0.22, '#a78bfa');
  rim.addColorStop(0.45, '#f472b6');
  rim.addColorStop(0.68, '#fbbf24');
  rim.addColorStop(0.88, '#34d399');
  rim.addColorStop(1, '#67e8f9');
  pathCapsule();
  ctx.strokeStyle = rim;
  ctx.lineWidth = Math.max(2.2, size * 0.018);
  ctx.stroke();

  /* Тонкий верхний блик */
  ctx.beginPath();
  ctx.moveTo(x + r * 0.45, y + h * 0.18);
  ctx.lineTo(x + w - r * 0.45, y + h * 0.18);
  ctx.strokeStyle = 'rgba(233, 213, 255, 0.35)';
  ctx.lineWidth = Math.max(1, size * 0.007);
  ctx.stroke();

  ctx.font = `600 ${fontPx}px ${AVATAR_BADGE_FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tx = size / 2;
  const ty = y + h / 2 + size * 0.003;

  /* Лазерный перелив — ярче на тёмном небе */
  const laser = ctx.createLinearGradient(x, ty - fontPx * 0.55, x + w, ty + fontPx * 0.55);
  laser.addColorStop(0, '#67e8f9');
  laser.addColorStop(0.2, '#e9d5ff');
  laser.addColorStop(0.4, '#f0abfc');
  laser.addColorStop(0.6, '#fde68a');
  laser.addColorStop(0.8, '#6ee7b7');
  laser.addColorStop(1, '#67e8f9');

  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.shadowColor = 'rgba(2, 6, 23, 0.9)';
  ctx.shadowBlur = size * 0.03;
  ctx.strokeStyle = 'rgba(2, 6, 23, 0.85)';
  ctx.lineWidth = Math.max(2.4, size * 0.014);
  ctx.strokeText(t, tx, ty);
  ctx.shadowBlur = 0;

  ctx.shadowColor = withAlpha(accent, 0.7);
  ctx.shadowBlur = size * 0.04;
  ctx.fillStyle = laser;
  ctx.fillText(t, tx, ty);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(t, tx, ty - size * 0.003);
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** Инициалы поверх уже нарисованного фона (классика по центру). */
export function drawAvatarInitialsOverlay(
  ctx: CanvasRenderingContext2D,
  size: number,
  initials: string,
  color = '#ffffff',
): void {
  drawCenterInitials(ctx, size, initials, { fill: color });
}

/** Отрисовка инициалов по составу + стилю. */
export function paintAvatarInitials(
  ctx: CanvasRenderingContext2D,
  size: number,
  displayName: string,
  source: AvatarInitialsSource,
  style: AvatarInitialsStyle,
  color: string = AVATAR_INITIALS_COLORS[0],
  badgeText?: string,
): void {
  if (style === 'off') return;
  const c = color || AVATAR_INITIALS_COLORS[0];
  if (style === 'badge') {
    drawBadgeInitials(ctx, size, badgeText ?? defaultAvatarBadgeText(displayName), c);
    return;
  }
  const text = resolveAvatarInitialsText(displayName, source);
  switch (style) {
    case 'arc':
      drawArcInitials(ctx, size, text, c);
      return;
    case 'ghost':
      drawCenterInitials(ctx, size, text, {
        fill: c,
        alpha: 0.4,
        shadowColor: 'rgba(2, 6, 23, 0.35)',
        shadowBlur: size * 0.02,
        outlined: true,
        softEdge: true,
      });
      return;
    case 'neon':
      drawNeonAura(ctx, size, c);
      drawCenterInitials(ctx, size, text, {
        fill: c,
        neonPass: true,
      });
      return;
    case 'center':
    default:
      drawCenterInitials(ctx, size, text, { fill: c });
  }
}

/** @deprecated используйте paintAvatarInitials */
export function paintAvatarInitialsByMode(
  ctx: CanvasRenderingContext2D,
  size: number,
  displayName: string,
  mode: AvatarInitialsMode,
  color: string = AVATAR_INITIALS_COLORS[0],
  badgeText?: string,
): void {
  const { initialsSource, initialsStyle } = migrateLegacyInitialsMode(mode);
  paintAvatarInitials(ctx, size, displayName, initialsSource, initialsStyle, color, badgeText);
}

/** Мягкая тёмная «лужа» под буквами — контраст на ярком превью-фоне. */
function fillInitialsContrastPad(ctx: CanvasRenderingContext2D, size: number): void {
  const g = ctx.createRadialGradient(
    size * 0.5,
    size * 0.5,
    size * 0.08,
    size * 0.5,
    size * 0.5,
    size * 0.58,
  );
  g.addColorStop(0, 'rgba(2, 6, 23, 0.62)');
  g.addColorStop(0.55, 'rgba(2, 6, 23, 0.32)');
  g.addColorStop(1, 'rgba(2, 6, 23, 0)');
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();
}

/**
 * Превью на кнопке: стиль или состав.
 * stylePreview — утрированный стиль; иначе превью состава (буквы по центру).
 */
export function paintAvatarInitialsGlyphPreview(
  ctx: CanvasRenderingContext2D,
  size: number,
  displayName: string,
  source: AvatarInitialsSource,
  style: AvatarInitialsStyle,
  initialsColor: string = AVATAR_INITIALS_COLORS[0],
  opts?: { previewKind?: 'source' | 'style' },
): void {
  drawAvatarTemplate(ctx, size, 'aurora', displayName);
  const c = initialsColor || AVATAR_INITIALS_COLORS[0];
  const kind = opts?.previewKind ?? (style === 'off' ? 'style' : 'style');
  const text = resolveAvatarInitialsText(displayName, source);

  if (style === 'off' && kind === 'style') {
    ctx.save();
    ctx.fillStyle = 'rgba(2, 6, 23, 0.34)';
    ctx.fillRect(0, 0, size, size);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.35)';
    ctx.lineWidth = Math.max(1.5, size * 0.028);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(size * 0.32, size * 0.32);
    ctx.lineTo(size * 0.68, size * 0.68);
    ctx.moveTo(size * 0.68, size * 0.32);
    ctx.lineTo(size * 0.32, size * 0.68);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (kind === 'source') {
    fillInitialsContrastPad(ctx, size);
    drawCenterInitials(ctx, size, text, {
      fill: c,
      alpha: 1,
      shadowColor: 'rgba(2, 6, 23, 0.9)',
      shadowBlur: size * 0.06,
      outlined: true,
    });
    return;
  }

  if (style === 'ghost') {
    const g = ctx.createRadialGradient(size * 0.5, size * 0.5, 0, size * 0.5, size * 0.5, size * 0.55);
    g.addColorStop(0, 'rgba(248, 250, 252, 0.18)');
    g.addColorStop(1, 'rgba(2, 6, 23, 0.2)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    drawCenterInitials(ctx, size, text, {
      fill: c,
      alpha: 0.32,
      shadowColor: 'rgba(255, 255, 255, 0.25)',
      shadowBlur: size * 0.015,
      softEdge: true,
      outlined: true,
    });
    return;
  }

  if (style === 'neon') {
    fillInitialsContrastPad(ctx, size);
    ctx.save();
    ctx.fillStyle = 'rgba(2, 6, 23, 0.28)';
    ctx.fillRect(0, 0, size, size);
    ctx.restore();
    drawNeonAura(ctx, size, c);
    drawCenterInitials(ctx, size, text, { fill: c, neonPass: true });
    return;
  }

  fillInitialsContrastPad(ctx, size);
  if (style === 'badge') {
    clipAvatarCanvasToCircle(ctx, size);
    const sample = (() => {
      const n = defaultAvatarBadgeText(displayName);
      const chars = [...n];
      if (chars.length >= 2) return chars.slice(0, 4).join('');
      return 'Name';
    })();
    drawBadgeInitials(ctx, size, sample, c, { showcase: true });
    return;
  }

  if (style === 'arc') {
    drawArcInitials(ctx, size, text, c);
    return;
  }

  drawCenterInitials(ctx, size, text, {
    fill: c,
    alpha: 1,
    shadowColor: 'rgba(2, 6, 23, 0.9)',
    shadowBlur: size * 0.06,
    outlined: true,
  });
}

/**
 * Оставить только круглый диск аватара (полный размер).
 * Плашку рисуем после — бока капсулы торчат за ободок в углы кадра.
 */
export function clipAvatarCanvasToCircle(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.restore();
}

/**
 * Фон / шаблон + опциональные инициалы поверх любого типа базы.
 * Режим badge: полный круг + плашка снизу поверх (края снаружи диска).
 */
export function paintAvatarEditorBase(
  ctx: CanvasRenderingContext2D,
  size: number,
  templateId: AvatarEditorTemplateId,
  displayName: string,
  initialsSource: AvatarInitialsSource,
  initialsStyle: AvatarInitialsStyle,
  initialsColor: string = AVATAR_INITIALS_COLORS[0],
  badgeText?: string,
): void {
  drawAvatarTemplate(ctx, size, templateId, displayName);
  if (initialsStyle === 'badge') {
    clipAvatarCanvasToCircle(ctx, size);
    paintAvatarInitials(ctx, size, displayName, initialsSource, 'badge', initialsColor, badgeText);
    return;
  }
  paintAvatarInitials(
    ctx,
    size,
    displayName,
    initialsSource,
    initialsStyle,
    initialsColor,
    badgeText,
  );
}

function fillSoftDuo(ctx: CanvasRenderingContext2D, size: number, hue: number): void {
  const g = ctx.createRadialGradient(size * 0.32, size * 0.26, 0, size * 0.5, size * 0.55, size * 0.78);
  g.addColorStop(0, `hsl(${hue}, 62%, 58%)`);
  g.addColorStop(0.4, `hsl(${(hue + 28) % 360}, 52%, 42%)`);
  g.addColorStop(0.75, `hsl(${(hue + 58) % 360}, 46%, 26%)`);
  g.addColorStop(1, `hsl(${(hue + 88) % 360}, 40%, 14%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

function fillVignette(ctx: CanvasRenderingContext2D, size: number, alpha = 0.35): void {
  const v = ctx.createRadialGradient(size * 0.5, size * 0.5, size * 0.28, size * 0.5, size * 0.5, size * 0.72);
  v.addColorStop(0, 'transparent');
  v.addColorStop(1, `rgba(2, 6, 23, ${alpha})`);
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, size, size);
}

/** Мелкая диагональная «шотландская» клетка. */
function drawDiagonalPlaid(
  ctx: CanvasRenderingContext2D,
  size: number,
  opts: {
    bg: string;
    colors: string[];
    neon?: string[];
    /** меньше = больше клеток */
    cellDiv?: number;
  },
): void {
  const { bg, colors, neon = [], cellDiv = 36 } = opts;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  const unit = Math.max(2.5, size / cellDiv);
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(-Math.PI / 4);
  const span = size * 1.75;

  /* Основная сетка: чередование тонких / толстых */
  let i = 0;
  for (let x = -span; x < span; ) {
    const thick = i % 4 === 0;
    const mid = i % 4 === 2;
    const w = unit * (thick ? 2.4 : mid ? 1.15 : 0.38);
    const c = colors[i % colors.length] ?? colors[0];
    ctx.globalAlpha = thick ? 0.92 : mid ? 0.55 : 0.28;
    ctx.fillStyle = c;
    ctx.fillRect(x, -span, w, span * 2);
    x += w + unit * 0.35;
    i++;
  }
  i = 0;
  for (let y = -span; y < span; ) {
    const thick = i % 4 === 0;
    const mid = i % 4 === 2;
    const h = unit * (thick ? 2.4 : mid ? 1.15 : 0.38);
    const c = colors[(i + 2) % colors.length] ?? colors[0];
    ctx.globalAlpha = thick ? 0.75 : mid ? 0.4 : 0.2;
    ctx.fillStyle = c;
    ctx.fillRect(-span, y, span * 2, h);
    y += h + unit * 0.35;
    i++;
  }

  /* Неоновые нити поверх */
  if (neon.length) {
    i = 0;
    for (let x = -span; x < span; x += unit * 5.2) {
      const nc = neon[i % neon.length] ?? neon[0];
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = nc;
      ctx.lineWidth = Math.max(1, unit * 0.22);
      ctx.shadowColor = nc;
      ctx.shadowBlur = unit * 1.8;
      ctx.beginPath();
      ctx.moveTo(x, -span);
      ctx.lineTo(x, span);
      ctx.stroke();
      i++;
    }
    i = 0;
    for (let y = -span + unit * 2.6; y < span; y += unit * 5.2) {
      const nc = neon[i % neon.length] ?? neon[0];
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = nc;
      ctx.lineWidth = Math.max(1, unit * 0.18);
      ctx.shadowColor = nc;
      ctx.shadowBlur = unit * 1.5;
      ctx.beginPath();
      ctx.moveTo(-span, y);
      ctx.lineTo(span, y);
      ctx.stroke();
      i++;
    }
    ctx.shadowBlur = 0;
  }

  ctx.restore();
  ctx.globalAlpha = 1;
  fillVignette(ctx, size, neon.length ? 0.18 : 0.12);
}

function drawLetter(
  ctx: CanvasRenderingContext2D,
  size: number,
  letter: string,
  opts?: { y?: number; scale?: number; alpha?: number },
): void {
  const scale = opts?.scale ?? 0.42;
  const y = opts?.y ?? size / 2 + size * 0.02;
  ctx.save();
  ctx.globalAlpha = opts?.alpha ?? 1;
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.font = `700 ${Math.round(size * scale)}px "Exo 2", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(15, 23, 42, 0.4)';
  ctx.shadowBlur = size * 0.03;
  ctx.fillText(letter.slice(0, 2), size / 2, y);
  ctx.restore();
}

function drawNativeAndClever(
  ctx: CanvasRenderingContext2D,
  size: number,
  templateId: AvatarEditorTemplateId,
  displayName: string,
): boolean {
  const hue = hashHue(displayName);
  const letter = getAvatarLettersOnly(displayName).slice(0, 1);

  switch (templateId) {
    case 'monogram': {
      fillSoftDuo(ctx, size, hue);
      const veil = ctx.createRadialGradient(size * 0.5, size * 0.42, 0, size * 0.5, size * 0.5, size * 0.48);
      veil.addColorStop(0, 'rgba(236, 254, 255, 0.2)');
      veil.addColorStop(0.55, 'rgba(236, 254, 255, 0.04)');
      veil.addColorStop(1, 'transparent');
      ctx.fillStyle = veil;
      ctx.fillRect(0, 0, size, size);
      drawLetter(ctx, size, letter, { scale: 0.5 });
      return true;
    }
    case 'soft-disk': {
      /* Полноразмерная сфера в круге аватара — без «окна» внутри */
      const cx = size * 0.5;
      const cy = size * 0.5;
      const R = size * 0.5;
      const ball = ctx.createRadialGradient(cx - R * 0.32, cy - R * 0.36, R * 0.04, cx, cy + R * 0.08, R);
      ball.addColorStop(0, `hsl(${hue}, 72%, 68%)`);
      ball.addColorStop(0.35, `hsl(${(hue + 28) % 360}, 58%, 48%)`);
      ball.addColorStop(0.7, `hsl(${(hue + 70) % 360}, 48%, 28%)`);
      ball.addColorStop(1, `hsl(${(hue + 110) % 360}, 36%, 12%)`);
      ctx.fillStyle = ball;
      ctx.fillRect(0, 0, size, size);
      const hl = ctx.createRadialGradient(cx - R * 0.28, cy - R * 0.34, 0, cx - R * 0.12, cy - R * 0.18, R * 0.5);
      hl.addColorStop(0, 'rgba(255,255,255,0.55)');
      hl.addColorStop(0.4, 'rgba(255,255,255,0.12)');
      hl.addColorStop(1, 'transparent');
      ctx.fillStyle = hl;
      ctx.fillRect(0, 0, size, size);
      return true;
    }
    case 'status-ring': {
      fillSoftDuo(ctx, size, (hue + 20) % 360);
      drawLetter(ctx, size, letter, { scale: 0.4 });
      ctx.save();
      ctx.strokeStyle = 'rgba(103, 232, 249, 0.92)';
      ctx.lineWidth = size * 0.032;
      ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(103, 232, 249, 0.55)';
      ctx.shadowBlur = size * 0.045;
      ctx.beginPath();
      ctx.arc(size * 0.5, size * 0.5, size * 0.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(232, 121, 249, 0.55)';
      ctx.lineWidth = size * 0.014;
      ctx.beginPath();
      ctx.arc(size * 0.5, size * 0.5, size * 0.33, -0.55, 1.65);
      ctx.stroke();
      ctx.restore();
      return true;
    }
    case 'silhouette': {
      /* Единый силуэт без штрихов на шее */
      const sky = ctx.createRadialGradient(size * 0.52, size * 0.18, 0, size * 0.5, size * 0.55, size * 0.82);
      sky.addColorStop(0, '#4c1d95');
      sky.addColorStop(0.4, '#1e1b4b');
      sky.addColorStop(0.78, '#0f172a');
      sky.addColorStop(1, '#020617');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, size, size);
      const glow = ctx.createRadialGradient(size * 0.38, size * 0.3, 0, size * 0.48, size * 0.48, size * 0.55);
      glow.addColorStop(0, 'rgba(125, 211, 252, 0.14)');
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);

      /* голова + плечи одним path — без стыка-«верёвки» */
      ctx.fillStyle = '#020617';
      ctx.beginPath();
      const hx = size * 0.5;
      const hy = size * 0.33;
      const hrX = size * 0.16;
      const hrY = size * 0.175;
      ctx.moveTo(hx, hy - hrY);
      ctx.bezierCurveTo(hx + hrX * 0.95, hy - hrY, hx + hrX, hy - hrY * 0.35, hx + hrX, hy);
      ctx.bezierCurveTo(hx + hrX, hy + hrY * 0.55, hx + hrX * 0.55, hy + hrY * 0.95, hx + hrX * 0.35, hy + hrY);
      ctx.quadraticCurveTo(hx + size * 0.22, hy + size * 0.2, hx + size * 0.32, size * 1.02);
      ctx.lineTo(hx - size * 0.32, size * 1.02);
      ctx.quadraticCurveTo(hx - size * 0.22, hy + size * 0.2, hx - hrX * 0.35, hy + hrY);
      ctx.bezierCurveTo(hx - hrX * 0.55, hy + hrY * 0.95, hx - hrX, hy + hrY * 0.55, hx - hrX, hy);
      ctx.bezierCurveTo(hx - hrX, hy - hrY * 0.35, hx - hrX * 0.95, hy - hrY, hx, hy - hrY);
      ctx.closePath();
      ctx.fill();

      /* только лёгкий блик на макушке */
      ctx.save();
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.28)';
      ctx.lineWidth = size * 0.008;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.ellipse(hx, hy, hrX * 0.92, hrY * 0.92, 0, -Math.PI * 0.92, -Math.PI * 0.08);
      ctx.stroke();
      ctx.restore();
      return true;
    }
    case 'bluff': {
      ctx.fillStyle = '#0b1026';
      ctx.fillRect(0, 0, size, size);
      const ambience = ctx.createRadialGradient(size * 0.5, size * 0.55, 0, size * 0.5, size * 0.5, size * 0.65);
      ambience.addColorStop(0, 'rgba(88, 28, 135, 0.55)');
      ambience.addColorStop(1, 'transparent');
      ctx.fillStyle = ambience;
      ctx.fillRect(0, 0, size, size);
      ctx.save();
      ctx.translate(size * 0.5, size * 0.52);
      ctx.rotate(-0.16);
      const cw = size * 0.4;
      const ch = size * 0.56;
      const rr = size * 0.055;
      const cardPath = () => {
        ctx.beginPath();
        ctx.moveTo(-cw / 2 + rr, -ch / 2);
        ctx.arcTo(cw / 2, -ch / 2, cw / 2, ch / 2, rr);
        ctx.arcTo(cw / 2, ch / 2, -cw / 2, ch / 2, rr);
        ctx.arcTo(-cw / 2, ch / 2, -cw / 2, -ch / 2, rr);
        ctx.arcTo(-cw / 2, -ch / 2, cw / 2, -ch / 2, rr);
        ctx.closePath();
      };
      ctx.fillStyle = '#0f172a';
      cardPath();
      ctx.fill();
      /* неоновое свечение */
      ctx.shadowColor = 'rgba(34, 211, 238, 0.95)';
      ctx.shadowBlur = size * 0.06;
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = size * 0.022;
      cardPath();
      ctx.stroke();
      ctx.shadowColor = 'rgba(232, 121, 249, 0.9)';
      ctx.shadowBlur = size * 0.05;
      ctx.strokeStyle = '#e879f9';
      ctx.lineWidth = size * 0.012;
      ctx.strokeRect(-cw * 0.3, -ch * 0.3, cw * 0.6, ch * 0.6);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(167, 139, 250, 0.45)';
      ctx.strokeStyle = 'rgba(103, 232, 249, 0.85)';
      ctx.lineWidth = size * 0.01;
      ctx.beginPath();
      ctx.moveTo(0, -ch * 0.16);
      ctx.lineTo(cw * 0.15, 0);
      ctx.lineTo(0, ch * 0.16);
      ctx.lineTo(-cw * 0.15, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return true;
    }
    case 'lucky-7': {
      /*
       * Премиум lucky-7: золотой 3D-шар + цельная золотая «7»
       * (фон и цифра в одной «дорогой» палитре).
       */
      const cx = size * 0.5;
      const cy = size * 0.5;
      const R = size * 0.5;

      /* Базовый объём шара — радиальный «металл» */
      const ball = ctx.createRadialGradient(
        cx - R * 0.32,
        cy - R * 0.36,
        R * 0.04,
        cx + R * 0.08,
        cy + R * 0.12,
        R * 1.12,
      );
      ball.addColorStop(0, '#fffbeb');
      ball.addColorStop(0.12, '#fef3c7');
      ball.addColorStop(0.28, '#fde68a');
      ball.addColorStop(0.45, '#fbbf24');
      ball.addColorStop(0.62, '#f59e0b');
      ball.addColorStop(0.8, '#b45309');
      ball.addColorStop(1, '#451a03');
      ctx.fillStyle = ball;
      ctx.fillRect(0, 0, size, size);

      /* Спекулярный блик — выпуклость */
      const spec = ctx.createRadialGradient(
        cx - R * 0.3,
        cy - R * 0.34,
        0,
        cx - R * 0.18,
        cy - R * 0.22,
        R * 0.38,
      );
      spec.addColorStop(0, 'rgba(255,255,255,0.85)');
      spec.addColorStop(0.35, 'rgba(254, 243, 199, 0.45)');
      spec.addColorStop(0.7, 'rgba(251, 191, 36, 0.12)');
      spec.addColorStop(1, 'transparent');
      ctx.fillStyle = spec;
      ctx.fillRect(0, 0, size, size);

      /* Кольцевой fresnel по краю — шар «круглится» */
      const rim = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R * 0.98);
      rim.addColorStop(0, 'transparent');
      rim.addColorStop(0.65, 'transparent');
      rim.addColorStop(0.85, 'rgba(120, 53, 15, 0.25)');
      rim.addColorStop(1, 'rgba(69, 26, 3, 0.55)');
      ctx.fillStyle = rim;
      ctx.fillRect(0, 0, size, size);

      /* Нижняя контактная тень объёма */
      const shade = ctx.createRadialGradient(
        cx + R * 0.1,
        cy + R * 0.4,
        0,
        cx + R * 0.02,
        cy + R * 0.15,
        R * 0.85,
      );
      shade.addColorStop(0, 'rgba(69, 26, 3, 0.5)');
      shade.addColorStop(0.55, 'rgba(120, 53, 15, 0.18)');
      shade.addColorStop(1, 'transparent');
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, size, size);

      /* Тонкий золотой обод круга */
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.985, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(254, 243, 199, 0.55)';
      ctx.lineWidth = size * 0.012;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.97, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(146, 64, 14, 0.45)';
      ctx.lineWidth = size * 0.008;
      ctx.stroke();

      const sevenY = cy + size * 0.01;
      const fontPx = Math.round(size * 0.56);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${fontPx}px "Exo 2", system-ui, sans-serif`;
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;

      /*
       * Естественная тень на шаре: свет сверху-слева,
       * поэтому тень мягкая, смещена вниз-вправо и чуть размыта.
       */
      ctx.save();
      ctx.filter = `blur(${Math.max(2, size * 0.018)}px)`;
      ctx.fillStyle = 'rgba(69, 26, 3, 0.42)';
      ctx.fillText('7', cx + size * 0.028, sevenY + size * 0.04);
      ctx.restore();
      ctx.save();
      ctx.filter = `blur(${Math.max(1, size * 0.008)}px)`;
      ctx.fillStyle = 'rgba(28, 10, 2, 0.55)';
      ctx.fillText('7', cx + size * 0.014, sevenY + size * 0.02);
      ctx.restore();

      /* Контрастный «скос» — глубокий янтарь, не цвет шара */
      ctx.fillStyle = '#451a03';
      ctx.fillText('7', cx + size * 0.012, sevenY + size * 0.014);

      /* Семёрка: жемчуг → белое золото → тёплый янтарь (читается на шаре) */
      const gold = ctx.createLinearGradient(cx, sevenY - size * 0.3, cx, sevenY + size * 0.32);
      gold.addColorStop(0, '#ffffff');
      gold.addColorStop(0.18, '#fffbeb');
      gold.addColorStop(0.4, '#fde68a');
      gold.addColorStop(0.62, '#f59e0b');
      gold.addColorStop(1, '#9a3412');
      ctx.fillStyle = gold;
      ctx.fillText('7', cx, sevenY);

      ctx.strokeStyle = 'rgba(28, 10, 2, 0.85)';
      ctx.lineWidth = size * 0.02;
      ctx.strokeText('7', cx, sevenY);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = size * 0.007;
      ctx.strokeText('7', cx - size * 0.004, sevenY - size * 0.005);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.2, sevenY - size * 0.28);
      ctx.lineTo(cx + size * 0.18, sevenY - size * 0.28);
      ctx.lineTo(cx + size * 0.12, sevenY - size * 0.14);
      ctx.lineTo(cx - size * 0.14, sevenY - size * 0.14);
      ctx.closePath();
      ctx.clip();
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#ffffff';
      ctx.fillText('7', cx, sevenY);
      ctx.restore();

      return true;
    }
    case 'mirror': {
      const left = ctx.createLinearGradient(0, 0, size / 2, size);
      left.addColorStop(0, '#0ea5e9');
      left.addColorStop(1, '#312e81');
      ctx.fillStyle = left;
      ctx.fillRect(0, 0, size / 2, size);
      const right = ctx.createLinearGradient(size / 2, 0, size, size);
      right.addColorStop(0, '#db2777');
      right.addColorStop(1, '#4c1d95');
      ctx.fillStyle = right;
      ctx.fillRect(size / 2, 0, size / 2, size);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(size / 2 - size * 0.01, 0, size * 0.02, size);
      drawLetter(ctx, size, letter, { scale: 0.4, alpha: 0.92 });
      return true;
    }
    case 'player-rise': {
      const g = ctx.createLinearGradient(0, size * 0.15, size, size * 0.85);
      g.addColorStop(0, '#0f172a');
      g.addColorStop(0.45, '#312e81');
      g.addColorStop(0.78, '#0891b2');
      g.addColorStop(1, '#67e8f9');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      const disc = ctx.createRadialGradient(size * 0.5, size * 0.48, 0, size * 0.5, size * 0.52, size * 0.36);
      disc.addColorStop(0, 'rgba(255,255,255,0.38)');
      disc.addColorStop(0.45, 'rgba(103, 232, 249, 0.28)');
      disc.addColorStop(1, 'transparent');
      ctx.fillStyle = disc;
      ctx.fillRect(0, 0, size, size);
      ctx.save();
      ctx.shadowColor = 'rgba(34, 211, 238, 0.85)';
      ctx.shadowBlur = size * 0.06;
      ctx.fillStyle = 'rgba(255,255,255,0.98)';
      ctx.font = `700 ${Math.round(size * 0.38)}px "Exo 2", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter.slice(0, 1), size * 0.5, size * 0.48);
      ctx.restore();
      ctx.strokeStyle = 'rgba(253, 224, 71, 0.75)';
      ctx.lineWidth = size * 0.016;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(size * 0.5, size * 0.82);
      ctx.lineTo(size * 0.5, size * 0.68);
      ctx.moveTo(size * 0.44, size * 0.74);
      ctx.lineTo(size * 0.5, size * 0.66);
      ctx.lineTo(size * 0.56, size * 0.74);
      ctx.stroke();
      return true;
    }
    default:
      return false;
  }
}

export function drawAvatarTemplate(
  ctx: CanvasRenderingContext2D,
  size: number,
  templateId: AvatarEditorTemplateId,
  displayName: string,
): void {
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();

  if (drawNativeAndClever(ctx, size, templateId, displayName)) {
    ctx.restore();
    return;
  }

  const hue = hashHue(displayName);

  switch (templateId) {
    case 'nebula': {
      ctx.fillStyle = '#070b1a';
      ctx.fillRect(0, 0, size, size);
      const core = ctx.createRadialGradient(size * 0.38, size * 0.32, 0, size * 0.45, size * 0.48, size * 0.7);
      core.addColorStop(0, '#67e8f9');
      core.addColorStop(0.28, '#22d3ee');
      core.addColorStop(0.55, '#7c3aed');
      core.addColorStop(1, 'transparent');
      ctx.fillStyle = core;
      ctx.fillRect(0, 0, size, size);
      const bloom = ctx.createRadialGradient(size * 0.72, size * 0.7, 0, size * 0.6, size * 0.62, size * 0.5);
      bloom.addColorStop(0, 'rgba(244, 114, 182, 0.7)');
      bloom.addColorStop(0.55, 'rgba(167, 139, 250, 0.28)');
      bloom.addColorStop(1, 'transparent');
      ctx.fillStyle = bloom;
      ctx.fillRect(0, 0, size, size);
      const soft = ctx.createRadialGradient(size * 0.2, size * 0.75, 0, size * 0.35, size * 0.65, size * 0.4);
      soft.addColorStop(0, 'rgba(56, 189, 248, 0.35)');
      soft.addColorStop(1, 'transparent');
      ctx.fillStyle = soft;
      ctx.fillRect(0, 0, size, size);
      fillVignette(ctx, size, 0.4);
      break;
    }
    case 'aurora': {
      const base = ctx.createLinearGradient(0, size, size, 0);
      base.addColorStop(0, '#042f2e');
      base.addColorStop(0.35, '#0f766e');
      base.addColorStop(0.65, '#0891b2');
      base.addColorStop(1, '#1e1b4b');
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, size, size);
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#5eead4';
      ctx.beginPath();
      ctx.ellipse(size * 0.48, size * 0.38, size * 0.58, size * 0.16, -0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = '#67e8f9';
      ctx.beginPath();
      ctx.ellipse(size * 0.55, size * 0.52, size * 0.5, size * 0.12, 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#a7f3d0';
      ctx.beginPath();
      ctx.ellipse(size * 0.4, size * 0.28, size * 0.42, size * 0.1, -0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      fillVignette(ctx, size, 0.32);
      break;
    }
    case 'ember': {
      const g = ctx.createRadialGradient(size * 0.35, size * 0.7, 0, size * 0.45, size * 0.4, size * 0.85);
      g.addColorStop(0, '#fb923c');
      g.addColorStop(0.25, '#ea580c');
      g.addColorStop(0.5, '#db2777');
      g.addColorStop(0.75, '#7c3aed');
      g.addColorStop(1, '#1e1b4b');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      const glow = ctx.createRadialGradient(size * 0.55, size * 0.25, 0, size * 0.5, size * 0.35, size * 0.45);
      glow.addColorStop(0, 'rgba(253, 224, 71, 0.45)');
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);
      fillVignette(ctx, size, 0.28);
      break;
    }
    case 'violet-crown': {
      ctx.fillStyle = '#1e1b4b';
      ctx.fillRect(0, 0, size, size);
      const g = ctx.createRadialGradient(size * 0.5, size * 0.12, 0, size * 0.5, size * 0.5, size * 0.78);
      g.addColorStop(0, '#fde68a');
      g.addColorStop(0.18, '#f0abfc');
      g.addColorStop(0.42, '#c084fc');
      g.addColorStop(0.72, '#5b21b6');
      g.addColorStop(1, '#0f172a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      fillVignette(ctx, size, 0.3);
      break;
    }
    case 'deep-space': {
      /* Цветной космос без широкой диагональной полосы */
      ctx.fillStyle = '#01040f';
      ctx.fillRect(0, 0, size, size);

      const cloudA = ctx.createRadialGradient(size * 0.18, size * 0.28, 0, size * 0.28, size * 0.38, size * 0.48);
      cloudA.addColorStop(0, 'rgba(34, 211, 238, 0.55)');
      cloudA.addColorStop(0.35, 'rgba(99, 102, 241, 0.28)');
      cloudA.addColorStop(1, 'transparent');
      ctx.fillStyle = cloudA;
      ctx.fillRect(0, 0, size, size);

      const cloudB = ctx.createRadialGradient(size * 0.82, size * 0.58, 0, size * 0.72, size * 0.55, size * 0.45);
      cloudB.addColorStop(0, 'rgba(244, 114, 182, 0.5)');
      cloudB.addColorStop(0.4, 'rgba(168, 85, 247, 0.28)');
      cloudB.addColorStop(1, 'transparent');
      ctx.fillStyle = cloudB;
      ctx.fillRect(0, 0, size, size);

      const cloudC = ctx.createRadialGradient(size * 0.55, size * 0.12, 0, size * 0.52, size * 0.22, size * 0.32);
      cloudC.addColorStop(0, 'rgba(253, 224, 71, 0.35)');
      cloudC.addColorStop(0.45, 'rgba(251, 146, 60, 0.15)');
      cloudC.addColorStop(1, 'transparent');
      ctx.fillStyle = cloudC;
      ctx.fillRect(0, 0, size, size);

      const cloudD = ctx.createRadialGradient(size * 0.4, size * 0.78, 0, size * 0.42, size * 0.7, size * 0.36);
      cloudD.addColorStop(0, 'rgba(52, 211, 153, 0.28)');
      cloudD.addColorStop(1, 'transparent');
      ctx.fillStyle = cloudD;
      ctx.fillRect(0, 0, size, size);

      const STAR_COLORS = [
        '255,255,255',
        '165,243,252',
        '250,204,255',
        '254,240,138',
        '253,164,175',
        '167,243,208',
      ] as const;
      for (let i = 0; i < 100; i++) {
        const n1 = ((i * 127.1 + 311.7) % 1000) / 1000;
        const n2 = ((i * 269.5 + 183.3) % 1000) / 1000;
        const n3 = ((i * 419.2 + 71.9) % 1000) / 1000;
        const clusterBias = i % 3 === 0 ? 0.16 : i % 3 === 1 ? -0.1 : 0.04;
        const x = (n1 * 0.92 + clusterBias * (i % 2 === 0 ? 1 : -0.35) + 0.04) * size;
        const y = (n2 * 0.9 + (i % 7 === 0 ? -0.1 : 0.05) * n3 + 0.03) * size;
        const rad = size * (0.0015 + n3 * 0.005 + (i % 9 === 0 ? 0.004 : 0));
        const rgb = STAR_COLORS[i % STAR_COLORS.length];
        const a = 0.4 + n3 * 0.55;
        ctx.fillStyle = `rgba(${rgb},${a})`;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.55, rad), 0, Math.PI * 2);
        ctx.fill();
        if (i % 10 === 0) {
          ctx.strokeStyle = `rgba(${rgb},${0.35 + n3 * 0.3})`;
          ctx.lineWidth = Math.max(0.5, size * 0.0015);
          ctx.beginPath();
          ctx.moveTo(x - rad * 2.6, y);
          ctx.lineTo(x + rad * 2.6, y);
          ctx.moveTo(x, y - rad * 2.6);
          ctx.lineTo(x, y + rad * 2.6);
          ctx.stroke();
        }
      }

      const edge = ctx.createRadialGradient(size * 0.4, size * 0.35, size * 0.2, size * 0.55, size * 0.58, size * 0.82);
      edge.addColorStop(0, 'transparent');
      edge.addColorStop(1, 'rgba(2, 6, 23, 0.45)');
      ctx.fillStyle = edge;
      ctx.fillRect(0, 0, size, size);
      break;
    }
    case 'prism': {
      const g = ctx.createLinearGradient(0, 0, size, size);
      g.addColorStop(0, '#f472b6');
      g.addColorStop(0.2, '#c084fc');
      g.addColorStop(0.4, '#38bdf8');
      g.addColorStop(0.6, '#34d399');
      g.addColorStop(0.8, '#fbbf24');
      g.addColorStop(1, '#fb7185');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
      ctx.fillRect(0, 0, size, size);
      const sheen = ctx.createLinearGradient(0, 0, size * 0.3, size);
      sheen.addColorStop(0, 'rgba(255,255,255,0.28)');
      sheen.addColorStop(0.4, 'transparent');
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, size, size);
      fillVignette(ctx, size, 0.25);
      break;
    }
    case 'none': {
      /* пустой: мягкая сетка, без «кричащей» шахматки */
      ctx.fillStyle = '#111827';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
      ctx.lineWidth = Math.max(1, size * 0.003);
      const step = Math.max(10, Math.round(size / 12));
      for (let x = step; x < size; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, size);
        ctx.stroke();
      }
      for (let y = step; y < size; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size, y);
        ctx.stroke();
      }
      break;
    }
    case 'elite-black': {
      ctx.fillStyle = '#030712';
      ctx.fillRect(0, 0, size, size);
      const sheen = ctx.createRadialGradient(size * 0.35, size * 0.28, 0, size * 0.5, size * 0.55, size * 0.7);
      sheen.addColorStop(0, 'rgba(148, 163, 184, 0.14)');
      sheen.addColorStop(0.45, 'rgba(51, 65, 85, 0.08)');
      sheen.addColorStop(1, 'transparent');
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, size, size);
      const rim = ctx.createRadialGradient(size * 0.5, size * 0.5, size * 0.32, size * 0.5, size * 0.5, size * 0.5);
      rim.addColorStop(0, 'transparent');
      rim.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
      ctx.fillStyle = rim;
      ctx.fillRect(0, 0, size, size);
      break;
    }
    case 'neutral': {
      const g = ctx.createLinearGradient(0, 0, size, size);
      g.addColorStop(0, '#e2e8f0');
      g.addColorStop(0.35, '#cbd5e1');
      g.addColorStop(0.7, '#94a3b8');
      g.addColorStop(1, '#64748b');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      const soft = ctx.createRadialGradient(size * 0.4, size * 0.3, 0, size * 0.5, size * 0.55, size * 0.7);
      soft.addColorStop(0, 'rgba(255,255,255,0.45)');
      soft.addColorStop(1, 'transparent');
      ctx.fillStyle = soft;
      ctx.fillRect(0, 0, size, size);
      fillVignette(ctx, size, 0.18);
      break;
    }
    case 'plaid-iris': {
      drawDiagonalPlaid(ctx, size, {
        bg: '#1a1040',
        colors: ['#4c1d95', '#7c3aed', '#a78bfa', '#818cf8', '#c4b5fd', '#6366f1'],
        neon: ['#22d3ee', '#e879f9', '#67e8f9', '#f0abfc'],
        cellDiv: 42,
      });
      break;
    }
    case 'plaid-sand': {
      drawDiagonalPlaid(ctx, size, {
        bg: '#f5ebd8',
        colors: ['#8b5e34', '#a67c52', '#c4a574', '#6b4423', '#d2b48c', '#5eead4'],
        neon: [],
        cellDiv: 34,
      });
      break;
    }
    default:
      break;
  }

  const skipHueWash =
    templateId === 'none' ||
    templateId === 'elite-black' ||
    templateId === 'neutral' ||
    templateId === 'plaid-iris' ||
    templateId === 'plaid-sand';
  if (!skipHueWash) {
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = `hsl(${hue}, 70%, 55%)`;
    ctx.fillRect(0, 0, size, size);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

export function drawPhotoCover(ctx: CanvasRenderingContext2D, size: number, img: HTMLImageElement): void {
  drawPhotoWithTransform(ctx, size, img, 1, 0, 0);
}

/** Фото поверх фона: масштаб (1 = cover) и сдвиг в пикселях холста.
 *  Авто: PNG с полями «плашка снизу» — рисуем только лицо (без чёрного кольца в редакторе).
 */
export function drawPhotoWithTransform(
  ctx: CanvasRenderingContext2D,
  size: number,
  img: HTMLImageElement,
  userScale: number,
  offsetX: number,
  offsetY: number,
  opts?: { cropBadgePad?: boolean },
): void {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  let sx = 0;
  let sy = 0;
  let sw = iw;
  let sh = ih;
  const crop =
    opts?.cropBadgePad === true ||
    (opts?.cropBadgePad !== false && avatarImageHasTransparentBadgePad(img));
  if (crop) {
    ({ sx, sy, sw, sh } = getAvatarBadgePadFaceRect(img));
  }
  const cover = Math.max(size / sw, size / sh);
  const scale = cover * Math.max(0.2, userScale);
  const w = sw * scale;
  const h = sh * scale;
  const x = (size - w) / 2 + offsetX;
  const y = (size - h) / 2 + offsetY;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

export function drawInitialsBase(
  ctx: CanvasRenderingContext2D,
  size: number,
  displayName: string,
  initials: string,
): void {
  fillSoftDuo(ctx, size, hashHue(displayName));
  drawAvatarInitialsOverlay(ctx, size, initials);
}
