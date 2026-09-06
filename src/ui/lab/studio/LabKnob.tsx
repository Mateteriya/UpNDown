import { useCallback, useEffect, useId, useRef, type PointerEvent as ReactPointerEvent } from 'react';

type Props = {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
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
  const decimals = String(step).includes('.') ? (String(step).split('.')[1]?.length ?? 0) : 0;
  const fixed = decimals > 0 ? Number(s.toFixed(decimals)) : s;
  return clamp(fixed, min, max);
}

/** Угол указателя: 0° = вверх, −135…+135 = рабочая дуга крутилки. */
function pointerAngleDeg(clientX: number, clientY: number, cx: number, cy: number): number {
  return (Math.atan2(clientX - cx, cy - clientY) * 180) / Math.PI;
}

function valueFromAngle(deg: number, min: number, max: number): number {
  const t = clamp((clamp(deg, -135, 135) + 135) / 270, 0, 1);
  return min + t * (max - min);
}

/**
 * Крутилка как в железе: тяни по дуге вокруг центра (не «вверх = рандом»).
 * Shift — мелкий шаг от вертикали; двойной клик — сброс.
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
  const dialRef = useRef<HTMLButtonElement | null>(null);
  const drag = useRef<{
    pointerId: number;
    cx: number;
    cy: number;
    mode: 'angle' | 'fineY';
    lastY: number;
    v0: number;
  } | null>(null);
  /** Во время драга игнорим props.value — иначе React «дёргает» угол. */
  const draggingRef = useRef(false);
  const valueRef = useRef(value);
  if (!draggingRef.current) valueRef.current = value;

  const span = max - min;
  const t = span <= 0 ? 0 : (valueRef.current - min) / span;
  const angle = -135 + clamp(t, 0, 1) * 270;
  const resetTo = defaultValue ?? (min + max) / 2;
  const gradId = useId().replace(/:/g, '');

  const commit = useCallback(
    (raw: number) => {
      const next = snap(raw, step, min, max);
      if (next === valueRef.current) return;
      valueRef.current = next;
      onChange(next);
    },
    [max, min, onChange, step],
  );

  const onDown = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget;
      el.setPointerCapture?.(e.pointerId);
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      draggingRef.current = true;
      drag.current = {
        pointerId: e.pointerId,
        cx,
        cy,
        mode: e.shiftKey ? 'fineY' : 'angle',
        lastY: e.clientY,
        v0: valueRef.current,
      };
      document.documentElement.classList.add('lab-knob-dragging');
      if (!e.shiftKey) {
        commit(valueFromAngle(pointerAngleDeg(e.clientX, e.clientY, cx, cy), min, max));
      }
    },
    [commit, max, min],
  );

  const onMove = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      const d = drag.current;
      if (!d || d.pointerId !== e.pointerId) return;
      if (e.shiftKey || d.mode === 'fineY') {
        d.mode = 'fineY';
        const dy = d.lastY - e.clientY;
        d.lastY = e.clientY;
        if (dy === 0) return;
        /* ~200px = полный диапазон в режиме Shift */
        commit(valueRef.current + (dy / 200) * span);
        return;
      }
      commit(valueFromAngle(pointerAngleDeg(e.clientX, e.clientY, d.cx, d.cy), min, max));
    },
    [commit, max, min, span],
  );

  const endDrag = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag.current || drag.current.pointerId !== e.pointerId) return;
    drag.current = null;
    draggingRef.current = false;
    document.documentElement.classList.remove('lab-knob-dragging');
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(
    () => () => {
      document.documentElement.classList.remove('lab-knob-dragging');
    },
    [],
  );

  return (
    <div
      className="lab-knob"
      title={`${label}: крути вокруг центра · Shift+↕ точно · 2× клик — сброс`}
    >
      <button
        ref={dialRef}
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
        onDoubleClick={(e) => {
          e.preventDefault();
          commit(resetTo);
        }}
      >
        <svg className="lab-knob__arc" viewBox="0 0 56 56" aria-hidden>
          <defs>
            <linearGradient id={`lab-knob-g-${gradId}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#67e8f9" />
              <stop offset="55%" stopColor="#c084fc" />
              <stop offset="100%" stopColor="#e879f9" />
            </linearGradient>
          </defs>
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
            stroke={`url(#lab-knob-g-${gradId})`}
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
