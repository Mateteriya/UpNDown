import { useLayoutEffect, type RefObject } from 'react';

/** CSS var: `font-size: calc(15px * var(--plasma-turn-name-fit, 1))` (after-short only). */
export const PLASMA_TURN_NAME_FIT_VAR = '--plasma-turn-name-fit';

const MIN_SCALE = 0.72;
const FIT_EPS_PX = 0.75;

/**
 * After-short · экранчик plasma: если имя не влезает при 15px — чуть уменьшить кегль.
 * Короткие имена остаются 1.0. В обычном phone LS не включать.
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

      if (el.scrollWidth > el.clientWidth + FIT_EPS_PX && scale > MIN_SCALE) {
        scale = Math.max(MIN_SCALE, scale * (el.clientWidth / el.scrollWidth) * 0.98);
        el.style.setProperty(PLASMA_TURN_NAME_FIT_VAR, String(Number(scale.toFixed(3))));
      }
    };

    applyFit();

    const ro = new ResizeObserver(() => applyFit());
    ro.observe(el);
    const parent = el.parentElement;
    if (parent) ro.observe(parent);

    return () => {
      ro.disconnect();
      el.style.removeProperty(PLASMA_TURN_NAME_FIT_VAR);
    };
  }, [enabled, text]);
}
