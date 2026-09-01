/** Сжатие и экспорт аватарки (Data URL → localStorage / Supabase). */

export const AVATAR_MAX_PX = 512;
export const AVATAR_JPEG_QUALITY = 0.88;
export const MAX_AVATAR_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Лимит data URL в слоте комнаты (LAN WS). Обычный JPEG 512px часто 40–80KB —
 * старый потолок 24KB молча выкидывал аватар, и игроки не видели друг друга.
 */
export const ONLINE_ROOM_AVATAR_MAX_CHARS = 140_000;
/** Для слота комнаты / слабой сети — ужимаем сильнее перед INSERT. */
export const ONLINE_CLOUD_AVATAR_MAX_CHARS = 22_000;
/** Профиль в `profiles.avatar_data_url`: JPEG 256–512px обычно влезает. */
export const PROFILE_CLOUD_AVATAR_MAX_CHARS = 80_000;

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

function encodeJpegDataUrl(dataUrl: string, maxPx: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height, 1));
      const cw = Math.max(1, Math.round(img.width * scale));
      const ch = Math.max(1, Math.round(img.height * scale));
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
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => reject(new Error('Не удалось сжать аватар'));
    img.src = dataUrl;
  });
}

/**
 * Ужимает аватар под лимит комнаты. Без этого серверный capAvatar отбрасывает
 * data URL целиком → у всех пустые кружки, хотя в профиле картинка есть.
 */
export async function prepareAvatarForOnlineRoom(
  dataUrl: string | null | undefined,
  maxChars: number = ONLINE_ROOM_AVATAR_MAX_CHARS,
): Promise<string | null | undefined> {
  if (dataUrl == null || dataUrl === '') return dataUrl;
  if (dataUrl.length <= maxChars) return dataUrl;

  const steps: Array<[number, number]> = [
    [256, 0.72],
    [192, 0.64],
    [160, 0.55],
    [128, 0.48],
    [96, 0.42],
    [72, 0.38],
  ];
  let best = dataUrl;
  for (const [px, q] of steps) {
    try {
      const next = await encodeJpegDataUrl(best, px, q);
      best = next;
      if (best.length <= maxChars) return best;
    } catch {
      /* следующий шаг */
    }
  }
  return best.length <= maxChars ? best : undefined;
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
