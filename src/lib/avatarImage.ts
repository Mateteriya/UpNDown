/** Сжатие и экспорт аватарки (Data URL → localStorage / Supabase). */

export const AVATAR_MAX_PX = 512;
export const AVATAR_JPEG_QUALITY = 0.88;
export const MAX_AVATAR_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

export function compressImageToDataUrl(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.width;
      const h = img.height;
      const scale = Math.min(1, AVATAR_MAX_PX / Math.max(w, h));
      const cw = Math.round(w * scale);
      const ch = Math.round(h * scale);
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, cw, ch);
      try {
        resolve(canvas.toDataURL('image/jpeg', AVATAR_JPEG_QUALITY));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => reject(new Error('Не удалось загрузить изображение'));
    img.src = dataUrl;
  });
}

/** Круглый экспорт слоя рисования + фона. */
export function exportCircularAvatarJpeg(
  baseCanvas: HTMLCanvasElement,
  drawCanvas: HTMLCanvasElement,
  size = AVATAR_MAX_PX,
): string {
  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  const ctx = out.getContext('2d');
  if (!ctx) return baseCanvas.toDataURL('image/jpeg', AVATAR_JPEG_QUALITY);

  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(baseCanvas, 0, 0, size, size);
  ctx.drawImage(drawCanvas, 0, 0, size, size);
  ctx.restore();

  return out.toDataURL('image/jpeg', AVATAR_JPEG_QUALITY);
}
