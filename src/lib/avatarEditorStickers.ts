/** Стикеры для мини-редактора аватарки (рисуются на слой рисования). */

import { mixWithWhite } from './avatarNeonBrush';

export type AvatarStickerId =
  | 'star'
  | 'spade'
  | 'heart'
  | 'diamond'
  | 'club'
  | 'sparkle'
  | 'joker'
  | 'updown'
  | 'clover';

export interface AvatarStickerDef {
  id: AvatarStickerId;
  label: string;
  glyph: string;
  /** Элитный стикер — только Premium */
  premium?: boolean;
}

/**
 * Ряд 1 (+ палитра): обычные
 * Ряд 2: ещё обычные, затем три Premium в конце
 */
export const AVATAR_EDITOR_STICKERS: AvatarStickerDef[] = [
  { id: 'star', label: 'Звезда', glyph: '★' },
  { id: 'spade', label: 'Пика', glyph: '♠' },
  { id: 'heart', label: 'Черва', glyph: '♥' },
  { id: 'diamond', label: 'Бубна', glyph: '♦' },
  { id: 'club', label: 'Трефа', glyph: '♣' },
  { id: 'sparkle', label: 'Искра', glyph: '✦' },
  { id: 'joker', label: 'Джокер', glyph: 'J', premium: true },
  { id: 'updown', label: 'Up&Down', glyph: '↕', premium: true },
  { id: 'clover', label: 'Клевер удачи', glyph: '☘', premium: true },
];

export const STICKER_GLYPH_COLORS: Record<AvatarStickerId, string> = {
  star: '#fbbf24',
  spade: '#e2e8f0',
  heart: '#fb7185',
  diamond: '#f87171',
  club: '#4ade80',
  sparkle: '#a78bfa',
  joker: '#e879f9',
  updown: '#67e8f9',
  clover: '#4ade80',
};

export function isPremiumSticker(id: AvatarStickerId): boolean {
  return AVATAR_EDITOR_STICKERS.some((s) => s.id === id && s.premium);
}

export function drawAvatarSticker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  stickerId: AvatarStickerId,
  color: string,
  scale = 1,
): void {
  const suit =
    stickerId === 'spade' || stickerId === 'heart' || stickerId === 'diamond' || stickerId === 'club';
  const base = isPremiumSticker(stickerId) ? 84 : suit ? 68 : 48;
  const size = base * scale;
  const paint = color || STICKER_GLYPH_COLORS[stickerId];
  ctx.save();
  ctx.translate(x, y);

  if (stickerId === 'joker') {
    drawNeonJoker(ctx, size * 0.5, paint, scale);
    ctx.restore();
    return;
  }

  if (stickerId === 'updown') {
    drawUpDownBrand(ctx, size * 0.5, paint, scale);
    ctx.restore();
    return;
  }

  if (stickerId === 'clover') {
    drawLuckyClover(ctx, size * 0.5, paint, scale);
    ctx.restore();
    return;
  }

  if (stickerId === 'star') {
    drawPremiumStar(ctx, size * 0.46, paint, scale);
    ctx.restore();
    return;
  }

  if (stickerId === 'sparkle') {
    drawSparkBurst(ctx, size * 0.56, paint, scale);
    ctx.restore();
    return;
  }

  /* Крести — ровно глиф ♣ с кнопки (шрифт), без path/offscreen/stroke */
  if (stickerId === 'club') {
    paintClubButtonGlyph(ctx, size, paint, scale);
    ctx.restore();
    return;
  }

  paintNeonSuit(ctx, stickerId, size * 0.46, paint, scale);
  ctx.restore();
}

/**
 * Тот же символ ♣, что в `.avatar-editor-sticker-btn__glyph`.
 * Только fillText: без strokeText / filter / offscreen (они ломали форму и размер).
 */
function paintClubButtonGlyph(
  ctx: CanvasRenderingContext2D,
  size: number,
  color: string,
  scale: number,
): void {
  /* На кнопке ~28px в UI; на холсте — чуть крупнее, визуально как пики */
  const fontPx = Math.round(Math.max(56, size * 1.28));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  /* Без Color Emoji — иначе ♣ может стать «эмодзи» и сломаться на canvas */
  ctx.font = `700 ${fontPx}px "Segoe UI Symbol","Segoe UI","Apple Symbols","Noto Sans Symbols",system-ui,sans-serif`;

  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = Math.max(6, 10 * scale);
  ctx.fillText('♣', 0, 2);
  ctx.shadowBlur = 0;
  ctx.fillText('♣', 0, 2);
}

/** Крест-блик (сверкание) на VIP. */
function drawSparkleGlint(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
  scale: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = color;
  ctx.shadowBlur = 6 * scale;
  ctx.strokeStyle = color;
  ctx.fillStyle = '#fff';
  ctx.lineWidth = Math.max(1, size * 0.18);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(0, size);
  ctx.moveTo(-size, 0);
  ctx.lineTo(size, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Фирменный Up&Down: космический эмблем — небула, орбиты, стрелки, ядро «&».
 */
function drawUpDownBrand(
  ctx: CanvasRenderingContext2D,
  r: number,
  color: string,
  scale: number,
): void {
  const cyan = color || '#67e8f9';
  const magenta = '#e879f9';
  const violet = '#a78bfa';
  const gold = '#fde68a';

  const nebula = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r * 1.15);
  nebula.addColorStop(0, 'rgba(232, 121, 249, 0.35)');
  nebula.addColorStop(0.35, 'rgba(103, 232, 249, 0.22)');
  nebula.addColorStop(0.7, 'rgba(167, 139, 250, 0.12)');
  nebula.addColorStop(1, 'rgba(8, 15, 40, 0)');
  ctx.fillStyle = nebula;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.15, 0, Math.PI * 2);
  ctx.fill();

  const dust: Array<[number, number, number]> = [
    [-0.85, -0.55, 0.035],
    [0.78, -0.62, 0.028],
    [-0.7, 0.72, 0.03],
    [0.82, 0.58, 0.025],
    [-0.95, 0.1, 0.022],
    [0.92, -0.15, 0.02],
    [0.15, -0.92, 0.026],
    [-0.2, 0.9, 0.024],
  ];
  for (const [dx, dy, s] of dust) {
    ctx.fillStyle = '#fff';
    ctx.globalAlpha = 0.85;
    ctx.shadowColor = cyan;
    ctx.shadowBlur = 4 * scale;
    ctx.beginPath();
    ctx.arc(r * dx, r * dy, r * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  const orbits: Array<[number, number, number, string, number]> = [
    [1.02, 0.42, -0.55, cyan, 0.55],
    [1.0, 0.48, 0.5, magenta, 0.45],
    [0.88, 0.72, 0.05, violet, 0.35],
  ];
  for (const [rx, ry, rot, stroke, alpha] of orbits) {
    ctx.save();
    ctx.rotate(rot);
    ctx.strokeStyle = stroke;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.6 * scale;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * rx, r * ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = stroke;
    ctx.shadowColor = stroke;
    ctx.shadowBlur = 5 * scale;
    ctx.beginPath();
    ctx.arc(r * rx, 0, r * 0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  ctx.shadowColor = cyan;
  ctx.shadowBlur = 14 * scale;
  ctx.fillStyle = cyan;
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.02);
  ctx.lineTo(r * 0.5, -r * 0.28);
  ctx.lineTo(r * 0.2, -r * 0.28);
  ctx.lineTo(r * 0.2, r * 0.05);
  ctx.lineTo(-r * 0.2, r * 0.05);
  ctx.lineTo(-r * 0.2, -r * 0.28);
  ctx.lineTo(-r * 0.5, -r * 0.28);
  ctx.closePath();
  ctx.fill();

  ctx.shadowColor = magenta;
  ctx.fillStyle = magenta;
  ctx.beginPath();
  ctx.moveTo(0, r * 1.02);
  ctx.lineTo(r * 0.5, r * 0.28);
  ctx.lineTo(r * 0.2, r * 0.28);
  ctx.lineTo(r * 0.2, -r * 0.05);
  ctx.lineTo(-r * 0.2, -r * 0.05);
  ctx.lineTo(-r * 0.2, r * 0.28);
  ctx.lineTo(-r * 0.5, r * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;

  const core = ctx.createRadialGradient(-r * 0.1, -r * 0.1, 0, 0, 0, r * 0.38);
  core.addColorStop(0, 'rgba(253, 230, 138, 0.35)');
  core.addColorStop(0.45, 'rgba(15, 10, 45, 0.95)');
  core.addColorStop(1, 'rgba(2, 6, 23, 0.98)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.36, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = gold;
  ctx.lineWidth = 2.4 * scale;
  ctx.shadowColor = gold;
  ctx.shadowBlur = 8 * scale;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = cyan;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.2 * scale;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.44, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.shadowColor = gold;
  ctx.shadowBlur = 12 * scale;
  ctx.fillStyle = gold;
  ctx.font = `900 ${Math.round(r * 0.62)}px "Exo 2", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('&', 0, r * 0.03);
  ctx.shadowBlur = 0;
  drawSparkleGlint(ctx, r * 0.22, -r * 0.18, r * 0.08, '#fff', scale);
}

/** Клевер удачи — простой VIP-символ удачи (4 листа). */
function drawLuckyClover(
  ctx: CanvasRenderingContext2D,
  r: number,
  color: string,
  scale: number,
): void {
  const leaf = color || '#4ade80';
  const deep = '#166534';
  const gold = '#fde68a';
  const mint = '#bbf7d0';

  ctx.shadowColor = leaf;
  ctx.shadowBlur = 18 * scale;
  ctx.fillStyle = 'rgba(22, 101, 52, 0.25)';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.95, 0, Math.PI * 2);
  ctx.fill();

  const drawLeaf = (angle: number) => {
    ctx.save();
    ctx.rotate(angle);
    ctx.translate(0, -r * 0.38);
    const g = ctx.createRadialGradient(0, -r * 0.05, r * 0.05, 0, 0, r * 0.42);
    g.addColorStop(0, mint);
    g.addColorStop(0.45, leaf);
    g.addColorStop(1, deep);
    ctx.fillStyle = g;
    ctx.shadowColor = leaf;
    ctx.shadowBlur = 10 * scale;
    ctx.beginPath();
    ctx.moveTo(0, r * 0.28);
    ctx.bezierCurveTo(r * 0.12, r * 0.05, r * 0.48, -r * 0.05, r * 0.42, -r * 0.28);
    ctx.bezierCurveTo(r * 0.35, -r * 0.52, r * 0.08, -r * 0.48, 0, -r * 0.22);
    ctx.bezierCurveTo(-r * 0.08, -r * 0.48, -r * 0.35, -r * 0.52, -r * 0.42, -r * 0.28);
    ctx.bezierCurveTo(-r * 0.48, -r * 0.05, -r * 0.12, r * 0.05, 0, r * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = gold;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.3 * scale;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.12, -r * 0.18, r * 0.08, r * 0.14, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  drawLeaf(0);
  drawLeaf(Math.PI / 2);
  drawLeaf(Math.PI);
  drawLeaf((3 * Math.PI) / 2);

  ctx.strokeStyle = deep;
  ctx.lineWidth = 3.2 * scale;
  ctx.lineCap = 'round';
  ctx.shadowColor = leaf;
  ctx.shadowBlur = 4 * scale;
  ctx.beginPath();
  ctx.moveTo(0, r * 0.08);
  ctx.quadraticCurveTo(r * 0.12, r * 0.45, r * 0.05, r * 0.95);
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.fillStyle = gold;
  ctx.shadowColor = gold;
  ctx.shadowBlur = 10 * scale;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(-r * 0.04, -r * 0.04, r * 0.045, 0, Math.PI * 2);
  ctx.fill();

  drawSparkleGlint(ctx, r * 0.55, -r * 0.55, r * 0.1, gold, scale);
  drawSparkleGlint(ctx, -r * 0.62, r * 0.2, r * 0.07, mint, scale);
  drawSparkleGlint(ctx, r * 0.48, r * 0.48, r * 0.08, '#fff', scale);
}

/**
 * Неоновый джокер: карта + корона на верхнем углу;
 * J и бубенцы со сверкающими бликами.
 */
function drawNeonJoker(
  ctx: CanvasRenderingContext2D,
  r: number,
  color: string,
  scale: number,
): void {
  const cyan = '#67e8f9';
  const pink = '#f472b6';
  const gold = '#fbbf24';
  const paint = color || '#e879f9';

  ctx.shadowColor = paint;
  ctx.shadowBlur = 14 * scale;
  ctx.fillStyle = 'rgba(12, 8, 35, 0.92)';
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.42);
  ctx.lineTo(r * 0.72, r * 0.12);
  ctx.lineTo(0, r * 0.98);
  ctx.lineTo(-r * 0.72, r * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = paint;
  ctx.lineWidth = 2.4 * scale;
  ctx.stroke();

  ctx.strokeStyle = cyan;
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 1.2 * scale;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.28);
  ctx.lineTo(r * 0.52, r * 0.12);
  ctx.lineTo(0, r * 0.82);
  ctx.lineTo(-r * 0.52, r * 0.12);
  ctx.closePath();
  ctx.stroke();
  ctx.globalAlpha = 1;

  const crownBaseY = -r * 0.28;
  ctx.shadowColor = gold;
  ctx.shadowBlur = 8 * scale;
  ctx.fillStyle = paint;
  ctx.beginPath();
  ctx.moveTo(-r * 0.58, crownBaseY);
  ctx.lineTo(-r * 0.5, -r * 0.88);
  ctx.lineTo(-r * 0.2, -r * 0.42);
  ctx.lineTo(0, -r * 1.02);
  ctx.lineTo(r * 0.2, -r * 0.42);
  ctx.lineTo(r * 0.5, -r * 0.88);
  ctx.lineTo(r * 0.58, crownBaseY);
  ctx.quadraticCurveTo(0, -r * 0.18, -r * 0.58, crownBaseY);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = gold;
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.moveTo(-r * 0.55, crownBaseY + r * 0.02);
  ctx.quadraticCurveTo(0, -r * 0.14, r * 0.55, crownBaseY + r * 0.02);
  ctx.stroke();

  ctx.globalAlpha = 0.85;
  ctx.fillStyle = cyan;
  ctx.beginPath();
  ctx.moveTo(-r * 0.58, crownBaseY);
  ctx.lineTo(-r * 0.5, -r * 0.88);
  ctx.lineTo(-r * 0.2, -r * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = pink;
  ctx.beginPath();
  ctx.moveTo(r * 0.58, crownBaseY);
  ctx.lineTo(r * 0.5, -r * 0.88);
  ctx.lineTo(r * 0.2, -r * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  const bells: Array<[number, number, string]> = [
    [-r * 0.5, -r * 0.92, cyan],
    [0, -r * 1.06, gold],
    [r * 0.5, -r * 0.92, pink],
  ];
  for (const [bx, by, bc] of bells) {
    ctx.shadowColor = bc;
    ctx.shadowBlur = 7 * scale;
    const bg = ctx.createRadialGradient(bx - r * 0.03, by - r * 0.03, 0, bx, by, r * 0.13);
    bg.addColorStop(0, '#fff');
    bg.addColorStop(0.35, bc);
    bg.addColorStop(1, 'rgba(15,23,42,0.35)');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(bx, by, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
    drawSparkleGlint(ctx, bx + r * 0.04, by - r * 0.04, r * 0.07, '#fff', scale);
  }
  ctx.shadowBlur = 0;

  const jY = r * 0.28;
  ctx.font = `900 ${Math.round(r * 0.92)}px "Exo 2", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = paint;
  ctx.shadowBlur = 12 * scale;
  const jGrad = ctx.createLinearGradient(-r * 0.25, jY - r * 0.4, r * 0.3, jY + r * 0.4);
  jGrad.addColorStop(0, '#fff');
  jGrad.addColorStop(0.35, cyan);
  jGrad.addColorStop(0.65, '#fdf4ff');
  jGrad.addColorStop(1, pink);
  ctx.fillStyle = jGrad;
  ctx.fillText('J', 0, jY);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = gold;
  ctx.lineWidth = 1.2 * scale;
  ctx.globalAlpha = 0.7;
  ctx.strokeText('J', 0, jY);
  ctx.globalAlpha = 1;

  drawSparkleGlint(ctx, -r * 0.12, jY - r * 0.22, r * 0.1, '#fff', scale);
  drawSparkleGlint(ctx, r * 0.18, jY + r * 0.08, r * 0.07, cyan, scale);
}

type SuitId = 'spade' | 'heart' | 'diamond' | 'club';

/**
 * Классические масти: зеркальная половина пути (как на картах).
 * Координаты в единицах «половина высоты» → scale(r).
 */
function buildSuitHalfSegments(suit: SuitId): Array<[number, number][]> {
  const n = 1;
  if (suit === 'diamond') {
    return [
      [
        [0, n],
        [0, n],
        [(3 * n) / 4, 0],
        [(3 * n) / 4, 0],
      ],
      [
        [(3 * n) / 4, 0],
        [(3 * n) / 4, 0],
        [0, -n],
        [0, -n],
      ],
    ];
  }
  if (suit === 'heart') {
    /* Компактнее по ширине; чуть ниже по высоте */
    const w = n * 0.78;
    const h = 0.88;
    return [
      [
        [0, n * 0.96 * h],
        [0, n * 0.96 * h],
        [w, n * 0.08 * h],
        [w, -n * 0.42 * h],
      ],
      [
        [w, -n * 0.42 * h],
        [w, -n * 0.42 * h],
        [w, -n * 0.92 * h],
        [n * 0.42, -n * 0.92 * h],
      ],
      [
        [n * 0.42, -n * 0.92 * h],
        [n * 0.42, -n * 0.92 * h],
        [0, -n * 0.92 * h],
        [0, -n * 0.38 * h],
      ],
    ];
  }
  if (suit === 'spade') {
    return [
      [
        [0, -n],
        [0, -n],
        [n * 0.9, -n / 2],
        [n * 0.9, 0],
      ],
      [
        [n * 0.9, 0],
        [n * 0.9, 0],
        [n * 0.9, n / 2],
        [n / 2, n / 2],
      ],
      [
        [n / 2, n / 2],
        [n / 2, n / 2],
        [n / 8, n / 2],
        [n / 8, n / 8],
      ],
      [
        [n / 8, n / 8],
        [n / 8, n / 2],
        [n / 2, n],
        [n / 2, n],
      ],
      [
        [n / 2, n],
        [n / 2, n],
        [0, n],
        [0, n],
      ],
    ];
  }
  /* club — единый контур, не три круга */
  return [
    [
      [0, -n],
      [0, -n],
      [n / 2, -n],
      [n / 2, -n / 2],
    ],
    [
      [n / 2, -n / 2],
      [n / 2, -n / 2],
      [n, -n / 2],
      [n, 0],
    ],
    [
      [n, 0],
      [n, 0],
      [n, n / 2],
      [n / 2, n / 2],
    ],
    [
      [n / 2, n / 2],
      [n / 2, n / 2],
      [n / 8, n / 2],
      [n / 8, n / 8],
    ],
    [
      [n / 8, n / 8],
      [n / 8, n / 2],
      [n / 2, n],
      [n / 2, n],
    ],
    [
      [n / 2, n],
      [n / 2, n],
      [0, n],
      [0, n],
    ],
  ];
}

function traceSuit(ctx: CanvasRenderingContext2D, suit: SuitId, r: number): void {
  const half = buildSuitHalfSegments(suit);
  ctx.beginPath();
  const start = half[0]![0]!;
  ctx.moveTo(start[0]! * r, start[1]! * r);
  for (const seg of half) {
    const c1 = seg[1]!;
    const c2 = seg[2]!;
    const end = seg[3]!;
    ctx.bezierCurveTo(c1[0]! * r, c1[1]! * r, c2[0]! * r, c2[1]! * r, end[0]! * r, end[1]! * r);
  }
  for (let i = half.length - 1; i >= 0; i -= 1) {
    const seg = half[i]!;
    const p0 = seg[0]!;
    const c1 = seg[1]!;
    const c2 = seg[2]!;
    ctx.bezierCurveTo(-c2[0]! * r, c2[1]! * r, -c1[0]! * r, c1[1]! * r, -p0[0]! * r, p0[1]! * r);
  }
  ctx.closePath();
}

/** Чёткая масть: обводка снизу → заливка сверху (контур сплошной, не «пунктир»). */
function paintNeonSuit(
  ctx: CanvasRenderingContext2D,
  suit: SuitId,
  r: number,
  color: string,
  scale: number,
): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.miterLimit = 2;

  /* Лёгкий bloom только у заливки */
  ctx.shadowColor = color;
  ctx.shadowBlur = Math.max(5, 9 * scale);
  ctx.fillStyle = color;
  traceSuit(ctx, suit, r);
  ctx.fill();
  ctx.shadowBlur = 0;

  /*
   * Порядок важен для чёткости:
   * 1) толстый тёмный stroke
   * 2) чуть тоньше светлый stroke
   * 3) заливка поверх — закрывает внутреннюю половину линий → сплошной обод снаружи
   */
  ctx.strokeStyle = 'rgba(2, 6, 23, 0.92)';
  ctx.lineWidth = Math.max(3.2, r * 0.12);
  traceSuit(ctx, suit, r);
  ctx.stroke();

  ctx.strokeStyle = mixWithWhite(color, 0.72);
  ctx.lineWidth = Math.max(1.8, r * 0.065);
  traceSuit(ctx, suit, r);
  ctx.stroke();

  ctx.fillStyle = color;
  traceSuit(ctx, suit, r);
  ctx.fill();
}

function traceFiveStar(ctx: CanvasRenderingContext2D, outerR: number, innerR: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 === 0 ? outerR : innerR;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const px = Math.cos(a) * rad;
    const py = Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function shadeHex(hex: string, blackRatio: number): string {
  const c = hex.trim();
  if (!/^#[0-9a-f]{6}$/i.test(c)) return hex;
  const t = Math.min(1, Math.max(0, blackRatio));
  const r = Math.round(parseInt(c.slice(1, 3), 16) * (1 - t));
  const g = Math.round(parseInt(c.slice(3, 5), 16) * (1 - t));
  const b = Math.round(parseInt(c.slice(5, 7), 16) * (1 - t));
  return `rgb(${r},${g},${b})`;
}

/** Премиальная звезда: объём (свет сверху) + золотой обод. */
function drawPremiumStar(
  ctx: CanvasRenderingContext2D,
  r: number,
  color: string,
  scale: number,
): void {
  const inner = r * 0.42;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.shadowColor = color;
  ctx.shadowBlur = Math.max(6, 10 * scale);
  ctx.fillStyle = color;
  traceFiveStar(ctx, r, inner);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = 'rgba(2, 6, 23, 0.88)';
  ctx.lineWidth = Math.max(2.4, r * 0.1);
  traceFiveStar(ctx, r, inner);
  ctx.stroke();

  ctx.strokeStyle = '#fde68a';
  ctx.lineWidth = Math.max(1.4, r * 0.055);
  traceFiveStar(ctx, r, inner);
  ctx.stroke();

  const body = ctx.createLinearGradient(-r * 0.6, -r, r * 0.7, r);
  body.addColorStop(0, mixWithWhite(color, 0.62));
  body.addColorStop(0.42, color);
  body.addColorStop(1, shadeHex(color, 0.42));
  ctx.fillStyle = body;
  traceFiveStar(ctx, r, inner);
  ctx.fill();

  ctx.save();
  ctx.translate(-r * 0.05, -r * 0.08);
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = mixWithWhite(color, 0.75);
  traceFiveStar(ctx, r * 0.55, inner * 0.55);
  ctx.fill();
  ctx.restore();
}

/** Четырёхлучевая искра (не пятиконечная звезда). */
function traceTwinkle(
  ctx: CanvasRenderingContext2D,
  outerV: number,
  outerH: number,
  pinch: number,
): void {
  ctx.beginPath();
  for (let i = 0; i < 4; i += 1) {
    const a = -Math.PI / 2 + i * (Math.PI / 2);
    /* i чётный — вертикаль (вверх/вниз), нечётный — горизонталь */
    const outer = i % 2 === 0 ? outerV : outerH;
    const tipX = Math.cos(a) * outer;
    const tipY = Math.sin(a) * outer;
    const mid = a + Math.PI / 4;
    const cX = Math.cos(mid) * pinch;
    const cY = Math.sin(mid) * pinch;
    const nA = a + Math.PI / 2;
    const nOuter = (i + 1) % 2 === 0 ? outerV : outerH;
    const nX = Math.cos(nA) * nOuter;
    const nY = Math.sin(nA) * nOuter;
    if (i === 0) ctx.moveTo(tipX, tipY);
    ctx.quadraticCurveTo(cX, cY, nX, nY);
  }
  ctx.closePath();
}

function drawSparkBurst(
  ctx: CanvasRenderingContext2D,
  r: number,
  color: string,
  scale: number,
): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const v = r * 1.42;
  const h = r * 0.86;
  const pinch = r * 0.065;

  ctx.shadowColor = color;
  ctx.shadowBlur = Math.max(8, 14 * scale);
  ctx.fillStyle = color;
  traceTwinkle(ctx, v, h, pinch);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.save();
  ctx.rotate(Math.PI / 4);
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = mixWithWhite(color, 0.35);
  traceTwinkle(ctx, r * 0.52, r * 0.52, r * 0.04);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = 'rgba(2, 6, 23, 0.75)';
  ctx.lineWidth = Math.max(1.6, r * 0.055);
  traceTwinkle(ctx, v, h, pinch);
  ctx.stroke();
  ctx.strokeStyle = mixWithWhite(color, 0.8);
  ctx.lineWidth = Math.max(1, r * 0.028);
  traceTwinkle(ctx, v, h, pinch);
  ctx.stroke();

  ctx.fillStyle = color;
  traceTwinkle(ctx, v, h, pinch);
  ctx.fill();

  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.22);
  core.addColorStop(0, '#fff');
  core.addColorStop(0.45, mixWithWhite(color, 0.7));
  core.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
  ctx.fill();
}
