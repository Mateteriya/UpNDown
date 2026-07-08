import { useCallback, useEffect, useRef, useState } from 'react';

/** Формат MM:SS или HH:MM:SS — с секундами, табличные цифры. */
export function formatOnlinePartyElapsed(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

/** Секунды с момента старта партии (сброс при выходе из playing). */
export function useOnlinePartyElapsedSeconds(active: boolean): number {
  const startedAtRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active) {
      startedAtRef.current = null;
      setElapsed(0);
      return;
    }
    if (startedAtRef.current == null) {
      startedAtRef.current = Date.now();
    }
    const tick = () => {
      const start = startedAtRef.current;
      if (start == null) return;
      setElapsed(Math.floor((Date.now() - start) / 1000));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [active]);

  return elapsed;
}

export function OnlinePartyElapsedTimerGlyph({
  seconds,
  className,
}: {
  seconds: number;
  className?: string;
}) {
  return (
    <span
      className={['online-party-elapsed-timer-glyphs online-room-code-badge-iridescent-text', className]
        .filter(Boolean)
        .join(' ')}
    >
      {formatOnlinePartyElapsed(seconds)}
    </span>
  );
}

/**
 * Бейдж кода на столе: 10 с таймер, 3 с код.
 * peekCodeAndRestart — показать код сейчас и заново запустить чередование с фазы «код».
 */
export function useOnlineRoomCodeTimerAlternate(
  enabled: boolean,
  timerMs = 10_000,
  codeMs = 3_000,
): { showTimer: boolean; peekCodeAndRestart: () => void } {
  const [showTimer, setShowTimer] = useState(false);
  const [cycleKey, setCycleKey] = useState(0);
  const startWithCodeRef = useRef(false);

  const peekCodeAndRestart = useCallback(() => {
    startWithCodeRef.current = true;
    setShowTimer(false);
    setCycleKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setShowTimer(false);
      return;
    }
    let cancelled = false;
    let timeoutId = 0;

    const runTimerPhase = () => {
      if (cancelled) return;
      setShowTimer(true);
      timeoutId = window.setTimeout(runCodePhase, timerMs);
    };
    const runCodePhase = () => {
      if (cancelled) return;
      setShowTimer(false);
      timeoutId = window.setTimeout(runTimerPhase, codeMs);
    };

    if (startWithCodeRef.current) {
      startWithCodeRef.current = false;
      setShowTimer(false);
      timeoutId = window.setTimeout(runTimerPhase, codeMs);
    } else {
      runTimerPhase();
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [enabled, cycleKey, timerMs, codeMs]);

  return { showTimer, peekCodeAndRestart };
}
