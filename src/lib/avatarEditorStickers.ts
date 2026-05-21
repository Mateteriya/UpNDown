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
  heart: '#f472b6',
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
  const size = 44 * scale;
  ctx.save();
  ctx.translate(x, y);

  if (stickerId === 'ring') {
    ctx.strokeStyle = fallbackColor;
    ctx.lineWidth = 3.5 * scale;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1.5 * scale;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (stickerId === 'star' || stickerId === 'sparkle') {
    drawStarPath(ctx, stickerId === 'sparkle' ? 5 : 5, size * 0.42, fallbackColor, stickerId === 'sparkle');
    ctx.restore();
    return;
  }

  const suitColor = SUIT_COLORS[stickerId] ?? fallbackColor;
  ctx.fillStyle = suitColor;
  ctx.strokeStyle = 'rgba(15,23,42,0.35)';
  ctx.lineWidth = 1.2 * scale;
  ctx.font = `700 ${Math.round(size)}px "Segoe UI Symbol", "Apple Color Emoji", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const glyph = AVATAR_EDITOR_STICKERS.find((s) => s.id === stickerId)?.glyph ?? '♠';
  ctx.strokeText(glyph, 0, 1);
  ctx.fillText(glyph, 0, 1);
  ctx.restore();
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
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (Math.PI / points) * i - Math.PI / 2;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}
