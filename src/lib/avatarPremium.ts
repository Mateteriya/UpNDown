import { getAvatar3dPolishFlag } from './avatar3dFinish';

/** Кастомный экспорт из редактора с 3D-финишем (флаг + эвристика по размеру JPEG). */
export function avatarLikelyHas3dMagic(avatarDataUrl: string | null | undefined): boolean {
  if (getAvatar3dPolishFlag()) return true;
  if (!avatarDataUrl || !avatarDataUrl.startsWith('data:image')) return false;
  return avatarDataUrl.length > 28_000;
}
