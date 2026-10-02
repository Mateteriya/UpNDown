/**
 * Кисть редактора аватарки: сплошная / пунктирная.
 * Быстрый path через ctx.stroke (без shadowBlur и без сотен dab-заливок).
 */

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const c = hex.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(c)) return null;
  return {
    r: parseInt(c.slice(1, 3), 16),
    g: parseInt(c.slice(3, 5), 16),
    b: parseInt(c.slice(5, 7), 16),
  };
}

export function mixWithWhite(hex: string, whiteRatio: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const t = Math.min(1, Math.max(0, whiteRatio));
  const r = Math.round(rgb.r + (255 - rgb.r) * t);
  const g = Math.round(rgb.g + (255 - rgb.g) * t);
  const b = Math.round(rgb.b + (255 - rgb.b) * t);
  return `rgb(${r},${g},${b})`;
}

export type BrushStrokeKind = 'solid' | 'dashed';
export type BrushTipKind = BrushStrokeKind;
export type DashStrokeState = { dist: number };

function strokeSegment(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  ctx.beginPath();
  if (Math.hypot(x1 - x0, y1 - y0) < 0.2) {
    /* Точка клика — круглый отпечаток через короткий штрих */
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + 0.01, y0);
  } else {
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
  }
  ctx.stroke();
}

/**
 * Один сегмент штриха. Для пунктира передайте `dashState` (накапливает длину пути).
 */
export function paintBrushStrokeSegment(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  size: number,
  color: string,
  kind: BrushStrokeKind,
  neon: boolean,
  dashState?: DashStrokeState,
): void {
  const s = Math.max(1.5, size);
  const dist = Math.hypot(x1 - x0, y1 - y0);

  ctx.save();
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (kind === 'dashed') {
    const dash = Math.max(5, s * 2.4);
    const gap = Math.max(4, s * 1.7);
    const state = dashState ?? { dist: 0 };
    ctx.setLineDash([dash, gap]);
    ctx.lineDashOffset = -state.dist;
    state.dist += Math.max(dist, 0.01);
  } else {
    ctx.setLineDash([]);
  }

  if (neon) {
    /* 2 прохода: мягкое кольцо + ядро (без shadowBlur) */
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = s * 1.35;
    strokeSegment(ctx, x0, y0, x1, y1);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = mixWithWhite(color, 0.35);
    ctx.lineWidth = s;
    strokeSegment(ctx, x0, y0, x1, y1);
  } else {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = s;
    strokeSegment(ctx, x0, y0, x1, y1);
  }

  ctx.restore();
}

/** @deprecated */
export function paintBrushDab(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
  neon: boolean,
): void {
  paintBrushStrokeSegment(ctx, x, y, x, y, size, color, 'solid', neon);
}

/** @deprecated */
export function paintNeonBrushStroke(
  ctx: CanvasRenderingContext2D,
  color: string,
  lineWidth: number,
  _kind: BrushStrokeKind = 'solid',
): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.95;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = Math.max(1, lineWidth * 0.45);
  ctx.strokeStyle = mixWithWhite(color, 0.5);
  ctx.stroke();
  ctx.restore();
}
