/** PNG/SVG-рамки для редактора аватарки (файлы в /public/avatar-frames/). */

export type AvatarFrameId = 'cosmic' | 'gold' | 'neon' | 'orbit';

export interface AvatarFrameDef {
  id: AvatarFrameId;
  label: string;
  /** Путь в public; SVG масштабируется без потери чёткости. */
  src: string;
}

export const AVATAR_EDITOR_FRAMES: AvatarFrameDef[] = [
  { id: 'cosmic', label: 'Космос', src: '/avatar-frames/frame-cosmic.svg' },
  { id: 'gold', label: 'Золото', src: '/avatar-frames/frame-gold.svg' },
  { id: 'neon', label: 'Неон', src: '/avatar-frames/frame-neon.svg' },
  { id: 'orbit', label: 'Орбита', src: '/avatar-frames/frame-orbit.svg' },
];

const cache = new Map<string, Promise<HTMLImageElement>>();

export function loadAvatarFrameImage(src: string): Promise<HTMLImageElement> {
  const hit = cache.get(src);
  if (hit) return hit;
  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`frame:${src}`));
    img.src = src;
  });
  cache.set(src, p);
  return p;
}

export function drawAvatarFrameOnLayer(
  ctx: CanvasRenderingContext2D,
  size: number,
  img: HTMLImageElement,
): void {
  ctx.save();
  ctx.drawImage(img, 0, 0, size, size);
  ctx.restore();
}
