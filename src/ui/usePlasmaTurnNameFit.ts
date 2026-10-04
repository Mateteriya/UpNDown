import { useLayoutEffect, type RefObject } from 'react';

/**
 * CSS var: `font-size: calc(var(--plasma-turn-name-base, 15px) * var(--plasma-turn-name-fit, 1))`.
 * Масштаб ставит JS, если имя не влезает в ширину экранчика (портрет / LS / mid / ПК).
 */
export const PLASMA_TURN_NAME_FIT_VAR = '--plasma-turn-name-fit';

/** Ниже — для «Щ»×16+ на узком LS/ПК экранчике. */
const MIN_SCALE = 0.36;
const FIT_EPS_PX = 0.75;

/**
 * Экранчик plasma («Сейчас ход» / «Заказывает»): если имя не влезает при базовом кегле —
 * уменьшить `--plasma-turn-name-fit`. Короткие имена остаются 1.0.
 */
export function usePlasmaTurnNameFit(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  text: string,
): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (!enabled) {
      el.style.removeProperty(PLASMA_TURN_NAME_FIT_VAR);
      return;
    }

    const applyFit = () => {
      el.style.setProperty(PLASMA_TURN_NAME_FIT_VAR, '1');
      void el.offsetWidth;

      const client = el.clientWidth;
      const scroll = el.scrollWidth;
      if (client <= 0 || scroll <= client + FIT_EPS_PX) {
        el.style.setProperty(PLASMA_TURN_NAME_FIT_VAR, '1');
        return;
      }

      let scale = Math.max(MIN_SCALE, (client / scroll) * 0.98);
      el.style.setProperty(PLASMA_TURN_NAME_FIT_VAR, String(Number(scale.toFixed(3))));
      void el.offsetWidth;

      // 2–3 прохода: после уменьшения кегля scrollWidth пересчитывается нелинейно
      for (let i = 0; i < 2; i += 1) {
        if (el.scrollWidth <= el.clientWidth + FIT_EPS_PX || scale <= MIN_SCALE) break;
        scale = Math.max(MIN_SCALE, scale * (el.clientWidth / el.scrollWidth) * 0.98);
        el.style.setProperty(PLASMA_TURN_NAME_FIT_VAR, String(Number(scale.toFixed(3))));
        void el.offsetWidth;
      }
    };

    applyFit();

    const ro = new ResizeObserver(() => applyFit());
    ro.observe(el);
    const parent = el.parentElement;
    if (parent) ro.observe(parent);
    const screen = el.closest('.game-info-plasma-screen');
    if (screen && screen !== parent) ro.observe(screen);

    return () => {
      ro.disconnect();
      el.style.removeProperty(PLASMA_TURN_NAME_FIT_VAR);
    };
  }, [enabled, text]);
}
