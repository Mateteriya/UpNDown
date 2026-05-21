/** Фоны для мини-редактора аватарки (рисуются на canvas). */

export type AvatarEditorTemplateId =
  | 'nebula'
  | 'aurora'
  | 'ember'
  | 'violet-crown'
  | 'deep-space'
  | 'prism'
  | 'none';

export interface AvatarEditorTemplate {
  id: AvatarEditorTemplateId;
  label: string;
}

export const AVATAR_EDITOR_TEMPLATES: AvatarEditorTemplate[] = [
  { id: 'nebula', label: 'Туманность' },
  { id: 'aurora', label: 'Аврора' },
  { id: 'ember', label: 'Закат' },
  { id: 'violet-crown', label: 'Корона' },
  { id: 'deep-space', label: 'Космос' },
  { id: 'prism', label: 'Призма' },
  { id: 'none', label: 'Без фона' },
];

function hashHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h) + name.charCodeAt(i) | 0;
  return Math.abs(h % 360);
}

export function drawAvatarTemplate(
  ctx: CanvasRenderingContext2D,
  size: number,
  templateId: AvatarEditorTemplateId,
  displayName: string,
): void {
  ctx.clearRect(0, 0, size, size);

  switch (templateId) {
    case 'nebula': {
      const g = ctx.createRadialGradient(size * 0.35, size * 0.3, 0, size * 0.5, size * 0.5, size * 0.72);
      g.addColorStop(0, '#22d3ee');
      g.addColorStop(0.45, '#7c3aed');
      g.addColorStop(1, '#0f172a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      const g2 = ctx.createRadialGradient(size * 0.75, size * 0.8, 0, size * 0.5, size * 0.5, size * 0.55);
      g2.addColorStop(0, 'rgba(236, 72, 153, 0.55)');
      g2.addColorStop(1, 'transparent');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, size, size);
      break;
    }
    case 'aurora': {
      const g = ctx.createLinearGradient(0, size, size, 0);
      g.addColorStop(0, '#064e3b');
      g.addColorStop(0.4, '#0d9488');
      g.addColorStop(0.7, '#22d3ee');
      g.addColorStop(1, '#1e1b4b');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#6ee7b7';
      ctx.beginPath();
      ctx.ellipse(size * 0.5, size * 0.35, size * 0.55, size * 0.18, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
    case 'ember': {
      const g = ctx.createLinearGradient(0, size, size * 0.2, 0);
      g.addColorStop(0, '#7c2d12');
      g.addColorStop(0.35, '#ea580c');
      g.addColorStop(0.65, '#f472b6');
      g.addColorStop(1, '#312e81');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      break;
    }
    case 'violet-crown': {
      const g = ctx.createRadialGradient(size * 0.5, size * 0.2, 0, size * 0.5, size * 0.5, size * 0.75);
      g.addColorStop(0, '#fde68a');
      g.addColorStop(0.25, '#c084fc');
      g.addColorStop(0.7, '#5b21b6');
      g.addColorStop(1, '#1e1b4b');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      break;
    }
    case 'deep-space': {
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 48; i++) {
        const x = ((i * 97) % size) + (i % 3);
        const y = ((i * 53) % size) + (i % 5);
        const r = (i % 3) * 0.4 + 0.6;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      const g = ctx.createRadialGradient(size * 0.5, size * 0.5, 0, size * 0.5, size * 0.5, size * 0.5);
      g.addColorStop(0, 'rgba(56, 189, 248, 0.12)');
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      break;
    }
    case 'prism': {
      const g = ctx.createLinearGradient(0, 0, size, size);
      g.addColorStop(0, '#f472b6');
      g.addColorStop(0.25, '#a78bfa');
      g.addColorStop(0.5, '#38bdf8');
      g.addColorStop(0.75, '#4ade80');
      g.addColorStop(1, '#fbbf24');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, size, size);
      ctx.globalAlpha = 1;
      break;
    }
    case 'none':
      break;
    default:
      break;
  }

  if (templateId === 'none') return;

  const hue = hashHue(displayName);
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = `hsl(${hue}, 70%, 55%)`;
  ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = 1;
}

export function drawPhotoCover(ctx: CanvasRenderingContext2D, size: number, img: HTMLImageElement): void {
  drawPhotoWithTransform(ctx, size, img, 1, 0, 0);
}

/** Фото поверх фона: масштаб (1 = cover) и сдвиг в пикселях холста. */
export function drawPhotoWithTransform(
  ctx: CanvasRenderingContext2D,
  size: number,
  img: HTMLImageElement,
  userScale: number,
  offsetX: number,
  offsetY: number,
): void {
  const cover = Math.max(size / img.width, size / img.height);
  const scale = cover * Math.max(0.2, userScale);
  const w = img.width * scale;
  const h = img.height * scale;
  const x = (size - w) / 2 + offsetX;
  const y = (size - h) / 2 + offsetY;
  ctx.drawImage(img, x, y, w, h);
}

export function drawInitialsBase(
  ctx: CanvasRenderingContext2D,
  size: number,
  displayName: string,
  initials: string,
): void {
  const hue = hashHue(displayName);
  const g = ctx.createRadialGradient(size * 0.35, size * 0.28, 0, size * 0.5, size * 0.55, size * 0.72);
  g.addColorStop(0, `hsl(${hue}, 55%, 52%)`);
  g.addColorStop(0.55, `hsl(${(hue + 40) % 360}, 48%, 38%)`);
  g.addColorStop(1, `hsl(${(hue + 80) % 360}, 42%, 22%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `700 ${Math.round(size * 0.36)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials, size / 2, size / 2);
}
