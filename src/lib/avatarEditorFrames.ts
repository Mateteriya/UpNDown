/** PNG/SVG-рамки для редактора аватарки (файлы в /public/avatar-frames/). */

import { publicAssetUrl } from './publicAssetUrl';

export type AvatarFrameId = 'cosmic' | 'gold' | 'neon' | 'orbit' | 'saturn' | 'neural' | 'pulsar';

export interface AvatarFrameDef {
  id: AvatarFrameId;
  label: string;
  /** Путь в public; SVG масштабируется без потери чёткости. */
  src: string;
}

export const AVATAR_EDITOR_FRAMES: AvatarFrameDef[] = [
  { id: 'cosmic', label: 'Космос', src: publicAssetUrl('/avatar-frames/frame-cosmic.svg') },
  { id: 'gold', label: 'Золото', src: publicAssetUrl('/avatar-frames/frame-gold.svg') },
  { id: 'neon', label: 'Неон', src: publicAssetUrl('/avatar-frames/frame-neon.svg') },
  { id: 'orbit', label: 'Орбита', src: publicAssetUrl('/avatar-frames/frame-orbit.svg?v=2') },
  { id: 'saturn', label: 'Сатурн', src: publicAssetUrl('/avatar-frames/frame-saturn.svg') },
  { id: 'neural', label: 'Нейросеть', src: publicAssetUrl('/avatar-frames/frame-neural.svg') },
  { id: 'pulsar', label: 'Пульсар', src: publicAssetUrl('/avatar-frames/frame-pulsar.svg?v=2') },
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
