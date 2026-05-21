/**
 * «3D-финиш»: имитация объёма сферы — затемнение по краям, мягкий блик, тень снизу, ободок.
 * Не «пятно света», а лёгкий рельеф портрета в круге.
 */

export function applyAvatar3dFinish(compositeCanvas: HTMLCanvasElement, size: number): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  const ctx = out.getContext('2d');
  if (!ctx) return compositeCanvas;

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(compositeCanvas, 0, 0, size, size);

  // 1. Затемнение по краям круга — «выпуклость» сферы
  const edgeDepth = ctx.createRadialGradient(cx, cy, r * 0.42, cx, cy, r * 1.02);
  edgeDepth.addColorStop(0, 'rgba(0,0,0,0)');
  edgeDepth.addColorStop(0.72, 'rgba(0,0,0,0.12)');
  edgeDepth.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = edgeDepth;
  ctx.fillRect(0, 0, size, size);

  // 2. Мягкая тень снизу-справа (против блика)
  const shade = ctx.createRadialGradient(size * 0.58, size * 0.68, size * 0.06, cx, cy, r * 1.05);
  shade.addColorStop(0, 'rgba(0,0,0,0.28)');
  shade.addColorStop(0.45, 'rgba(0,0,0,0.1)');
  shade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, size, size);

  // 3. Рассеянный свет сверху-слева (слабый, без «круга»)
  ctx.globalCompositeOperation = 'soft-light';
  const ambient = ctx.createRadialGradient(size * 0.34, size * 0.3, 0, cx, cy, r * 1.08);
  ambient.addColorStop(0, 'rgba(255,255,255,0.18)');
  ambient.addColorStop(0.4, 'rgba(255,255,255,0.05)');
  ambient.addColorStop(0.7, 'rgba(0,0,0,0)');
  ambient.addColorStop(1, 'rgba(0,0,0,0.14)');
  ctx.fillStyle = ambient;
  ctx.fillRect(0, 0, size, size);

  // 4. Маленький блик (specular), не большое пятно
  ctx.globalCompositeOperation = 'screen';
  const gloss = ctx.createRadialGradient(size * 0.36, size * 0.26, 0, size * 0.36, size * 0.26, size * 0.14);
  gloss.addColorStop(0, 'rgba(255,255,255,0.55)');
  gloss.addColorStop(0.55, 'rgba(255,255,255,0.12)');
  gloss.addColorStop(1, 'transparent');
  ctx.fillStyle = gloss;
  ctx.beginPath();
  ctx.ellipse(size * 0.36, size * 0.26, size * 0.11, size * 0.07, -0.45, 0, Math.PI * 2);
  ctx.fill();

  // 5. Лёгкий холодный оттенок по всему кругу
  ctx.globalCompositeOperation = 'color-dodge';
  ctx.fillStyle = 'rgba(34,211,238,0.04)';
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();

  // 6. Ободок — «стеклянный» край (вне clip, но в круге визуально)
  const rimW = Math.max(2.5, size * 0.012);
  const rim = ctx.createLinearGradient(size * 0.1, size * 0.1, size * 0.9, size * 0.9);
  rim.addColorStop(0, 'rgba(186,230,253,0.55)');
  rim.addColorStop(0.4, 'rgba(167,139,250,0.4)');
  rim.addColorStop(0.7, 'rgba(34,211,238,0.45)');
  rim.addColorStop(1, 'rgba(253,230,138,0.35)');
  ctx.strokeStyle = rim;
  ctx.lineWidth = rimW;
  ctx.beginPath();
  ctx.arc(cx, cy, r - rimW * 0.6, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(15,23,42,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r - rimW * 1.8, 0, Math.PI * 2);
  ctx.stroke();

  return out;
}

/** Слить base + draw, применить 3D, вернуть как единый base-слой. */
export function bake3dPolishToBase(
  base: HTMLCanvasElement,
  draw: HTMLCanvasElement,
  size: number,
): void {
  const temp = document.createElement('canvas');
  temp.width = size;
  temp.height = size;
  const tctx = temp.getContext('2d');
  if (!tctx) return;
  tctx.drawImage(base, 0, 0);
  tctx.drawImage(draw, 0, 0);
  const polished = applyAvatar3dFinish(temp, size);
  const bctx = base.getContext('2d');
  const dctx = draw.getContext('2d');
  if (!bctx || !dctx) return;
  bctx.clearRect(0, 0, size, size);
  bctx.drawImage(polished, 0, 0);
  dctx.clearRect(0, 0, size, size);
}
