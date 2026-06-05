/** Кастомный экспорт из редактора (JPEG data URL заметного размера, с 3D-финишем). */
export function avatarLikelyHas3dMagic(avatarDataUrl: string | null | undefined): boolean {
  if (!avatarDataUrl || !avatarDataUrl.startsWith('data:image')) return false;
  return avatarDataUrl.length > 28_000;
}
