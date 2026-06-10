import { compressImageToDataUrl } from './avatarImage';
import { markAvatarCameraPending } from './profileAvatarSave';

export function preferNativeCameraPicker(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}

/** Встроенная камера в браузере (https / localhost) — без ухода в системную «убогую» камеру. */
export function canUseInPageCamera(): boolean {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false;
  if (typeof window !== 'undefined' && window.isSecureContext) return true;
  return false;
}

/** Нативная фронталка (мобильный http/LAN) — отдельный input с capture. */
export function openNativeCameraPicker(input: HTMLInputElement | null | undefined): void {
  markAvatarCameraPending();
  input?.click();
}

/** Галерея устройства — input БЕЗ capture, иначе снова откроется камера. */
export function openGalleryPicker(input: HTMLInputElement | null | undefined): void {
  input?.click();
}

/** Снимок с фронтальной камеры → JPEG data URL (ПК / https, внутри редактора). */
export async function captureSelfieDataUrl(): Promise<string> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Камера недоступна в этом браузере');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'user',
      width: { ideal: 1280 },
      height: { ideal: 1280 },
    },
    audio: false,
  });
  try {
    const dataUrl = await frameVideoToSquareJpeg(stream);
    return compressImageToDataUrl(dataUrl);
  } finally {
    for (const t of stream.getTracks()) t.stop();
  }
}

/** Кадр с уже запущенного video (оверлей в редакторе). */
export async function captureVideoElementDataUrl(video: HTMLVideoElement): Promise<string> {
  const raw = frameVideoElementToSquareJpeg(video);
  return compressImageToDataUrl(raw);
}

export function frameVideoElementToSquareJpeg(video: HTMLVideoElement): string {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error('Камера не дала кадр');
  const side = Math.min(w, h);
  const sx = Math.floor((w - side) / 2);
  const sy = Math.floor((h - side) / 2);
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Не удалось снять кадр');
  ctx.drawImage(video, sx, sy, side, side, 0, 0, side, side);
  return canvas.toDataURL('image/jpeg', 0.92);
}

async function frameVideoToSquareJpeg(stream: MediaStream): Promise<string> {
  const video = document.createElement('video');
  video.playsInline = true;
  video.muted = true;
  video.srcObject = stream;
  await video.play();
  await new Promise<void>((resolve) => {
    if (video.readyState >= 2) {
      resolve();
      return;
    }
    video.onloadeddata = () => resolve();
  });
  await new Promise((r) => setTimeout(r, 120));
  return frameVideoElementToSquareJpeg(video);
}
