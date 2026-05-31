/**
 * Элементы «мостика» корабля: декор, кнопки-поды, ссылка на ЛК.
 */

import type { CSSProperties, ReactNode, RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameOverCloudSave } from './CosmicCockpit';

export function GameOverBridgeScenery() {
  return (
    <div className="game-over-bridge__scenery" aria-hidden>
      <div className="game-over-bridge__galaxy" />
      <div className="game-over-bridge__saturn">
        <span className="game-over-bridge__saturn-core" />
        <span className="game-over-bridge__saturn-ring" />
      </div>
      <div className="game-over-bridge__comet" />
      <div className="game-over-bridge__planet game-over-bridge__planet--a" />
      <div className="game-over-bridge__planet game-over-bridge__planet--b" />
      <div className="game-over-bridge__scanlines" />
    </div>
  );
}

export function GameOverCloudStatus({
  cloudSave,
  isOfflineEnd,
  compact,
}: {
  cloudSave: GameOverCloudSave;
  isOfflineEnd: boolean;
  /** Мобильный праздничный экран: одна ссылка под «Подробнее» */
  compact?: boolean;
}) {
  if (compact) {
    if (cloudSave === 'pending') {
      return (
        <p className="game-over-lk-compact game-over-lk-compact--pending" role="status">
          Сохранение…
        </p>
      );
    }
    if (
      cloudSave === 'ok' ||
      cloudSave === 'fail' ||
      cloudSave === 'no-auth' ||
      (isOfflineEnd && cloudSave === 'none')
    ) {
      return (
        <a href="/lk" className="game-over-lk-compact">
          В Личный Кабинет
        </a>
      );
    }
    return null;
  }
  if (cloudSave === 'ok') {
    return (
      <div className="game-over-cloud-status game-over-cloud-status--ok" role="status">
        <span className="game-over-cloud-status__lamp" aria-hidden />
        <span className="game-over-cloud-status__text">
          Сохранено в аккаунт ·{' '}
          <a href="/lk" className="game-over-lk-link">
            личный кабинет
          </a>
        </span>
      </div>
    );
  }
  if (cloudSave === 'pending') {
    return (
      <div className="game-over-cloud-status game-over-cloud-status--pending" role="status">
        <span className="game-over-cloud-status__lamp" aria-hidden />
        <span className="game-over-cloud-status__text">Сохранение в аккаунт…</span>
      </div>
    );
  }
  if (cloudSave === 'fail') {
    return (
      <div className="game-over-cloud-status game-over-cloud-status--fail" role="status">
        <span className="game-over-cloud-status__lamp" aria-hidden />
        <span className="game-over-cloud-status__text">
          Облако недоступно — проверьте вход и{' '}
          <a href="/lk" className="game-over-lk-link">
            личный кабинет
          </a>
        </span>
      </div>
    );
  }
  if (cloudSave === 'no-auth' || (isOfflineEnd && cloudSave === 'none')) {
    return (
      <div className="game-over-cloud-status game-over-cloud-status--hint" role="status">
        <span className="game-over-cloud-status__lamp" aria-hidden />
        <span className="game-over-cloud-status__text">
          История на всех устройствах —{' '}
          <a href="/lk" className="game-over-lk-link">
            личный кабинет
          </a>
          {' '}
          <span className="game-over-cloud-status__sub">(вход в аккаунт, раздел готовится)</span>
        </span>
      </div>
    );
  }
  return null;
}

/** Моб. модалка «Итоги»: есть ли ещё контент ниже (скроллбар скрыт). */
export function useGameOverBridgeScrollMore(
  bodyRef: RefObject<HTMLDivElement | null>,
  active = true,
) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }

    let el = bodyRef.current;
    let ro: ResizeObserver | null = null;
    let raf = 0;

    const sync = () => {
      if (!el) return;
      const overflow = el.scrollHeight - el.clientHeight > 12;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
      const next = overflow && !atBottom;
      setVisible(next);
      el.classList.toggle('game-over-bridge__body--more-below', next);
    };

    const bind = (node: HTMLDivElement) => {
      el = node;
      sync();
      node.addEventListener('scroll', sync, { passive: true });
      ro = new ResizeObserver(sync);
      ro.observe(node);
      const grid = node.querySelector('.game-over-bridge__grid');
      if (grid) ro.observe(grid);
    };

    const unbind = () => {
      if (!el) return;
      el.removeEventListener('scroll', sync);
      el.classList.remove('game-over-bridge__body--more-below');
    };

    if (el) {
      bind(el);
    } else {
      raf = requestAnimationFrame(() => {
        if (bodyRef.current) bind(bodyRef.current);
      });
    }

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      unbind();
    };
  }, [bodyRef, active]);

  return visible;
}

const SCROLL_RAIL_CHEVRON_COUNT = 4;

function GameOverBridgeScrollRail({ side }: { side: 'left' | 'right' }) {
  return (
    <div
      className={`game-over-bridge__scroll-rail game-over-bridge__scroll-rail--${side}`}
      aria-hidden
    >
      {Array.from({ length: SCROLL_RAIL_CHEVRON_COUNT }, (_, i) => (
        <span
          key={i}
          className="game-over-bridge__scroll-rail-chevron"
          style={{ animationDelay: `${i * 0.16}s` }}
        >
          ↓
        </span>
      ))}
    </div>
  );
}

/** Боковые «космические» стрелки прокрутки вниз. */
export function GameOverBridgeScrollRails({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <>
      <GameOverBridgeScrollRail side="left" />
      <GameOverBridgeScrollRail side="right" />
    </>
  );
}

/** Одна боковая колонка со стрелками (для gutter-сетки модалки). */
export function GameOverBridgeScrollGutter({
  side,
  visible,
}: {
  side: 'left' | 'right';
  visible: boolean;
}) {
  if (!visible) return <div className="game-over-bridge__scroll-gutter" aria-hidden />;
  return (
    <div className={`game-over-bridge__scroll-gutter game-over-bridge__scroll-gutter--${side}`}>
      <GameOverBridgeScrollRail side={side} />
    </div>
  );
}

/** Центральная подсказка «Статистика». */
export function GameOverBridgeScrollHint({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div className="game-over-bridge__scroll-hint" aria-hidden>
      <span className="game-over-bridge__scroll-hint-chevron">↓</span>
      <span className="game-over-bridge__scroll-hint-text">Статистика</span>
    </div>
  );
}

export function BridgeDock({
  onExit,
  onOpenTable,
  onNewGame,
  hideNewGame,
}: {
  onExit: () => void;
  onOpenTable: () => void;
  onNewGame?: () => void;
  hideNewGame?: boolean;
}) {
  return (
    <nav className="bridge-dock" aria-label="Управление после партии">
      <button type="button" className="bridge-pod bridge-pod--helm" onClick={onExit}>
        <span className="bridge-pod__shine" aria-hidden />
        <span className="bridge-pod__icon" aria-hidden>
          ◁
        </span>
        <span className="bridge-pod__text">
          <span className="bridge-pod__label">Меню</span>
          <span className="bridge-pod__sublabel">на главную</span>
        </span>
      </button>
      <button type="button" className="bridge-pod bridge-pod--sigma" onClick={onOpenTable} title="Таблица раздач">
        <span className="bridge-pod__shine" aria-hidden />
        <span className="bridge-pod__icon" aria-hidden>
          ▦
        </span>
        <span className="bridge-pod__text">
          <span className="bridge-pod__label">Раздачи</span>
          <span className="bridge-pod__sublabel">таблица</span>
        </span>
      </button>
      {!hideNewGame && onNewGame && (
        <button type="button" className="bridge-pod bridge-pod--launch" onClick={onNewGame}>
          <span className="bridge-pod__shine" aria-hidden />
          <span className="bridge-pod__icon" aria-hidden>
            ▶
          </span>
          <span className="bridge-pod__text">
            <span className="bridge-pod__label">Старт</span>
            <span className="bridge-pod__sublabel">новая партия</span>
          </span>
        </button>
      )}
    </nav>
  );
}

/** Голографический счётчик фишек игрока */
export function BridgeChipReel({
  chips,
  modeLabel,
  compact,
}: {
  chips: number;
  modeLabel: string;
  compact?: boolean;
}) {
  const tone = chips >= 0 ? 'plus' : 'minus';
  return (
    <div
      className={[
        'bridge-chip-reel',
        `bridge-chip-reel--${tone}`,
        compact ? 'bridge-chip-reel--compact' : '',
      ].filter(Boolean).join(' ')}
      aria-label={`Фишки: ${chips}`}
    >
      <span className="bridge-chip-reel__tag">Ваши фишки</span>
      <span className="bridge-chip-reel__value">
        {chips >= 0 ? '+' : ''}
        {chips}
      </span>
      <span
        className={[
          'bridge-chip-reel__mode',
          compact ? 'bridge-chip-reel__mode--active-pick' : '',
        ].filter(Boolean).join(' ')}
      >
        {compact && (
          <span className="bridge-chip-reel__mode-mark" aria-hidden>
            ✓
          </span>
        )}
        <span className="bridge-chip-reel__mode-label">{modeLabel}</span>
      </span>
      <span className="bridge-chip-reel__ticks" aria-hidden />
    </div>
  );
}

export function BridgeViewport({ children }: { children: ReactNode }) {
  return (
    <div className="bridge-viewport">
      <span className="bridge-viewport__corner bridge-viewport__corner--tl" aria-hidden />
      <span className="bridge-viewport__corner bridge-viewport__corner--tr" aria-hidden />
      <span className="bridge-viewport__corner bridge-viewport__corner--bl" aria-hidden />
      <span className="bridge-viewport__corner bridge-viewport__corner--br" aria-hidden />
      <span className="bridge-viewport__scan" aria-hidden />
      <div className="bridge-viewport__glass">{children}</div>
    </div>
  );
}

/** Неоновая палитра по слоту игрока (Юг, Север, …) */
export const BRIDGE_PLAYER_NEON = ['cyan', 'magenta', 'amber', 'lime'] as const;
export type BridgePlayerNeon = (typeof BRIDGE_PLAYER_NEON)[number];

export function bridgePlayerNeonClass(playerIndex: number): string {
  const tone = BRIDGE_PLAYER_NEON[playerIndex] ?? 'violet';
  return `game-over-table__row--neon-${tone}`;
}

function BridgeGauge({
  label,
  value,
  max,
  suffix,
  tone,
  ledOn,
  detail,
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
  tone: 'cyan' | 'magenta' | 'amber' | 'lime' | 'violet';
  ledOn?: boolean;
  /** Пояснение под цифрой */
  detail?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const rot = -90 + (pct / 100) * 270;
  const display = `${value}${suffix ?? ''}`;
  return (
    <div className={`bridge-gauge bridge-gauge--${tone}`} role="group" aria-label={`${label}: ${display}${detail ? `, ${detail}` : ''}`}>
      <span className={`bridge-gauge__led${ledOn ? ' bridge-gauge__led--on' : ''}`} aria-hidden />
      <div
        className="bridge-gauge__dial"
        style={{ '--gauge-pct': pct, '--gauge-rot': `${rot}deg` } as CSSProperties}
      >
        <div className="bridge-gauge__ring" aria-hidden />
        <div className="bridge-gauge__needle" aria-hidden />
      </div>
      <span className="bridge-gauge__readout">{display}</span>
      <span className="bridge-gauge__label">{label}</span>
      {detail ? <span className="bridge-gauge__detail">{detail}</span> : null}
    </div>
  );
}

export function BridgeTelemetryDashboard({
  humanPlace,
  gamesPlayed,
  wins,
  accuracyPct,
  compact,
}: {
  humanPlace: number;
  gamesPlayed: number;
  wins: number;
  accuracyPct: number | null;
  compact?: boolean;
}) {
  const winPct = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0;
  const diodeCount = 5;
  const litDiodes = gamesPlayed > 0 ? Math.min(diodeCount, Math.ceil((wins / gamesPlayed) * diodeCount)) : 0;

  return (
    <div className={['bridge-dash', 'bridge-dash--interactive', compact ? 'bridge-dash--compact' : ''].filter(Boolean).join(' ')}>
      <div className="bridge-dash__header">
        <span className="bridge-dash__header-led bridge-dash__header-led--pulse" aria-hidden />
        <span className="bridge-dash__header-text">{compact ? 'Статистика' : 'Телеметрия борта'}</span>
      </div>
      <div className="bridge-dash__gauges">
        <BridgeGauge
          label="Место"
          value={humanPlace}
          max={4}
          tone="cyan"
          ledOn={humanPlace === 1}
          detail={`${humanPlace} из 4`}
        />
        <BridgeGauge
          label="Побед"
          value={winPct}
          max={100}
          suffix="%"
          tone="magenta"
          ledOn={winPct >= 50}
          detail={`${wins} из ${gamesPlayed}`}
        />
        <BridgeGauge
          label="Игр"
          value={gamesPlayed}
          max={20}
          tone="amber"
          ledOn={gamesPlayed > 0}
          detail="всего партий"
        />
        {accuracyPct != null && (
          <BridgeGauge
            label="Точность"
            value={accuracyPct}
            max={100}
            suffix="%"
            tone="lime"
            ledOn={accuracyPct >= 60}
            detail="средняя по заказам"
          />
        )}
      </div>
      <div className="bridge-dash__strip" aria-label={`Побед: ${wins} из ${gamesPlayed}`}>
        <span className="bridge-dash__strip-label">Индикатор побед</span>
        <div className="bridge-dash__diodes">
          {Array.from({ length: diodeCount }, (_, i) => (
            <span
              key={i}
              className={`bridge-dash__diode${i < litDiodes ? ' bridge-dash__diode--on' : ''}`}
              style={{ animationDelay: `${i * 0.12}s` }}
            />
          ))}
        </div>
        <span className="bridge-dash__strip-value">
          {wins}/{gamesPlayed}
        </span>
      </div>
    </div>
  );
}

export function BridgeAccuracyDeck({
  players,
  bidAccuracyPerPlayer,
  humanIdx,
  bestAccuracy,
  neonByIndex,
  compact,
}: {
  players: { name: string }[];
  bidAccuracyPerPlayer: number[];
  humanIdx: number;
  bestAccuracy: number;
  neonByIndex: (i: number) => BridgePlayerNeon;
  compact?: boolean;
}) {
  const rowOrder = [
    humanIdx,
    ...players.map((_, i) => i).filter((i) => i !== humanIdx),
  ];

  return (
    <div className={['bridge-accuracy', 'bridge-accuracy--interactive', compact ? 'bridge-accuracy--compact' : ''].filter(Boolean).join(' ')}>
      <div className="bridge-dash__header">
        <span className="bridge-dash__header-led" aria-hidden />
        <span className="bridge-dash__header-text">Точность заказов</span>
      </div>
      {rowOrder.map((i) => {
        const p = players[i];
        const pct = bidAccuracyPerPlayer[i];
        const tone = neonByIndex(i);
        const isBest = pct === bestAccuracy && pct > 0;
        return (
          <div
            key={i}
            className={`bridge-accuracy__row bridge-accuracy__row--${tone}${i === humanIdx ? ' bridge-accuracy__row--human' : ''}${isBest ? ' bridge-accuracy__row--peak' : ''}`}
          >
            <span className="bridge-accuracy__led" aria-hidden />
            <span className="bridge-accuracy__name">{p.name}</span>
            <div className="bridge-accuracy__meter" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="bridge-accuracy__fill" style={{ width: `${pct}%` }} />
              <div className="bridge-accuracy__spark" aria-hidden />
            </div>
            <span className="bridge-accuracy__pct">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

/** Праздничный герой — крупные выпуклые заголовки */
function EmbossHeading({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={`game-over-emboss ${className}`}>
      <span className="game-over-emboss__depth" aria-hidden>
        {children}
      </span>
      <span className="game-over-emboss__face">{children}</span>
    </span>
  );
}

function GlassHeading({ className, children }: { className: string; children: ReactNode }) {
  return <span className={['game-over-glass-text', className].filter(Boolean).join(' ')}>{children}</span>;
}

function HeroHeading({
  className,
  children,
  glass,
}: {
  className: string;
  children: ReactNode;
  glass: boolean;
}) {
  return glass ? (
    <GlassHeading className={className}>{children}</GlassHeading>
  ) : (
    <EmbossHeading className={className}>{children}</EmbossHeading>
  );
}

function buildGameOverNameRevealKeyframes(maxPx: number, steps = 80): Keyframe[] {
  const max = Math.round(maxPx);
  const frames: Keyframe[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    const x = Math.round(max * Math.sin(Math.PI * u));
    frames.push({ transform: `translate3d(${-x}px, 0, 0)` });
  }
  return frames;
}

function GameOverTableNameMarquee({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const viewportRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const trackRef = useRef<HTMLSpanElement>(null);
  const animRef = useRef<Animation | null>(null);
  const revealingRef = useRef(false);
  const [overflows, setOverflows] = useState(false);
  const [revealing, setRevealing] = useState(false);

  useEffect(() => {
    const viewport = viewportRef.current;
    const label = labelRef.current;
    if (!viewport || !label) return;
    const check = () => setOverflows(label.scrollWidth > viewport.clientWidth + 2);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(viewport);
    ro.observe(label);
    return () => ro.disconnect();
  }, [name]);

  useEffect(
    () => () => {
      animRef.current?.cancel();
      animRef.current = null;
    },
    [],
  );

  const runReveal = useCallback(() => {
    const viewport = viewportRef.current;
    const label = labelRef.current;
    const track = trackRef.current;
    if (!viewport || !label || !track || revealingRef.current) return;
    const maxScroll = label.scrollWidth - viewport.clientWidth;
    if (maxScroll < 2) return;

    animRef.current?.cancel();
    track.style.transform = '';

    const reduce =
      typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      track.style.transform = `translate3d(${-Math.round(maxScroll)}px, 0, 0)`;
      window.requestAnimationFrame(() => {
        track.style.transform = '';
      });
      return;
    }

    const durationMs = Math.max(2000, Math.min(4200, Math.round(maxScroll * 38)));
    revealingRef.current = true;
    setRevealing(true);
    const anim = track.animate(buildGameOverNameRevealKeyframes(maxScroll), {
      duration: durationMs,
      easing: 'linear',
      fill: 'none',
    });
    animRef.current = anim;
    anim.onfinish = () => {
      track.style.transform = '';
      animRef.current = null;
      revealingRef.current = false;
      setRevealing(false);
    };
  }, [name]);

  const labelClass = ['game-over-name-marquee__label', className].filter(Boolean).join(' ');
  const tapHint = overflows ? `${name} — нажмите, чтобы прокрутить` : name;

  return (
    <span
      className={[
        'game-over-name-marquee',
        overflows ? 'game-over-name-marquee--tappable' : '',
        revealing ? 'game-over-name-marquee--revealing' : '',
      ].filter(Boolean).join(' ')}
      title={tapHint}
      role={overflows ? 'button' : undefined}
      tabIndex={overflows ? 0 : undefined}
      aria-label={overflows ? tapHint : undefined}
      onClick={
        overflows
          ? (e) => {
              e.stopPropagation();
              runReveal();
            }
          : undefined
      }
      onKeyDown={
        overflows
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                runReveal();
              }
            }
          : undefined
      }
    >
      <span className="game-over-name-marquee__viewport" ref={viewportRef}>
        <span className="game-over-name-marquee__track" ref={trackRef}>
          <span className={labelClass} ref={labelRef}>
            {name}
          </span>
        </span>
      </span>
    </span>
  );
}

function celebrationMiniNameClass(tier: number, leaderIridescent: boolean): string {
  return [
    'game-over-celebration-mini__name',
    tier === 0 && leaderIridescent ? 'cosmic-iridescent-text' : '',
  ].filter(Boolean).join(' ');
}

const CELEBRATION_MINI_RESULT_NUM = 'game-over-celebration-mini__result-num';

function CelebrationMiniResultNum({ children }: { children: ReactNode }) {
  return <span className={CELEBRATION_MINI_RESULT_NUM}>{children}</span>;
}

function CelebrationMiniRow({
  p,
  place,
  tier,
  humanIdx,
  showChips,
  nameMarquee,
  leaderIridescent,
  plainNameWrap,
}: {
  p: { idx: number; name: string; score: number; chips: number };
  place: number;
  tier: number;
  humanIdx: number;
  showChips: boolean;
  nameMarquee?: boolean;
  leaderIridescent?: boolean;
  /** Без рамки/фона у обёртки имени (модалка «Итоги») */
  plainNameWrap?: boolean;
}) {
  const nameClass = celebrationMiniNameClass(tier, !!leaderIridescent);
  return (
    <tr
      className={[
        'game-over-celebration-mini__row',
        `game-over-celebration-mini__row--tier${Math.min(tier, 3)}`,
        bridgePlayerNeonClass(p.idx),
        p.idx === humanIdx ? 'game-over-celebration-mini__row--human' : '',
        tier === 0 ? 'game-over-celebration-mini__row--leader' : '',
      ].filter(Boolean).join(' ')}
    >
      <td className="game-over-celebration-mini__place">
        <CelebrationMiniResultNum>{place}</CelebrationMiniResultNum>
      </td>
      <td className="game-over-celebration-mini__name-cell">
        <span
          className={[
            'game-over-celebration-mini__name-wrap',
            tier === 0 ? 'game-over-celebration-mini__name-wrap--leader' : '',
            !plainNameWrap && p.idx === humanIdx ? 'game-over-celebration-mini__name-wrap--human' : '',
          ].filter(Boolean).join(' ')}
        >
          {nameMarquee ? (
            <GameOverTableNameMarquee name={p.name} className={nameClass} />
          ) : (
            <span className={nameClass} title={p.name}>
              {p.name}
            </span>
          )}
        </span>
      </td>
      <td className="game-over-celebration-mini__score">
        <CelebrationMiniResultNum>
          {p.score >= 0 ? '+' : ''}
          {p.score}
        </CelebrationMiniResultNum>
      </td>
      {showChips && (
        <td
          className={`game-over-celebration-mini__chips${p.chips >= 0 ? ' game-over-num--plus' : p.chips < 0 ? ' game-over-num--minus' : ''}`}
        >
          <CelebrationMiniResultNum>
            {p.chips >= 0 ? '+' : ''}
            {p.chips}
          </CelebrationMiniResultNum>
        </td>
      )}
    </tr>
  );
}

/** Компактная таблица итогов на мобильном праздничном экране */
export function GameOverCelebrationMiniTable({
  rows,
  humanIdx,
  showChips,
  tone = 'celebration',
  nameMarquee = false,
}: {
  rows: { idx: number; name: string; score: number; chips: number }[];
  humanIdx: number;
  showChips: boolean;
  /** Праздничное золото (экран 1) или неон мостика (экран «Итоги») */
  tone?: 'celebration' | 'bridge';
  /** Бегущая строка для длинных имён */
  nameMarquee?: boolean;
}) {
  const topScore = rows[0]?.score ?? 0;
  const winners = rows.filter((r) => r.score === topScore);
  const rest = rows.filter((r) => r.score < topScore);
  const colCount = showChips ? 4 : 3;
  const leaderIridescent = tone === 'bridge';
  const plainNameWrap = tone === 'bridge';
  const winnerNameClass = [
    'game-over-celebration-mini__winner-pane-name',
    leaderIridescent ? 'cosmic-iridescent-text' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={[
        'game-over-celebration-mini',
        tone === 'bridge' ? 'game-over-celebration-mini--bridge-tone' : '',
      ].filter(Boolean).join(' ')}
    >
      <table className="game-over-celebration-mini__table">
        <thead>
          <tr>
            <th>#</th>
            <th>Игрок</th>
            <th>Очки</th>
            {showChips && <th>Фишки</th>}
          </tr>
        </thead>
        <tbody>
          {winners.length === 1 ? (
            <CelebrationMiniRow
              p={winners[0]}
              place={1}
              tier={0}
              humanIdx={humanIdx}
              showChips={showChips}
              nameMarquee={nameMarquee}
              leaderIridescent={leaderIridescent}
              plainNameWrap={plainNameWrap}
            />
          ) : (
            <tr className="game-over-celebration-mini__row game-over-celebration-mini__row--tier0 game-over-celebration-mini__row--winners-split">
              <td colSpan={colCount}>
                <div
                  className={`game-over-celebration-mini__winners-split game-over-celebration-mini__winners-split--${winners.length}`}
                >
                  {winners.map((w) => (
                    <div
                      key={w.idx}
                      className={[
                        'game-over-celebration-mini__winner-pane',
                        bridgePlayerNeonClass(w.idx),
                        w.idx === humanIdx ? 'game-over-celebration-mini__winner-pane--human' : '',
                      ].filter(Boolean).join(' ')}
                    >
                      <span className="game-over-celebration-mini__winner-pane-rank">
                        <CelebrationMiniResultNum>1</CelebrationMiniResultNum>
                      </span>
                      <span
                        className={[
                          'game-over-celebration-mini__winner-pane-name-wrap',
                          'game-over-celebration-mini__name-wrap--leader',
                          !plainNameWrap && w.idx === humanIdx ? 'game-over-celebration-mini__name-wrap--human' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        {nameMarquee ? (
                          <GameOverTableNameMarquee name={w.name} className={winnerNameClass} />
                        ) : (
                          <span className={winnerNameClass} title={w.name}>
                            {w.name}
                          </span>
                        )}
                      </span>
                      <span className="game-over-celebration-mini__winner-pane-score">
                        <CelebrationMiniResultNum>
                          {w.score >= 0 ? '+' : ''}
                          {w.score}
                        </CelebrationMiniResultNum>
                      </span>
                      {showChips && (
                        <span
                          className={`game-over-celebration-mini__winner-pane-chips${w.chips >= 0 ? ' game-over-num--plus' : w.chips < 0 ? ' game-over-num--minus' : ''}`}
                        >
                          <CelebrationMiniResultNum>
                            {w.chips >= 0 ? '+' : ''}
                            {w.chips}
                          </CelebrationMiniResultNum>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </td>
            </tr>
          )}
          {rest.map((p, i) => {
            const place = winners.length + 1 + i;
            return (
              <CelebrationMiniRow
                key={p.idx}
                p={p}
                place={place}
                tier={i + 1}
                humanIdx={humanIdx}
                showChips={showChips}
                nameMarquee={nameMarquee}
                leaderIridescent={leaderIridescent}
                plainNameWrap={plainNameWrap}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function GameOverCelebrationHero({
  isTie,
  winnerNames,
  winnerName,
  isHumanWinner,
  compact,
  minimal,
  hideKicker,
  winnerStar,
}: {
  isTie: boolean;
  winnerNames?: string;
  winnerName?: string;
  isHumanWinner?: boolean;
  /** Уменьшенный вариант для экрана «Итоги партии» */
  compact?: boolean;
  /** Только строка победителя (узкий экран итогов) */
  minimal?: boolean;
  /** Скрыть «Сеанс завершён» (мобильный праздничный экран) */
  hideKicker?: boolean;
  /** Звёздочка перед именем победителя */
  winnerStar?: boolean;
}) {
  const displayName = isTie ? winnerNames : winnerName;
  const glass = !compact;
  return (
    <header
      className={[
        'game-over-hero',
        compact ? 'game-over-hero--compact' : '',
        minimal ? 'game-over-hero--minimal' : '',
        glass ? 'game-over-hero--glass' : '',
      ].filter(Boolean).join(' ')}
    >
      {!minimal && !hideKicker && <p className="game-over-hero__kicker">Сеанс завершён</p>}
      {!minimal && (
        <h2 className="game-over-hero__title">
          <HeroHeading glass={glass} className="game-over-hero__title-text">
            Партия завершена
          </HeroHeading>
        </h2>
      )}
      {isTie ? (
        <p className="game-over-hero__winner game-over-hero__winner--tie">
          {!minimal && <span className="game-over-hero__winner-label">Ничья</span>}
          <span className="game-over-hero__winner-name" title={displayName}>
            <HeroHeading glass={glass} className="game-over-hero__winner-name-text">
              {displayName}
            </HeroHeading>
          </span>
        </p>
      ) : (
        <p className="game-over-hero__winner">
          <span className="game-over-hero__winner-label">Победитель</span>
          <span className="game-over-hero__winner-name" title={winnerName}>
            <span className="game-over-hero__winner-name-frame">
              <span className="game-over-hero__winner-name-frame-glow" aria-hidden />
              {winnerStar && (
                <span className="game-over-hero__winner-star" aria-hidden>
                  ✦
                </span>
              )}
              <span className="game-over-hero__winner-name-text-wrap">
                <HeroHeading glass={glass} className="game-over-hero__winner-name-text">
                  {winnerName ?? ''}
                </HeroHeading>
              </span>
            </span>
          </span>
          {isHumanWinner && (
            <span className={`game-over-hero__super${glass ? ' game-over-hero__super--crystal' : ''}`}>Супер!</span>
          )}
        </p>
      )}
    </header>
  );
}
