import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';

export interface AvatarPresetRailProps {
  activeId: string | null;
  itemIds: string[];
  onSelectId: (id: string) => void;
  enabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  role?: string;
  'aria-label'?: string;
  railRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}

export function AvatarPresetRail({
  activeId,
  itemIds,
  onSelectId,
  enabled = true,
  autoFocus = false,
  className,
  role = 'list',
  'aria-label': ariaLabel,
  railRef: railRefProp,
  children,
}: AvatarPresetRailProps) {
  const localRailRef = useRef<HTMLDivElement | null>(null);
  const moveLockRef = useRef(0);

  const setRailNode = useCallback(
    (node: HTMLDivElement | null) => {
      localRailRef.current = node;
      if (!railRefProp) return;
      if (typeof railRefProp === 'function') railRefProp(node);
      else (railRefProp as { current: HTMLDivElement | null }).current = node;
    },
    [railRefProp],
  );

  useEffect(() => {
    if (!enabled || !autoFocus || !localRailRef.current) return;
    const id = window.requestAnimationFrame(() => {
      localRailRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(id);
  }, [enabled, autoFocus]);

  useLayoutEffect(() => {
    const rail = localRailRef.current;
    if (!rail) return;
    rail.querySelectorAll<HTMLElement>('.avatar-editor-rail-hot').forEach((el) => {
      el.classList.remove('avatar-editor-rail-hot');
    });
  }, [activeId, children]);

  const scrollPresetIntoView = useCallback((id: string) => {
    const rail = localRailRef.current;
    const el = rail?.querySelector<HTMLElement>(`[data-preset-id="${CSS.escape(id)}"]`);
    if (!rail || !el) return;
    const left = el.offsetLeft;
    const right = left + el.offsetWidth;
    if (left < rail.scrollLeft) rail.scrollLeft = Math.max(0, left - 8);
    else if (right > rail.scrollLeft + rail.clientWidth) {
      rail.scrollLeft = right - rail.clientWidth + 8;
    }
  }, []);

  const move = useCallback(
    (dir: -1 | 1) => {
      if (!itemIds.length) return;
      const now = performance.now();
      if (now < moveLockRef.current) return;
      moveLockRef.current = now + 40;
      const idx = activeId ? itemIds.indexOf(activeId) : -1;
      const next =
        idx < 0 ? (dir > 0 ? 0 : itemIds.length - 1) : (idx + dir + itemIds.length) % itemIds.length;
      const id = itemIds[next]!;
      onSelectId(id);
      scrollPresetIntoView(id);
    },
    [activeId, itemIds, onSelectId, scrollPresetIntoView],
  );

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!enabled) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      move(1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      move(-1);
    }
  };

  return (
    <div
      ref={setRailNode}
      className={['avatar-editor-preset-rail', className].filter(Boolean).join(' ')}
      role={role}
      aria-label={ariaLabel}
      tabIndex={enabled ? 0 : -1}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}