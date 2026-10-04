/** Сжатие и экспорт аватарки (Data URL → localStorage / Supabase). */

export const AVATAR_MAX_PX = 512;
/** Профиль / редактор — держим максимально близко к исходнику (без видимой «мыла»). */
export const AVATAR_JPEG_QUALITY = 0.94;
export const MAX_AVATAR_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
/** Поля вокруг круга, чтобы плашка снизу не обрезалась при экспорте. */
export const AVATAR_BADGE_OUTER_PAD_RATIO = 0.16;
/** Во сколько раз полный кадр больше диаметра лица (для CSS bleed). */
export const AVATAR_BADGE_OUTER_SCALE = 1 + 2 * AVATAR_BADGE_OUTER_PAD_RATIO;
/** Доля inset с каждой стороны для object-view-box (старый PNG-экспорт с полями). */
export const AVATAR_BADGE_PAD_INSET_FRAC = AVATAR_BADGE_OUTER_PAD_RATIO / AVATAR_BADGE_OUTER_SCALE;

const badgePadDetectCache = new WeakMap<HTMLImageElement, boolean>();

/**
 * PNG-экспорт «плашка снизу»: прозрачные углы вокруг круга.
 * Обычное фото/JPEG — углы непрозрачны → false.
 */
export function avatarImageHasTransparentBadgePad(img: HTMLImageElement): boolean {
  const cached = badgePadDetectCache.get(img);
  if (cached != null) return cached;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (w < 32 || h < 32 || Math.abs(w - h) > 4) {
    badgePadDetectCache.set(img, false);
    return false;
  }
  try {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      badgePadDetectCache.set(img, false);
      return false;
    }
    let hits = 0;
    for (const [x, y] of [
      [1, 1],
      [w - 2, 1],
      [1, h - 2],
      [w - 2, h - 2],
    ] as const) {
      ctx.clearRect(0, 0, 1, 1);
      ctx.drawImage(img, x, y, 1, 1, 0, 0, 1, 1);
      if (ctx.getImageData(0, 0, 1, 1).data[3] < 12) hits += 1;
    }
    const ok = hits >= 3;
    badgePadDetectCache.set(img, ok);
    return ok;
  } catch {
    badgePadDetectCache.set(img, false);
    return false;
  }
}

/** Прямоугольник лица внутри padded badge-PNG (без полей под плашку). */
export function getAvatarBadgePadFaceRect(img: HTMLImageElement): {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
} {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const face = Math.min(w, h) / AVATAR_BADGE_OUTER_SCALE;
  return {
    sx: (w - face) / 2,
    sy: (h - face) / 2,
    sw: face,
    sh: face,
  };
}

/**
 * Лимит data URL в слоте комнаты (LAN WS). Обычный JPEG 512px часто 40–80KB —
 * старый потолок 24KB молча выкидывал аватар, и игроки не видели друг друга.
 */
export const ONLINE_ROOM_AVATAR_MAX_CHARS = 140_000;
/** Для слота комнаты / слабой сети — ужимаем сильнее перед INSERT. */
export const ONLINE_CLOUD_AVATAR_MAX_CHARS = 22_000;
/** Профиль в `profiles.avatar_data_url`: JPEG 512 @0.94 обычно 40–90KB. */
export const PROFILE_CLOUD_AVATAR_MAX_CHARS = 120_000;
/**
 * Локальный кэш аватара — жёстче облака: иначе огромный PNG
 * вытесняет sb-*-auth-token → «выкидывает из аккаунта».
 */
/** ~320px JPEG — достаточно чётко для меню/ЛК; полный 512 остаётся в React/облаке. */
export const LOCAL_AVATAR_CACHE_MAX_CHARS = 48_000;
/** Размер лица в LS-кэше. */
export const LOCAL_AVATAR_CACHE_PX = 320;

/**
 * Лицо (и legacy badge-PNG) → JPEG для localStorage / миграции.
 * Полный кадр держим в React/облаке — иначе quota убивает auth.
 */
export async function cropAvatarFaceToJpegCache(
  dataUrl: string,
  maxPx = LOCAL_AVATAR_CACHE_PX,
  quality = maxPx >= 256 ? 0.9 : 0.78,
): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        let sx = 0;
        let sy = 0;
        let sw = w;
        let sh = h;
        if (dataUrl.startsWith('data:image/png') && avatarImageHasTransparentBadgePad(img)) {
          ({ sx, sy, sw, sh } = getAvatarBadgePadFaceRect(img));
        }
        const side = Math.min(sw, sh);
        const out = Math.max(64, Math.min(maxPx, side));
        const canvas = document.createElement('canvas');
        canvas.width = out;
        canvas.height = out;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.fillStyle = '#020617';
        ctx.fillRect(0, 0, out, out);
        ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/** Уменьшить data URL до maxPx по длинной стороне (png сохраняет альфу). */
export function scaleImageDataUrl(
  dataUrl: string,
  maxPx: number,
  format: 'png' | 'jpeg' = dataUrl.startsWith('data:image/png') ? 'png' : 'jpeg',
): Promise<string> {
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
      if (format === 'png') ctx.clearRect(0, 0, cw, ch);
      else {
        ctx.fillStyle = '#020617';
        ctx.fillRect(0, 0, cw, ch);
      }
      ctx.drawImage(img, 0, 0, cw, ch);
      try {
        resolve(
          format === 'png'
            ? canvas.toDataURL('image/png')
            : canvas.toDataURL('image/jpeg', AVATAR_JPEG_QUALITY),
        );
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => reject(new Error('scaleImageDataUrl'));
    img.src = dataUrl;
  });
}

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
      const keepPng = dataUrl.startsWith('data:image/png');
      if (keepPng) {
        ctx.clearRect(0, 0, cw, ch);
      }
      ctx.drawImage(img, 0, 0, cw, ch);
      try {
        resolve(
          keepPng
            ? canvas.toDataURL('image/png')
            : canvas.toDataURL('image/jpeg', AVATAR_JPEG_QUALITY),
        );
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
    [512, 0.92],
    [384, 0.9],
    [320, 0.88],
    [256, 0.84],
    [192, 0.78],
    [160, 0.7],
    [128, 0.6],
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

/** Круглый экспорт слоя рисования + фона.
 *  keepBadgeOutside: кадр с полями; плашку дорисовывает вызывающий код
 *  (или передайте paintBadge).
 */
export function exportCircularAvatarJpeg(
  baseCanvas: HTMLCanvasElement,
  drawCanvas: HTMLCanvasElement,
  size = AVATAR_MAX_PX,
  opts?: {
    keepBadgeOutside?: boolean;
    paintBadge?: (ctx: CanvasRenderingContext2D, avatarSize: number, originX: number, originY: number) => void;
  },
): string {
  const pad = opts?.keepBadgeOutside ? Math.ceil(size * AVATAR_BADGE_OUTER_PAD_RATIO) : 0;
  const outSize = size + pad * 2;
  const out = document.createElement('canvas');
  out.width = outSize;
  out.height = outSize;
  const ctx = out.getContext('2d');
  if (!ctx) return baseCanvas.toDataURL('image/jpeg', AVATAR_JPEG_QUALITY);

  if (pad > 0) {
    ctx.clearRect(0, 0, outSize, outSize);
  } else {
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, outSize, outSize);
  }

  ctx.save();
  ctx.beginPath();
  ctx.arc(pad + size / 2, pad + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(baseCanvas, pad, pad, size, size);
  ctx.drawImage(drawCanvas, pad, pad, size, size);
  ctx.restore();

  if (opts?.paintBadge) {
    opts.paintBadge(ctx, size, pad, pad);
  }

  /* PNG с альфой — без чёрного кольца вокруг лица при показе в меню */
  if (pad > 0) {
    return out.toDataURL('image/png');
  }
  return out.toDataURL('image/jpeg', AVATAR_JPEG_QUALITY);
}
