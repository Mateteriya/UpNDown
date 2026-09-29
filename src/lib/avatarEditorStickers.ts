/** Стикеры для мини-редактора аватарки (рисуются на слой рисования). */

export type AvatarStickerId = 'spade' | 'heart' | 'diamond' | 'club' | 'star' | 'sparkle' | 'ring';

export interface AvatarStickerDef {
  id: AvatarStickerId;
  label: string;
  glyph: string;
}

export const AVATAR_EDITOR_STICKERS: AvatarStickerDef[] = [
  { id: 'spade', label: 'Пика', glyph: '♠' },
  { id: 'heart', label: 'Черва', glyph: '♥' },
  { id: 'diamond', label: 'Бубна', glyph: '♦' },
  { id: 'club', label: 'Трефа', glyph: '♣' },
  { id: 'star', label: 'Звезда', glyph: '★' },
  { id: 'sparkle', label: 'Искра', glyph: '✦' },
  { id: 'ring', label: 'Рамка', glyph: '◎' },
];

const SUIT_COLORS: Record<'spade' | 'heart' | 'diamond' | 'club', string> = {
  spade: '#e2e8f0',
  heart: '#fb7185',
  diamond: '#f87171',
  club: '#4ade80',
};

export function drawAvatarSticker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  stickerId: AvatarStickerId,
  fallbackColor: string,
  scale = 1,
): void {
  const size = 48 * scale;
  ctx.save();
  ctx.translate(x, y);

  if (stickerId === 'ring') {
    ctx.strokeStyle = fallbackColor;
    ctx.lineWidth = 3.2 * scale;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.52, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1.4 * scale;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.38, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (stickerId === 'star' || stickerId === 'sparkle') {
    drawStarPath(ctx, 5, size * 0.44, fallbackColor, stickerId === 'sparkle');
    ctx.restore();
    return;
  }

  const suitColor = SUIT_COLORS[stickerId] ?? fallbackColor;
  ctx.shadowColor = 'rgba(15, 23, 42, 0.45)';
  ctx.shadowBlur = 4 * scale;
  ctx.fillStyle = suitColor;
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.28)';
  ctx.lineWidth = 1.1 * scale;
  drawSuitPath(ctx, stickerId, size * 0.48);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.stroke();
  ctx.restore();
}

/** Векторные масти — Unicode на canvas часто не рисуется. */
function drawSuitPath(
  ctx: CanvasRenderingContext2D,
  suit: 'spade' | 'heart' | 'diamond' | 'club',
  r: number,
): void {
  if (suit === 'diamond') {
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.62, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r * 0.62, 0);
    ctx.closePath();
    return;
  }

  if (suit === 'heart') {
    ctx.beginPath();
    ctx.moveTo(0, r * 0.72);
    ctx.bezierCurveTo(r * 0.15, r * 0.4, r * 1.05, r * 0.05, r * 1.02, -r * 0.32);
    ctx.bezierCurveTo(r * 1.0, -r * 0.72, r * 0.45, -r * 0.92, 0, -r * 0.42);
    ctx.bezierCurveTo(-r * 0.45, -r * 0.92, -r * 1.0, -r * 0.72, -r * 1.02, -r * 0.32);
    ctx.bezierCurveTo(-r * 1.05, r * 0.05, -r * 0.15, r * 0.4, 0, r * 0.72);
    ctx.closePath();
    return;
  }

  if (suit === 'spade') {
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.bezierCurveTo(r * 0.15, -r * 0.55, r * 1.05, -r * 0.15, r * 0.92, r * 0.28);
    ctx.bezierCurveTo(r * 0.78, r * 0.55, r * 0.28, r * 0.48, 0, r * 0.18);
    ctx.bezierCurveTo(-r * 0.28, r * 0.48, -r * 0.78, r * 0.55, -r * 0.92, r * 0.28);
    ctx.bezierCurveTo(-r * 1.05, -r * 0.15, -r * 0.15, -r * 0.55, 0, -r);
    ctx.closePath();
    /* ножка */
    ctx.moveTo(-r * 0.16, r * 0.22);
    ctx.lineTo(-r * 0.28, r * 0.98);
    ctx.lineTo(r * 0.28, r * 0.98);
    ctx.lineTo(r * 0.16, r * 0.22);
    ctx.quadraticCurveTo(0, r * 0.38, -r * 0.16, r * 0.22);
    ctx.closePath();
    return;
  }

  /* club — три доли + ножка */
  const lobe = r * 0.36;
  ctx.beginPath();
  ctx.arc(0, -r * 0.38, lobe, 0, Math.PI * 2);
  ctx.moveTo(lobe * 0.2, r * 0.05);
  ctx.arc(-r * 0.38, r * 0.12, lobe, 0, Math.PI * 2);
  ctx.moveTo(lobe * 0.2, r * 0.05);
  ctx.arc(r * 0.38, r * 0.12, lobe, 0, Math.PI * 2);
  ctx.moveTo(-r * 0.14, r * 0.28);
  ctx.lineTo(-r * 0.26, r * 0.98);
  ctx.lineTo(r * 0.26, r * 0.98);
  ctx.lineTo(r * 0.14, r * 0.28);
  ctx.quadraticCurveTo(0, r * 0.42, -r * 0.14, r * 0.28);
  ctx.closePath();
}

function drawStarPath(
  ctx: CanvasRenderingContext2D,
  points: number,
  outerR: number,
  color: string,
  sparkle: boolean,
): void {
  const innerR = outerR * (sparkle ? 0.28 : 0.42);
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1;
  ctx.shadowColor = 'rgba(15, 23, 42, 0.4)';
  ctx.shadowBlur = 3;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? outerR : innerR;
    const a = (Math.PI / points) * i - Math.PI / 2;
    const px = Math.cos(a) * rad;
    const py = Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.stroke();
}
