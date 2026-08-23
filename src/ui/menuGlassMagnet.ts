/**
 * ПК: гравировка чуть тянется к курсору, пока он над буквами.
 * Сдвиг только на __steer — не трогать transform у __drift (CSS-полёт)
 * и у __etch (пульс масштаба).
 */

const PULL = 0.26;
const MAX_PX = 18;
const LERP = 0.18;

function clamp(n: number, max: number): number {
  return Math.max(-max, Math.min(max, n));
}

const FLY_HOVER_RATE = 0.08;

function setFlyRate(drift: HTMLElement | null, rate: number) {
  if (!drift) return;
  for (const anim of drift.getAnimations()) {
    if (typeof anim.updatePlaybackRate === 'function') anim.updatePlaybackRate(rate);
    else anim.playbackRate = rate;
  }
}

export function startMenuGlassMagnet(args: {
  steer: HTMLElement;
  etch: HTMLElement;
}): () => void {
  const { steer, etch } = args;
  const drift = steer.parentElement;
  const pc = window.matchMedia('(min-width: 1025px) and (pointer: fine)');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  let hovering = false;
  let raf = 0;
  let x = 0;
  let y = 0;
  let tx = 0;
  let ty = 0;

  const stopRaf = () => {
    if (!raf) return;
    cancelAnimationFrame(raf);
    raf = 0;
  };

  const apply = () => {
    if (Math.abs(x) < 0.08 && Math.abs(y) < 0.08) {
      x = 0;
      y = 0;
      steer.style.transform = '';
      return;
    }
    steer.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
  };

  const tick = () => {
    raf = 0;
    x += (tx - x) * LERP;
    y += (ty - y) * LERP;
    apply();
    const still = hovering || Math.abs(tx - x) > 0.12 || Math.abs(ty - y) > 0.12 || Math.abs(x) > 0.08 || Math.abs(y) > 0.08;
    if (still) raf = requestAnimationFrame(tick);
  };

  const kick = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };

  const onMove = (e: PointerEvent) => {
    if (!pc.matches || reduce.matches) return;
    if (!hovering) setFlyRate(drift, FLY_HOVER_RATE);
    hovering = true;
    const r = etch.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    tx = clamp(dx * PULL, MAX_PX);
    ty = clamp(dy * PULL, MAX_PX);
    kick();
  };

  const onLeave = () => {
    hovering = false;
    tx = 0;
    ty = 0;
    setFlyRate(drift, 1);
    kick();
  };

  const onChange = () => {
    if (pc.matches && !reduce.matches) return;
    hovering = false;
    tx = 0;
    ty = 0;
    x = 0;
    y = 0;
    stopRaf();
    steer.style.transform = '';
    setFlyRate(drift, 1);
  };

  etch.addEventListener('pointermove', onMove);
  etch.addEventListener('pointerleave', onLeave);
  pc.addEventListener('change', onChange);
  reduce.addEventListener('change', onChange);

  return () => {
    etch.removeEventListener('pointermove', onMove);
    etch.removeEventListener('pointerleave', onLeave);
    pc.removeEventListener('change', onChange);
    reduce.removeEventListener('change', onChange);
    stopRaf();
    steer.style.transform = '';
    setFlyRate(drift, 1);
  };
}
