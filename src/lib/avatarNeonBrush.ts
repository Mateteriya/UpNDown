/**
 * Неоновый штрих кисти на canvas (свечение как у свотчей палитры).
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

function mixWithWhite(hex: string, whiteRatio: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const t = Math.min(1, Math.max(0, whiteRatio));
  const r = Math.round(rgb.r + (255 - rgb.r) * t);
  const g = Math.round(rgb.g + (255 - rgb.g) * t);
  const b = Math.round(rgb.b + (255 - rgb.b) * t);
  return `rgb(${r},${g},${b})`;
}

/** Рисует текущий path с неоновым свечением (path уже задан в ctx). */
export function paintNeonBrushStroke(
  ctx: CanvasRenderingContext2D,
  color: string,
  lineWidth: number,
): void {
  const glow = Math.max(12, lineWidth * 3.2);
  const mid = Math.max(6, lineWidth * 1.6);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  ctx.stroke();

  ctx.shadowBlur = mid;
  ctx.globalAlpha = 0.55;
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  const prevW = ctx.lineWidth;
  ctx.lineWidth = Math.max(1, lineWidth * 0.38);
  ctx.strokeStyle = mixWithWhite(color, 0.42);
  ctx.stroke();

  ctx.lineWidth = prevW;
  ctx.restore();
}
