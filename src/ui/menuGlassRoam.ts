/**
 * Полёт гравировки — только CSS. JS-сдвиг у капсул давал «троение»
 * (анимация и отталкивание дрались каждый кадр). Не возвращать transform сюда.
 */

export function startMenuGlassRoam(_args: {
  root: HTMLElement;
  drift: HTMLElement;
  etch: HTMLElement;
}): () => void {
  return () => undefined;
}
