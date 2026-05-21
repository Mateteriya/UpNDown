/**
 * Неоновая палитра: быстрые цвета + встроенный выбор (без системных подмодалок на телефоне).
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { HexColorPicker } from 'react-colorful';

/** Быстрые цвета слева от кнопки палитры */
export const BRUSH_QUICK_COLORS = ['#ffffff', '#22d3ee', '#f472b6'] as const;

/** Неоновая сетка в раскрывающейся палитре (насыщенные «светящиеся» оттенки) */
export const NEON_PALETTE_SWATCHES = [
  '#ffffff',
  '#e8feff',
  '#00ffff',
  '#00e5ff',
  '#66ffff',
  '#bf00ff',
  '#ff00ff',
  '#ff33ee',
  '#ff1493',
  '#ff0066',
  '#ffff00',
  '#ffee00',
  '#57ff0d',
  '#00ff88',
  '#1a0033',
  '#080812',
] as const;

const PANEL_WIDTH = 228;
const PANEL_EST_HEIGHT = 320;

const DARK_SWATCHES = new Set(['#1a0033', '#080812']);

function neonSwatchStyle(hex: string): CSSProperties {
  const dark = DARK_SWATCHES.has(hex);
  const glow = dark ? '#a855f7' : hex;
  return {
    background: hex,
    boxShadow: dark
      ? `0 0 12px ${glow}aa, inset 0 0 0 1px rgba(167,139,250,0.6)`
      : `0 0 16px ${glow}, 0 0 8px ${glow}, 0 0 2px #fff, inset 0 1px 0 rgba(255,255,255,0.75)`,
  };
}

/** Обычная кисть: ровные «краски» без внешнего свечения */
function flatSwatchStyle(hex: string): CSSProperties {
  const dark = DARK_SWATCHES.has(hex);
  return {
    background: hex,
    boxShadow: dark
      ? 'inset 0 0 0 1px rgba(255,255,255,0.12)'
      : 'inset 0 1px 2px rgba(0,0,0,0.4), inset 0 -1px 0 rgba(255,255,255,0.14)',
  };
}

function swatchStyle(hex: string, neon: boolean): CSSProperties {
  return neon ? neonSwatchStyle(hex) : flatSwatchStyle(hex);
}

function clampPanelPos(top: number, left: number, panelW: number, panelH: number) {
  const pad = 10;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    top: Math.max(pad, Math.min(top, vh - panelH - pad)),
    left: Math.max(pad, Math.min(left, vw - panelW - pad)),
  };
}

export interface AvatarNeonColorPickerProps {
  color: string;
  onChange: (hex: string) => void;
  neonBrush: boolean;
  onNeonBrushChange: (neon: boolean) => void;
  className?: string;
}

function normalizeHex(raw: string): string {
  const c = raw.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(c)) return c.toLowerCase();
  if (/^#[0-9A-Fa-f]{3}$/.test(c)) {
    const r = c[1];
    const g = c[2];
    const b = c[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return '#ffffff';
}

export function AvatarNeonColorPicker({
  color,
  onChange,
  neonBrush,
  onNeonBrushChange,
  className,
}: AvatarNeonColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const userPlacedRef = useRef(false);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; origTop: number; origLeft: number } | null>(
    null,
  );
  const hex = normalizeHex(color);
  const [hexInput, setHexInput] = useState(hex);

  const closePanel = () => setOpen(false);

  useEffect(() => {
    if (open) setHexInput(hex);
  }, [hex, open]);

  const updatePanelPosition = useCallback(() => {
    const panel = panelRef.current;
    const trigger = triggerRef.current;
    if (!panel) return;

    const panelH = panel.offsetHeight || PANEL_EST_HEIGHT;
    const panelW = PANEL_WIDTH;

    if (userPlacedRef.current) {
      setPanelPos((p) => clampPanelPos(p.top, p.left, panelW, panelH));
      return;
    }

    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const narrow = vw < 420;
    const gap = 10;

    let left = narrow ? Math.max(10, (vw - panelW) / 2) : r.left + r.width / 2 - panelW / 2;
    let top = r.top - panelH - gap;

    if (top < 16) {
      top = Math.max(16, vh * 0.12);
    }
    if (top + panelH > vh - 12 && r.bottom + gap + panelH <= vh - 12) {
      top = r.bottom + gap;
    }

    setPanelPos(clampPanelPos(top, left, panelW, panelH));
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPosition();
    window.addEventListener('resize', updatePanelPosition);
    return () => window.removeEventListener('resize', updatePanelPosition);
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const onDragPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    userPlacedRef.current = true;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origTop: panelPos.top,
      origLeft: panelPos.left,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onDragPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const panelH = panelRef.current?.offsetHeight ?? PANEL_EST_HEIGHT;
    const dy = e.clientY - d.startY;
    const dx = e.clientX - d.startX;
    setPanelPos(clampPanelPos(d.origTop + dy, d.origLeft + dx, PANEL_WIDTH, panelH));
  };

  const onDragPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  };

  const openPanel = () => {
    setOpen((o) => {
      if (!o) userPlacedRef.current = false;
      return !o;
    });
  };

  const pickSwatch = (next: string) => {
    onChange(normalizeHex(next));
  };

  const panel = open ? (
    <>
      <div className="avatar-neon-picker__backdrop" aria-hidden />
      <div
        ref={panelRef}
        className="avatar-neon-picker__panel"
        role="dialog"
        aria-label="Палитра цветов"
        style={{ top: panelPos.top, left: panelPos.left, width: PANEL_WIDTH }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="avatar-neon-picker__header"
          onPointerDown={onDragPointerDown}
          onPointerMove={onDragPointerMove}
          onPointerUp={onDragPointerUp}
          onPointerCancel={onDragPointerUp}
        >
          <span className="avatar-neon-picker__drag" aria-hidden title="Перетащить">
            <span className="avatar-neon-picker__drag-col">⋮</span>
            <span className="avatar-neon-picker__drag-col">⋮</span>
          </span>
          <span className="avatar-neon-picker__title">Цвета кисти</span>
          <div className="avatar-neon-picker__header-actions">
            <button type="button" className="avatar-neon-picker__ok" onClick={closePanel}>
              OK
            </button>
            <button type="button" className="avatar-neon-picker__close" aria-label="Закрыть" onClick={closePanel}>
              ×
            </button>
          </div>
        </div>

        <div className="avatar-neon-picker__mode" role="group" aria-label="Режим кисти">
          <button
            type="button"
            className={['avatar-neon-picker__mode-btn', neonBrush ? 'avatar-neon-picker__mode-btn--active' : ''].join(' ')}
            onClick={() => onNeonBrushChange(true)}
          >
            Неон
          </button>
          <button
            type="button"
            className={['avatar-neon-picker__mode-btn', !neonBrush ? 'avatar-neon-picker__mode-btn--active' : ''].join(' ')}
            onClick={() => onNeonBrushChange(false)}
          >
            Обычная
          </button>
        </div>

        <p className="avatar-neon-picker__lead">
          {neonBrush ? 'Свечение на линиях' : 'Ровный цвет без свечения'}
        </p>
        <div className={['avatar-neon-picker__grid', neonBrush ? '' : 'avatar-neon-picker__grid--flat'].filter(Boolean).join(' ')}>
          {NEON_PALETTE_SWATCHES.map((sw) => (
            <button
              key={sw}
              type="button"
              className={[
                'avatar-neon-picker__swatch',
                neonBrush ? '' : 'avatar-neon-picker__swatch--flat',
                hex === sw ? 'avatar-neon-picker__swatch--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={swatchStyle(sw, neonBrush)}
              onClick={() => pickSwatch(sw)}
              aria-label={sw}
            />
          ))}
        </div>
        <p className="avatar-neon-picker__manual-title">Точный цвет</p>
        <div className="avatar-neon-picker__hex">
          <HexColorPicker color={hex} onChange={(c) => onChange(normalizeHex(c))} />
        </div>
        <label className="avatar-neon-picker__hex-field">
          <span className="avatar-neon-picker__hex-field-label">Код</span>
          <input
            type="text"
            className="avatar-neon-picker__hex-input"
            value={hexInput}
            maxLength={7}
            spellCheck={false}
            onChange={(e) => {
              const v = e.target.value;
              if (!/^#[0-9A-Fa-f]{0,6}$/.test(v)) return;
              setHexInput(v);
              if (/^#[0-9A-Fa-f]{6}$/.test(v)) onChange(normalizeHex(v));
            }}
          />
        </label>
      </div>
    </>
  ) : null;

  return (
    <div className={['avatar-neon-picker', className].filter(Boolean).join(' ')}>
      <div className="avatar-neon-picker__brush-mode" role="group" aria-label="Режим кисти">
        <button
          type="button"
          className={['avatar-neon-picker__brush-mode-btn', neonBrush ? 'avatar-neon-picker__brush-mode-btn--active' : ''].join(' ')}
          onClick={() => onNeonBrushChange(true)}
          title="Кисть со свечением"
        >
          Неон
        </button>
        <button
          type="button"
          className={['avatar-neon-picker__brush-mode-btn', !neonBrush ? 'avatar-neon-picker__brush-mode-btn--active' : ''].join(' ')}
          onClick={() => onNeonBrushChange(false)}
          title="Обычная кисть"
        >
          Обыч
        </button>
      </div>
      <button
        ref={triggerRef}
        type="button"
        className={['avatar-neon-picker__trigger', open ? 'avatar-neon-picker__trigger--open' : ''].join(' ')}
        onClick={openPanel}
        aria-label="Все цвета"
        aria-expanded={open}
        title="Палитра цветов"
      >
        <span
          className={['avatar-neon-picker__trigger-swatch', neonBrush ? '' : 'avatar-neon-picker__trigger-swatch--flat'].filter(Boolean).join(' ')}
          style={swatchStyle(hex, neonBrush)}
        />
        <span className="avatar-neon-picker__trigger-label">Цвета</span>
      </button>
      {panel && createPortal(panel, document.body)}
    </div>
  );
}

