/**
 * «3D-финиш»: запечённый кабошон — выпуклое стекло с бликами.
 *
 * Слой ответственности (чтобы не дублировать капсулу Кабинета):
 * - bake (сюда): физический объём сферы, fresnel-край, статичные стеклянные блики —
 *   читается везде (стол, экспорт, мобилка без CSS-стекла).
 * - CSS капсулы / ЛК: живой sheen, brand-обод, hover — поверх.
 *   При флаге polish капсула приглушает виньетку (см. menu-pc.css --polished).
 */

const POLISH_FLAG_KEY = 'updown_avatar_3d_polish';

export function setAvatar3dPolishFlag(on: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (on) localStorage.setItem(POLISH_FLAG_KEY, '1');
    else localStorage.removeItem(POLISH_FLAG_KEY);
  } catch {
    /* quota / private */
  }
}

export function getAvatar3dPolishFlag(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(POLISH_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

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

  /* 1. Объём сферы: мягкий свет сверху-слева, тень снизу-справа (форма, не «дыры» по краю) */
  ctx.globalCompositeOperation = 'soft-light';
  const form = ctx.createRadialGradient(size * 0.38, size * 0.32, r * 0.05, cx, cy * 1.02, r * 1.05);
  form.addColorStop(0, 'rgba(255,255,255,0.55)');
  form.addColorStop(0.35, 'rgba(255,255,255,0.12)');
  form.addColorStop(0.62, 'rgba(0,0,0,0)');
  form.addColorStop(0.88, 'rgba(0,0,0,0.22)');
  form.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = form;
  ctx.fillRect(0, 0, size, size);

  /* 2. Лёгкая окклюзия у нижнего края — «приподнять» шар */
  ctx.globalCompositeOperation = 'multiply';
  const lift = ctx.createRadialGradient(cx, size * 0.92, 0, cx, size * 0.72, r * 0.75);
  lift.addColorStop(0, 'rgba(8,6,24,0.34)');
  lift.addColorStop(0.45, 'rgba(8,6,24,0.1)');
  lift.addColorStop(1, 'rgba(8,6,24,0)');
  ctx.fillStyle = lift;
  ctx.fillRect(0, 0, size, size);

  /* 3. Fresnel: тонкое светлое кольцо у края — кривизна стекла */
  ctx.globalCompositeOperation = 'screen';
  const fresnel = ctx.createRadialGradient(cx, cy, r * 0.72, cx, cy, r * 0.995);
  fresnel.addColorStop(0, 'rgba(255,255,255,0)');
  fresnel.addColorStop(0.55, 'rgba(220,240,255,0.04)');
  fresnel.addColorStop(0.82, 'rgba(200,230,255,0.22)');
  fresnel.addColorStop(1, 'rgba(255,255,255,0.38)');
  ctx.fillStyle = fresnel;
  ctx.fillRect(0, 0, size, size);

  /* 4. Главный стеклянный блик (вытянутый, как на линзе) */
  ctx.globalCompositeOperation = 'screen';
  const gloss = ctx.createRadialGradient(
    size * 0.34,
    size * 0.24,
    0,
    size * 0.34,
    size * 0.24,
    size * 0.2,
  );
  gloss.addColorStop(0, 'rgba(255,255,255,0.72)');
  gloss.addColorStop(0.28, 'rgba(230,245,255,0.28)');
  gloss.addColorStop(0.62, 'rgba(186,230,253,0.08)');
  gloss.addColorStop(1, 'transparent');
  ctx.fillStyle = gloss;
  ctx.beginPath();
  ctx.ellipse(size * 0.34, size * 0.24, size * 0.16, size * 0.085, -0.52, 0, Math.PI * 2);
  ctx.fill();

  /* 5. Вторичный микро-блик */
  const glint = ctx.createRadialGradient(
    size * 0.58,
    size * 0.3,
    0,
    size * 0.58,
    size * 0.3,
    size * 0.045,
  );
  glint.addColorStop(0, 'rgba(255,255,255,0.55)');
  glint.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  glint.addColorStop(1, 'transparent');
  ctx.fillStyle = glint;
  ctx.beginPath();
  ctx.ellipse(size * 0.58, size * 0.3, size * 0.032, size * 0.018, 0.35, 0, Math.PI * 2);
  ctx.fill();

  /* 6. Холодный оттенок только на fresnel-крае (не заливка всего круга) */
  ctx.globalCompositeOperation = 'source-over';
  const coolRim = ctx.createRadialGradient(cx, cy, r * 0.78, cx, cy, r);
  coolRim.addColorStop(0, 'rgba(103,232,249,0)');
  coolRim.addColorStop(0.7, 'rgba(103,232,249,0.04)');
  coolRim.addColorStop(1, 'rgba(167,139,250,0.1)');
  ctx.fillStyle = coolRim;
  ctx.fillRect(0, 0, size, size);

  /* 7. Внутренний волосок стеклянной кромки (не радужный brand-обод капсулы) */
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = Math.max(1.2, size * 0.0045);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.965, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(8,4,28,0.18)';
  ctx.lineWidth = Math.max(1, size * 0.003);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.992, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
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
