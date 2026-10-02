/**
 * Штампы форм и заливка для слоя кисти редактора аватарки.
 */

import { mixWithWhite } from './avatarNeonBrush';

export type BrushStampId = 'circle' | 'star' | 'heart' | 'smile' | 'bolt';

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const c = hex.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(c)) return null;
  return {
    r: parseInt(c.slice(1, 3), 16),
    g: parseInt(c.slice(3, 5), 16),
    b: parseInt(c.slice(5, 7), 16),
  };
}

function hexToRgba(hex: string, alpha = 1): { r: number; g: number; b: number; a: number } | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return {
    ...rgb,
    a: Math.round(Math.min(1, Math.max(0, alpha)) * 255),
  };
}

function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.5;
  return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
}

/** Только почти нейтральный белый — жёлтый/лайм не считаем «белым». */
function isNearWhite(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  const { r, g, b } = rgb;
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const chroma = maxC - minC;
  return maxC >= 248 && minC >= 230 && chroma <= 28;
}

function mixTowardBlack(hex: string, blackRatio: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const t = Math.min(1, Math.max(0, blackRatio));
  const r = Math.round(rgb.r * (1 - t));
  const g = Math.round(rgb.g * (1 - t));
  const b = Math.round(rgb.b * (1 - t));
  return `rgb(${r},${g},${b})`;
}

/** Пары для «двойного» неона: обод / корпус / ядро / черты лица. */
function stampNeonPalette(color: string): {
  glow: string;
  body: string;
  core: string;
  ink: string;
} {
  if (isNearWhite(color)) {
    return {
      glow: '#22d3ee',
      body: '#f8fafc',
      core: '#e0f2fe',
      ink: '#312e81',
    };
  }
  return {
    glow: color,
    body: color,
    core: mixWithWhite(color, 0.62),
    ink: luminance(color) > 0.55 ? mixTowardBlack(color, 0.45) : mixWithWhite(color, 0.88),
  };
}

function buildStampPath(
  ctx: CanvasRenderingContext2D,
  stamp: Exclude<BrushStampId, 'smile'>,
  r: number,
): void {
  ctx.beginPath();
  if (stamp === 'circle') {
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    return;
  }
  if (stamp === 'heart') {
    ctx.moveTo(0, r * 0.72);
    ctx.bezierCurveTo(r * 0.15, r * 0.4, r * 1.05, r * 0.05, r * 1.02, -r * 0.32);
    ctx.bezierCurveTo(r * 1.0, -r * 0.72, r * 0.45, -r * 0.92, 0, -r * 0.42);
    ctx.bezierCurveTo(-r * 0.45, -r * 0.92, -r * 1.0, -r * 0.72, -r * 1.02, -r * 0.32);
    ctx.bezierCurveTo(-r * 1.05, r * 0.05, -r * 0.15, r * 0.4, 0, r * 0.72);
    ctx.closePath();
    return;
  }
  if (stamp === 'bolt') {
    ctx.moveTo(r * 0.12, -r);
    ctx.lineTo(-r * 0.28, r * 0.08);
    ctx.lineTo(r * 0.02, r * 0.08);
    ctx.lineTo(-r * 0.12, r);
    ctx.lineTo(r * 0.35, -r * 0.05);
    ctx.lineTo(r * 0.02, -r * 0.05);
    ctx.closePath();
    return;
  }
  /* star */
  const spikes = 5;
  const outer = r;
  const inner = r * 0.42;
  for (let i = 0; i < spikes * 2; i += 1) {
    const rad = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / spikes;
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Неоновый «двойной» штамп: bloom + обод + светлое ядро (молния — сильнее). */
function fillStampNeonDouble(
  ctx: CanvasRenderingContext2D,
  stamp: Exclude<BrushStampId, 'smile'>,
  r: number,
  color: string,
): void {
  const pal = stampNeonPalette(color);
  const isBolt = stamp === 'bolt';

  if (isBolt) {
    /* Мягкий bloom-ореол под молнией */
    buildStampPath(ctx, stamp, r * 1.08);
    ctx.shadowColor = pal.glow;
    ctx.shadowBlur = r * 2.8;
    ctx.fillStyle = pal.glow;
    ctx.globalAlpha = 0.45;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  buildStampPath(ctx, stamp, r);
  ctx.shadowColor = pal.glow;
  ctx.shadowBlur = r * (isBolt ? 2.35 : 1.95);
  ctx.fillStyle = pal.body;
  ctx.fill();

  /* Цветной обод — читается даже на белом */
  ctx.shadowBlur = r * (isBolt ? 0.55 : 0.35);
  ctx.strokeStyle = pal.glow;
  ctx.lineWidth = Math.max(2, r * (isBolt ? 0.16 : 0.1));
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.shadowBlur = r * (isBolt ? 1.15 : 0.9);
  ctx.fillStyle = mixWithWhite(pal.body, isNearWhite(color) ? 0.1 : 0.3);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = pal.core;
  ctx.globalAlpha = 0.95;
  buildStampPath(ctx, stamp, r * (isBolt ? 0.4 : 0.48));
  ctx.fill();
  ctx.globalAlpha = 1;

  if (isBolt) {
    buildStampPath(ctx, stamp, r);
    ctx.strokeStyle = mixWithWhite(pal.glow, 0.62);
    ctx.lineWidth = Math.max(1.6, r * 0.07);
    ctx.shadowColor = pal.glow;
    ctx.shadowBlur = r * 0.7;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

/** Смайлик на весь круг: без двойного обода, крупная рожица, контрастные глаза. */
function paintSmileStamp(ctx: CanvasRenderingContext2D, r: number, color: string): void {
  const pal = stampNeonPalette(color);
  const faceFill = isNearWhite(color) ? pal.body : color;

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.shadowColor = pal.glow;
  ctx.shadowBlur = r * 1.65;
  ctx.fillStyle = faceFill;
  ctx.fill();
  ctx.shadowBlur = 0;

  const eyeOuter = r * 0.145;
  const eyeInner = r * 0.085;
  const paintEye = (ex: number, ey: number, pupil: string) => {
    ctx.beginPath();
    ctx.arc(ex, ey, eyeOuter, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(2, 6, 23, 0.72)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex, ey, eyeOuter * 0.86, 0, Math.PI * 2);
    ctx.fillStyle = '#e2e8f0';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex, ey, eyeInner, 0, Math.PI * 2);
    ctx.fillStyle = pupil;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex - eyeInner * 0.2, ey - eyeInner * 0.22, eyeInner * 0.24, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.fill();
  };
  paintEye(-r * 0.32, -r * 0.14, mixTowardBlack(pal.glow, 0.55));
  paintEye(r * 0.32, -r * 0.12, mixTowardBlack(pal.glow, 0.48));

  /* Улыбка ниже — ближе к «подбородку», не у «носа» */
  ctx.beginPath();
  ctx.moveTo(-r * 0.32, r * 0.38);
  ctx.quadraticCurveTo(r * 0.02, r * 0.62, r * 0.32, r * 0.38);
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = Math.max(2.2, r * 0.09);
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(15, 23, 42, 0.35)';
  ctx.shadowBlur = r * 0.08;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

/**
 * Штамп — всегда неоново-двойной; белый тоже читается (cyan-обод + тёмные черты).
 */
export function paintBrushStamp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  stamp: BrushStampId,
  color: string,
  brushSize: number,
  _neon: boolean,
): void {
  const r = Math.max(20, brushSize * 4.2);
  ctx.save();
  ctx.translate(x, y);
  if (stamp === 'smile') {
    paintSmileStamp(ctx, r, color);
  } else {
    fillStampNeonDouble(ctx, stamp, r, color);
  }
  ctx.restore();
}

function colorNear(
  data: Uint8ClampedArray,
  i: number,
  tr: number,
  tg: number,
  tb: number,
  ta: number,
  tol: number,
): boolean {
  const dr = Math.abs(data[i]! - tr);
  const dg = Math.abs(data[i + 1]! - tg);
  const db = Math.abs(data[i + 2]! - tb);
  const da = Math.abs(data[i + 3]! - ta);
  return dr <= tol && dg <= tol && db <= tol && da <= tol;
}

/**
 * Заливка на слое кисти от точки клика (только внутри круга аватара).
 * Не трогает базовый слой (фото / шаблон / инициалы).
 */
export function floodFillBrushLayer(
  ctx: CanvasRenderingContext2D,
  size: number,
  sx: number,
  sy: number,
  fillHex: string,
  neon: boolean,
): boolean {
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  if (x0 < 0 || y0 < 0 || x0 >= size || y0 >= size) return false;

  const cx = size / 2;
  const cy = size / 2;
  const maxR2 = (size * 0.5 - 1.5) ** 2;
  if ((x0 - cx) ** 2 + (y0 - cy) ** 2 > maxR2) return false;

  const base = hexToRgba(fillHex, 1);
  if (!base) return false;
  const lift = neon ? 0.22 : 0;
  const fill = {
    r: Math.round(base.r + (255 - base.r) * lift),
    g: Math.round(base.g + (255 - base.g) * lift),
    b: Math.round(base.b + (255 - base.b) * lift),
    a: neon ? 235 : 255,
  };

  const img = ctx.getImageData(0, 0, size, size);
  const { data } = img;
  const start = (x0 + y0 * size) * 4;
  const tr = data[start]!;
  const tg = data[start + 1]!;
  const tb = data[start + 2]!;
  const ta = data[start + 3]!;

  if (colorNear(data, start, fill.r, fill.g, fill.b, fill.a, 6)) return false;

  const tol = ta < 24 ? 28 : 36;
  const stack: number[] = [x0, y0];
  const seen = new Uint8Array(size * size);
  let painted = 0;

  while (stack.length) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    if (x < 0 || y < 0 || x >= size || y >= size) continue;
    if ((x - cx) ** 2 + (y - cy) ** 2 > maxR2) continue;
    const p = y * size + x;
    if (seen[p]) continue;
    seen[p] = 1;
    const i = p * 4;
    if (!colorNear(data, i, tr, tg, tb, ta, tol)) continue;

    data[i] = fill.r;
    data[i + 1] = fill.g;
    data[i + 2] = fill.b;
    data[i + 3] = fill.a;
    painted += 1;

    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }

  if (!painted) return false;
  ctx.putImageData(img, 0, 0);
  return true;
}
