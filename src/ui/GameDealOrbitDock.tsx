/**
 * Малый орбитальный диск раздач (ПК / планшет) и модалка полного диска.
 * В GameTable мини-диск вынесен порталом на body (`position: fixed`), без участия в разметке панели Юга.
 * Мобильный viewport не использует этот блок — см. GameTable.
 */

import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { DEALS_PER_MATCH } from '../game/GameEngine';
import {
  DEAL_TRACK_LAB_MODAL_CYCLE_ON_OPEN,
  DEAL_TRACK_LAB_MODAL_SWEEP_DURATION_MS,
  DEAL_TRACK_LAB_ORBIT_HOVER_LEAVE_MS,
  OrbitTrackDisk,
  ORBIT_TOOLTIP_ID,
  orbitSpotPosition,
  orbitTooltipChromeVars,
  findOrbitTooltipPosition,
  getOrbitDigitHueDegrees,
  getOrbitPointTooltipText,
  type OrbitTooltipState,
} from './DealTrackLabPage';
import './deal-track-lab-orbit-tooltip.css';


/** Первый заход в комнату (вкладка): быстрый прогон по орбите у малого диска. */
const GAME_DEAL_ORBIT_ROOM_INTRO = true;
const GAME_DEAL_ORBIT_CLICK_PREVIEW_HOLD_MS = 1800;
const GAME_DEAL_ORBIT_CURRENT_SWEEP_STEP_MS = 52;
const GAME_DEAL_ORBIT_SWEEP_NEON_HUES = [190, 260, 218, 286] as const;

type OrbitBallGeom = { left: number; top: number; width: number; height: number };

const noSetDeal: Dispatch<SetStateAction<number>> = () => {
  /* орбита только для просмотра */
};

function renderTooltipWords(text: string, className: string) {
  return text.split(/(\s+)/).map((chunk, idx) => {
    if (chunk.trim().length === 0) return <span key={`s-${idx}`}>{chunk}</span>;
    return (
      <span
        key={`w-${idx}-${chunk}`}
        className={className}
        style={{ ['--orbit-neon-word-idx' as string]: String(idx % 6) } as CSSProperties}
      >
        {chunk}
      </span>
    );
  });
}

export type GameDealOrbitDockProps = {
  dealNumber: number;
  /** Уникальный ключ сессии комнаты: online.roomId или `'offline'`. */
  roomIntroKey: string;
  prefersReducedMotion: boolean;
};

export function GameDealOrbitDock({
  dealNumber,
  roomIntroKey,
  prefersReducedMotion,
}: GameDealOrbitDockProps) {
  const totalDeals = DEALS_PER_MATCH;
  const currentDeal = useMemo(() => {
    const n = Number.isFinite(dealNumber) ? Math.trunc(dealNumber) : 1;
    return Math.min(totalDeals, Math.max(1, n));
  }, [dealNumber, totalDeals]);

  const [orbitScaleModalOpen, setOrbitScaleModalOpen] = useState(false);
  const [modalIntroRunning, setModalIntroRunning] = useState(false);
  const [currentDealSweepRunning, setCurrentDealSweepRunning] = useState(false);
  const [currentDealSweepDeal, setCurrentDealSweepDeal] = useState<number | null>(null);

  const [hoveredDeal, setHoveredDeal] = useState<number | null>(null);
  const [orbitCenterHoldDeal, setOrbitCenterHoldDeal] = useState<number | null>(null);
  const [orbitHoverPreviewSuppressed, setOrbitHoverPreviewSuppressed] = useState(false);
  const [orbitTooltip, setOrbitTooltip] = useState<OrbitTooltipState | null>(null);

  const diskRef = useRef<HTMLDivElement | null>(null);
  const orbitTooltipDiskElRef = useRef<HTMLElement | null>(null);
  const orbitBallGeomRef = useRef<OrbitBallGeom | null>(null);
  const orbitHoverLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orbitClickHoldTimerRef = useRef<number | null>(null);
  const orbitScaleDialogRef = useRef<HTMLDialogElement | null>(null);
  const replicaLaunchBtnRef = useRef<HTMLButtonElement | null>(null);
  const orbitModalWasOpenRef = useRef(false);
  const currentDealSweepRafRef = useRef<number | null>(null);
  const currentDealSweepStartDealRef = useRef(1);
  const prevDealRef = useRef<number | null>(null);

  const cancelOrbitHoverLeaveTimer = useCallback(() => {
    if (orbitHoverLeaveTimerRef.current !== null) {
      clearTimeout(orbitHoverLeaveTimerRef.current);
      orbitHoverLeaveTimerRef.current = null;
    }
  }, []);

  const clearOrbitClickHold = useCallback(() => {
    if (orbitClickHoldTimerRef.current !== null) {
      clearTimeout(orbitClickHoldTimerRef.current);
      orbitClickHoldTimerRef.current = null;
    }
    setOrbitCenterHoldDeal(null);
    setOrbitHoverPreviewSuppressed(false);
  }, []);

  const resumeOrbitHoverPreview = useCallback(() => {
    setOrbitHoverPreviewSuppressed(false);
  }, []);

  const beginOrbitClickPreviewHold = useCallback((d: number, _revertTo: number) => {
    if (d === _revertTo) {
      if (!prefersReducedMotion && !currentDealSweepRunning) {
        currentDealSweepStartDealRef.current = _revertTo;
        setCurrentDealSweepDeal(_revertTo);
        setCurrentDealSweepRunning(true);
      }
      return;
    }
    if (orbitClickHoldTimerRef.current !== null) {
      clearTimeout(orbitClickHoldTimerRef.current);
      orbitClickHoldTimerRef.current = null;
    }
    setOrbitHoverPreviewSuppressed(false);
    setOrbitCenterHoldDeal(d);
    orbitClickHoldTimerRef.current = window.setTimeout(() => {
      orbitClickHoldTimerRef.current = null;
      setOrbitCenterHoldDeal(null);
      setHoveredDeal(null);
      setOrbitTooltip(null);
      setOrbitHoverPreviewSuppressed(true);
    }, GAME_DEAL_ORBIT_CLICK_PREVIEW_HOLD_MS);
  }, [currentDealSweepRunning, prefersReducedMotion]);

  useEffect(() => {
    if (!currentDealSweepRunning) {
      if (currentDealSweepRafRef.current != null) {
        window.cancelAnimationFrame(currentDealSweepRafRef.current);
        currentDealSweepRafRef.current = null;
      }
      return;
    }

    let cancelled = false;
    let lastTs: number | null = null;
    let elapsed = 0;
    let stepsDone = 0;
    const startDeal = currentDealSweepStartDealRef.current;
    let cursor = startDeal;

    const tick = (ts: number) => {
      if (cancelled) return;
      if (lastTs == null) lastTs = ts;
      elapsed += ts - lastTs;
      lastTs = ts;

      while (elapsed >= GAME_DEAL_ORBIT_CURRENT_SWEEP_STEP_MS && stepsDone < totalDeals) {
        elapsed -= GAME_DEAL_ORBIT_CURRENT_SWEEP_STEP_MS;
        stepsDone += 1;
        cursor = ((cursor % totalDeals) || 0) + 1;
        setCurrentDealSweepDeal(cursor);
      }

      if (stepsDone >= totalDeals) {
        setCurrentDealSweepDeal(startDeal);
        setCurrentDealSweepRunning(false);
        return;
      }

      currentDealSweepRafRef.current = window.requestAnimationFrame(tick);
    };

    currentDealSweepRafRef.current = window.requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (currentDealSweepRafRef.current != null) {
        window.cancelAnimationFrame(currentDealSweepRafRef.current);
        currentDealSweepRafRef.current = null;
      }
    };
  }, [currentDealSweepRunning, totalDeals]);

  useEffect(() => () => cancelOrbitHoverLeaveTimer(), [cancelOrbitHoverLeaveTimer]);
  useEffect(() => () => clearOrbitClickHold(), [clearOrbitClickHold]);

  /** Прогон малого диска: на входе и при старте новой партии (когда номер раздачи падает). */
  useEffect(() => {
    if (!GAME_DEAL_ORBIT_ROOM_INTRO || prefersReducedMotion || currentDealSweepRunning) {
      prevDealRef.current = currentDeal;
      return;
    }

    const prev = prevDealRef.current;
    const shouldRun = prev == null || currentDeal < prev;
    prevDealRef.current = currentDeal;
    if (!shouldRun) return;

    currentDealSweepStartDealRef.current = currentDeal;
    setCurrentDealSweepDeal(currentDeal);
    setCurrentDealSweepRunning(true);
  }, [currentDeal, currentDealSweepRunning, prefersReducedMotion, roomIntroKey]);

  useEffect(() => {
    if (!orbitScaleModalOpen || !DEAL_TRACK_LAB_MODAL_CYCLE_ON_OPEN || prefersReducedMotion) {
      setModalIntroRunning(false);
      return;
    }
    setModalIntroRunning(true);
  }, [orbitScaleModalOpen, prefersReducedMotion]);

  useEffect(() => {
    const d = orbitScaleDialogRef.current;
    if (!d) return;

    if (orbitScaleModalOpen) {
      cancelOrbitHoverLeaveTimer();
      clearOrbitClickHold();
      setHoveredDeal(null);
      setOrbitTooltip(null);
      if (!d.open) d.showModal();
    } else if (d.open) {
      d.close();
    }

    let innerRaf = 0;
    if (orbitModalWasOpenRef.current && !orbitScaleModalOpen) {
      const outerRaf = window.requestAnimationFrame(() => {
        innerRaf = window.requestAnimationFrame(() => {
          replicaLaunchBtnRef.current?.blur();
          clearOrbitClickHold();
          setHoveredDeal(null);
          setOrbitTooltip(null);
          cancelOrbitHoverLeaveTimer();
        });
      });
      orbitModalWasOpenRef.current = orbitScaleModalOpen;
      return () => {
        window.cancelAnimationFrame(outerRaf);
        window.cancelAnimationFrame(innerRaf);
      };
    }

    orbitModalWasOpenRef.current = orbitScaleModalOpen;
    return undefined;
  }, [orbitScaleModalOpen, cancelOrbitHoverLeaveTimer, clearOrbitClickHold]);

  useEffect(() => {
    if (orbitTooltip == null) {
      orbitTooltipDiskElRef.current = null;
      return;
    }
    const hide = () => setOrbitTooltip(null);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [orbitTooltip]);

  const clearOrbitTooltip = useCallback(() => setOrbitTooltip(null), []);

  const showOrbitTooltip = useCallback((deal: number, target: HTMLElement) => {
    const disk = target.closest<HTMLElement>('[data-deal-track-lab-disk]');
    const diskRect = disk?.getBoundingClientRect();
    if (!disk || !diskRect) return;
    orbitTooltipDiskElRef.current = disk;
    const br = target.getBoundingClientRect();
    orbitBallGeomRef.current = {
      left: br.left,
      top: br.top,
      width: br.width,
      height: br.height,
    };
    const ballRect = DOMRect.fromRect({
      x: br.left,
      y: br.top,
      width: br.width,
      height: br.height,
    });
    const text = getOrbitPointTooltipText(deal);
    const pos = findOrbitTooltipPosition(diskRect, ballRect, text);
    setOrbitTooltip({
      deal,
      text,
      left: pos.left,
      top: pos.top,
      accentHue: getOrbitDigitHueDegrees(deal),
      refine: true,
    });
  }, []);

  useLayoutEffect(() => {
    if (orbitTooltip?.refine !== true) return;
    const disk = orbitTooltipDiskElRef.current?.getBoundingClientRect();
    const bg = orbitBallGeomRef.current;
    const el = document.getElementById(ORBIT_TOOLTIP_ID);
    if (!disk || !bg || !el) {
      setOrbitTooltip((t: OrbitTooltipState | null) => (t ? { ...t, refine: false } : t));
      return;
    }
    const ballRect = DOMRect.fromRect({
      x: bg.left,
      y: bg.top,
      width: bg.width,
      height: bg.height,
    });
    const { width: mw, height: mh } = el.getBoundingClientRect();
    const pos = findOrbitTooltipPosition(disk, ballRect, orbitTooltip.text, {
      w: Math.max(1, mw),
      h: Math.max(1, mh),
    });
    setOrbitTooltip((t: OrbitTooltipState | null) =>
      t && t.refine ? { ...t, left: pos.left, top: pos.top, refine: false } : t,
    );
  }, [orbitTooltip]);

  const deals = useMemo(
    () => Array.from({ length: totalDeals }, (_, i) => i + 1),
    [totalDeals],
  );

  const visualCurrentDeal = orbitCenterHoldDeal ?? currentDealSweepDeal ?? currentDeal;
  const orbitEffectiveHoveredDeal = orbitHoverPreviewSuppressed ? null : hoveredDeal;
  const mainOrbitDeal = visualCurrentDeal;
  const focusedDealMain = orbitCenterHoldDeal ?? orbitEffectiveHoveredDeal ?? mainOrbitDeal;
  const sweepHueDeal = currentDealSweepDeal ?? currentDeal;
  const sweepHue =
    GAME_DEAL_ORBIT_SWEEP_NEON_HUES[((sweepHueDeal - 1) % GAME_DEAL_ORBIT_SWEEP_NEON_HUES.length + GAME_DEAL_ORBIT_SWEEP_NEON_HUES.length) %
      GAME_DEAL_ORBIT_SWEEP_NEON_HUES.length];

  const normDeg = (20 / totalDeals) * 360;
  const ntDeg = (4 / totalDeals) * 360;
  const circleRingDotR = 176;
  const circleCx = 210;
  const circleCy = 210;

  const currentOrbitFloorMain = orbitSpotPosition(
    mainOrbitDeal,
    totalDeals,
    circleCx,
    circleCy,
    circleRingDotR,
  );
  const orbitPreviewTargetMini = orbitCenterHoldDeal ?? orbitEffectiveHoveredDeal ?? null;
  const orbitPreviewUiActiveMini =
    orbitCenterHoldDeal !== null || orbitEffectiveHoveredDeal !== null || currentDealSweepRunning;
  const previewOrbitFloorMain =
    orbitPreviewTargetMini != null && orbitPreviewTargetMini !== mainOrbitDeal
      ? orbitSpotPosition(orbitPreviewTargetMini, totalDeals, circleCx, circleCy, circleRingDotR)
      : null;
  const warmOrbitGlowPosMini =
    orbitPreviewTargetMini != null
      ? orbitSpotPosition(orbitPreviewTargetMini, totalDeals, circleCx, circleCy, circleRingDotR)
      : null;

  const modalOrbitCssSweepConfig =
    orbitScaleModalOpen &&
    modalIntroRunning &&
    DEAL_TRACK_LAB_MODAL_CYCLE_ON_OPEN &&
    !prefersReducedMotion
      ? {
          durationMs: DEAL_TRACK_LAB_MODAL_SWEEP_DURATION_MS,
          onEnd: () => setModalIntroRunning(false),
        }
      : null;

  const modalOrbitDeal = visualCurrentDeal;
  const focusedDealModal = orbitCenterHoldDeal ?? orbitEffectiveHoveredDeal ?? modalOrbitDeal;
  const orbitPreviewTargetModal =
    orbitCenterHoldDeal ?? orbitEffectiveHoveredDeal ?? null;
  const orbitPreviewUiActiveModal =
    orbitCenterHoldDeal !== null ||
    orbitEffectiveHoveredDeal !== null ||
    (orbitScaleModalOpen && modalIntroRunning);
  const currentOrbitFloorModal = orbitSpotPosition(
    modalOrbitDeal,
    totalDeals,
    circleCx,
    circleCy,
    circleRingDotR,
  );
  const previewOrbitFloorModal =
    orbitPreviewTargetModal != null && orbitPreviewTargetModal !== modalOrbitDeal
      ? orbitSpotPosition(orbitPreviewTargetModal, totalDeals, circleCx, circleCy, circleRingDotR)
      : null;
  const warmOrbitGlowPosModal =
    modalOrbitCssSweepConfig != null
      ? null
      : orbitPreviewTargetModal != null
        ? orbitSpotPosition(orbitPreviewTargetModal, totalDeals, circleCx, circleCy, circleRingDotR)
        : null;
  const orbitTooltipPortalTarget =
    orbitTooltipDiskElRef.current?.closest('dialog[open]') ?? document.body;
  const orbitTooltipOnBigDisk = orbitTooltipDiskElRef.current?.closest('.game-deal-orbit-dock__dialog') != null;

  return (
    <div
      className="game-deal-orbit-dock"
      style={{ '--deal-lab-point-size': `26px` } as CSSProperties}
    >
      <div
        className="deal-track-lab-orbit-replica-btn game-deal-orbit-dock__mini"
        role="group"
        aria-label="Круговая шкала раздач в партии"
      >
        <div className="deal-track-lab-orbit-replica-inner">
          <OrbitTrackDisk
            diskRef={diskRef}
            normDeg={normDeg}
            ntDeg={ntDeg}
            totalDeals={totalDeals}
            deals={deals}
            currentDeal={mainOrbitDeal}
            orbitPreviewUiActive={orbitPreviewUiActiveMini}
            focusedDeal={focusedDealMain}
            currentOrbitFloor={currentOrbitFloorMain}
            previewOrbitFloor={previewOrbitFloorMain}
            warmOrbitGlowPos={warmOrbitGlowPosMini}
            orbitTooltipDeal={orbitTooltip?.deal ?? null}
            cancelOrbitHoverLeaveTimer={cancelOrbitHoverLeaveTimer}
            setHoveredDeal={setHoveredDeal}
            setOrbitTooltip={setOrbitTooltip}
            showOrbitTooltip={showOrbitTooltip}
            setCurrentDeal={noSetDeal}
            orbitHoverLeaveTimerRef={orbitHoverLeaveTimerRef}
            beginOrbitClickPreviewHold={beginOrbitClickPreviewHold}
            onOrbitHoverResume={resumeOrbitHoverPreview}
            orbitCssSuppressHover={orbitHoverPreviewSuppressed}
            orbitHoldPinkAccent={orbitCenterHoldDeal !== null}
            centerNumOpensLargeScale
            onOpenLargeScale={() => setOrbitScaleModalOpen(true)}
            largeScaleModalOpen={orbitScaleModalOpen}
            replicaLaunchButtonRef={replicaLaunchBtnRef}
            orbitReplicaSpectrum
            orbitReplica
            orbitPointsReadOnly
            orbitSweepInstant={currentDealSweepRunning}
            orbitSweepNeonHue={currentDealSweepRunning ? sweepHue : null}
            centerLabelLayoutDeal={focusedDealMain}
          />
        </div>
      </div>

      <dialog
        ref={orbitScaleDialogRef}
        id="game-deal-orbit-scale-dialog"
        className="deal-track-lab-orbit-scale-dialog game-deal-orbit-dock__dialog"
        aria-labelledby="game-deal-orbit-scale-title"
        onClose={() => setOrbitScaleModalOpen(false)}
      >
        <div className="deal-track-lab-orbit-scale-dialog-surface">
          <header className="deal-track-lab-orbit-scale-dialog-head">
            <h2 id="game-deal-orbit-scale-title" className="deal-track-lab-orbit-scale-dialog-title">
              Раздачи партии
            </h2>
            <button
              type="button"
              className="deal-track-lab-orbit-scale-dialog-close"
              autoFocus
              onClick={() => setOrbitScaleModalOpen(false)}
            >
              Закрыть
            </button>
          </header>
          <div className="deal-track-lab-orbit-scale-disk">
            <div className="deal-track-lab-circle-wrap deal-track-lab-circle-wrap--in-row">
              <OrbitTrackDisk
                normDeg={normDeg}
                ntDeg={ntDeg}
                totalDeals={totalDeals}
                deals={deals}
                currentDeal={modalOrbitDeal}
                orbitPreviewUiActive={orbitPreviewUiActiveModal}
                focusedDeal={focusedDealModal}
                currentOrbitFloor={currentOrbitFloorModal}
                previewOrbitFloor={previewOrbitFloorModal}
                warmOrbitGlowPos={warmOrbitGlowPosModal}
                orbitTooltipDeal={orbitTooltip?.deal ?? null}
                cancelOrbitHoverLeaveTimer={cancelOrbitHoverLeaveTimer}
                setHoveredDeal={setHoveredDeal}
                setOrbitTooltip={setOrbitTooltip}
                showOrbitTooltip={showOrbitTooltip}
                setCurrentDeal={noSetDeal}
                orbitHoverLeaveTimerRef={orbitHoverLeaveTimerRef}
                beginOrbitClickPreviewHold={beginOrbitClickPreviewHold}
                onOrbitHoverResume={resumeOrbitHoverPreview}
                orbitCssSuppressHover={orbitHoverPreviewSuppressed}
                orbitHoldPinkAccent={orbitCenterHoldDeal !== null}
                orbitPointDealNumbers
                deckStripAboveCap
                orbitPointsReadOnly
                orbitCssRingSweep={modalOrbitCssSweepConfig}
                orbitSweepInstant={modalIntroRunning && modalOrbitCssSweepConfig == null}
                centerLabelLayoutDeal={focusedDealModal}
              />
            </div>
          </div>
        </div>
      </dialog>

      {orbitTooltip != null &&
        createPortal(
          (() => {
            const sep = ' · ';
            const i = orbitTooltip.text.indexOf(sep);
            const tipMain = i === -1 ? orbitTooltip.text : orbitTooltip.text.slice(0, i);
            const tipSub = i === -1 ? null : orbitTooltip.text.slice(i + sep.length);
            return (
              <div
                id={ORBIT_TOOLTIP_ID}
                role="tooltip"
                className="deal-track-lab-orbit-tooltip deal-track-lab-orbit-tooltip--app"
                style={
                  {
                    position: 'fixed',
                    left: orbitTooltip.left,
                    top: orbitTooltip.top,
                    transform: 'translate(-50%, -50%)',
                    ...orbitTooltipChromeVars(orbitTooltip.accentHue),
                  } as CSSProperties
                }
              >
                <span className="deal-track-lab-orbit-tooltip__shine" aria-hidden />
                <div className="deal-track-lab-orbit-tooltip__inner">
                  <span className="deal-track-lab-orbit-tooltip__rail" aria-hidden />
                  <div
                    className={
                      orbitTooltipOnBigDisk
                        ? 'deal-track-lab-orbit-tooltip__text deal-track-lab-orbit-tooltip__text--big-neon'
                        : 'deal-track-lab-orbit-tooltip__text'
                    }
                  >
                    <span className="deal-track-lab-orbit-tooltip__main">
                      {orbitTooltipOnBigDisk
                        ? renderTooltipWords(tipMain, 'deal-track-lab-orbit-tooltip__word-neon-main')
                        : tipMain}
                    </span>
                    {tipSub != null && (
                      <>
                        <span className="deal-track-lab-orbit-tooltip__dot" aria-hidden>
                          {' '}
                          ·{' '}
                        </span>
                        <span className="deal-track-lab-orbit-tooltip__sub">
                          {orbitTooltipOnBigDisk
                            ? renderTooltipWords(tipSub, 'deal-track-lab-orbit-tooltip__word-neon-sub')
                            : tipSub}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })(),
          orbitTooltipPortalTarget,
        )}
    </div>
  );
}
