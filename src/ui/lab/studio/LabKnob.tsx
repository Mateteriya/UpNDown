import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';

type Props = {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  /** Двойной клик / сброс — если не задан, середина диапазона. */
  defaultValue?: number;
  format?: (n: number) => string;
  onChange: (v: number) => void;
};

function clamp(n: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, n));
}

function snap(n: number, step: number, min: number, max: number): number {
  if (!(step > 0)) return clamp(n, min, max);
  const s = Math.round(n / step) * step;
  /* убрать артефакты float */
  const decimals = String(step).includes('.') ? (String(step).split('.')[1]?.length ?? 0) : 0;
  const fixed = decimals > 0 ? Number(s.toFixed(decimals)) : s;
  return clamp(fixed, min, max);
}

/**
 * Проф. крутилка (Ableton-style): тяни вверх/вниз, Shift — точно, колесо, двойной клик — сброс.
 */
export function LabKnob({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  defaultValue,
  format,
  onChange,
}: Props) {
  const drag = useRef<{
    pointerId: number;
    lastY: number;
    fine: boolean;
  } | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const span = max - min;
  const t = span <= 0 ? 0 : (value - min) / span;
  const angle = -135 + clamp(t, 0, 1) * 270;
  const resetTo = defaultValue ?? (min + max) / 2;

  /* Полный ход: ~140px по Y (крупнее span → чуть длиннее жест) */
  const pxFull = 120 + Math.min(80, Math.abs(span) * 8);

  const commit = useCallback(
    (raw: number) => {
      const next = snap(raw, step, min, max);
      if (next === valueRef.current) return;
      valueRef.current = next;
      onChange(next);
    },
    [max, min, onChange, step],
  );

  const onDown = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = {
      pointerId: e.pointerId,
      lastY: e.clientY,
      fine: e.shiftKey,
    };
    document.documentElement.classList.add('lab-knob-dragging');
  }, []);

  const onMove = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (!drag.current || drag.current.pointerId !== e.pointerId) return;
      const dy = drag.current.lastY - e.clientY;
      if (dy === 0) return;
      drag.current.lastY = e.clientY;
      drag.current.fine = e.shiftKey;
      const sens = drag.current.fine ? pxFull * 4.5 : pxFull;
      const delta = (dy / sens) * span;
      commit(valueRef.current + delta);
    },
    [commit, pxFull, span],
  );

  const endDrag = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag.current || drag.current.pointerId !== e.pointerId) return;
    drag.current = null;
    document.documentElement.classList.remove('lab-knob-dragging');
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const onWheel = useCallback(
    (e: ReactWheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const fine = e.shiftKey;
      const dir = e.deltaY > 0 ? -1 : 1;
      const steps = fine ? 1 : Math.max(1, Math.round(Math.abs(e.deltaY) / 40));
      const delta = dir * steps * (step > 0 ? step : span * 0.02) * (fine ? 1 : 1);
      commit(valueRef.current + delta);
    },
    [commit, span, step],
  );

  useEffect(
    () => () => {
      document.documentElement.classList.remove('lab-knob-dragging');
    },
    [],
  );

  return (
    <div className="lab-knob" title={`${label}: тяни ↕ · Shift — точно · колесо · 2× клик — сброс`}>
      <button
        type="button"
        className="lab-knob__dial"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={onWheel}
        onDoubleClick={(e) => {
          e.preventDefault();
          commit(resetTo);
        }}
      >
        <svg className="lab-knob__arc" viewBox="0 0 56 56" aria-hidden>
          <path
            className="lab-knob__arc-track"
            d="M10.5 40.5 A 22 22 0 1 1 45.5 40.5"
            fill="none"
          />
          <path
            className="lab-knob__arc-value"
            d="M10.5 40.5 A 22 22 0 1 1 45.5 40.5"
            fill="none"
            pathLength={100}
            strokeDasharray={`${clamp(t, 0, 1) * 100} 100`}
          />
        </svg>
        <span className="lab-knob__face" aria-hidden />
        <span className="lab-knob__mark" style={{ transform: `rotate(${angle}deg)` }} />
      </button>
      <span className="lab-knob__label">{label}</span>
      <span className="lab-knob__value">{format ? format(value) : value.toFixed(2)}</span>
    </div>
  );
}
