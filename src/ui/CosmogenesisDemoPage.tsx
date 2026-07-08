/**
 * Космогенез Galaxy — 3 игрока, 15 раундов, glass/neon UI.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KID_DEALS_TOTAL,
  createKidGame,
  isKidHuman,
  kidAiBid,
  kidAiPlay,
  kidCompleteTrickAnim,
  kidNextDeal,
  kidPlaceBid,
  kidPlayCrystal,
  kidValidPlays,
  playerAtLeftFrom,
  startKidDeal,
  type KidGameState,
} from '../cosmogenesis/kidEngine';
import {
  crystalKey,
  kidDealKind,
  kidShardsForExactDeal,
  sameCrystal,
  type Crystal,
  type ElementId,
} from '../cosmogenesis/kidTypes';
import {
  CONSTELLATIONS,
  LEGEND_DISMISSED_KEY,
  PLAYER_NEON,
  crystalToQuantum,
  dealPhaseLabel,
  loadMetaProgress,
  saveMetaProgress,
  ELEMENTS,
  type MetaProgress,
} from '../cosmogenesis/theme';
import {
  BidChoice,
  ChaosHintCard,
  DealProgressStrip,
  ElementShowcaseRow,
  FirstRoundLegend,
  FlyingCrystal,
  QuantumCrystal,
  ScoreGems,
  ShardStars,
  WellCounter,
  ElementIcon,
} from './cosmogenesis/CosmoVisuals';
import './cosmogenesis-demo.css';

const PLAYER_SLOTS = [
  { key: 's', index: 0 },
  { key: 'w', index: 1 },
  { key: 'n', index: 2 },
] as const;

const TRICK_SLOT_CLASS: Record<string, string> = {
  n: 'cosmo-demo__trick-slot--n',
  w: 'cosmo-demo__trick-slot--w',
  s: 'cosmo-demo__trick-slot--s',
};

const TAG_CLASS: Record<string, string> = {
  n: 'cosmo-demo__player-tag--n',
  w: 'cosmo-demo__player-tag--w',
  s: 'cosmo-demo__player-tag--s',
};

function slotKeyForPlayer(playerIndex: number): string {
  return PLAYER_SLOTS.find((s) => s.index === playerIndex)?.key ?? 's';
}

function CrystalView({
  crystal,
  dominant,
  onClick,
  playable,
  compact,
}: {
  crystal: Crystal;
  dominant: ElementId | null;
  onClick?: () => void;
  playable?: boolean;
  compact?: boolean;
}) {
  const q = crystalToQuantum(crystal, dominant);
  return (
    <QuantumCrystal
      meta={q.meta}
      power={q.power}
      tierLabel={q.tierLabel}
      isChaos={q.isChaos}
      onClick={onClick}
      playable={playable}
      compact={compact}
      strongTier={q.power >= 3}
    />
  );
}

interface CosmogenesisDemoPageProps {
  onBack: () => void;
}

export function CosmogenesisDemoPage({ onBack }: CosmogenesisDemoPageProps) {
  const [screen, setScreen] = useState<'intro' | 'play' | 'party-over'>('intro');
  const [game, setGame] = useState<KidGameState | null>(null);
  const [meta, setMeta] = useState<MetaProgress>(() => loadMetaProgress());
  const [toast, setToast] = useState<string | null>(null);
  const [partyShards, setPartyShards] = useState(0);
  const [showLegend, setShowLegend] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem(LEGEND_DISMISSED_KEY) !== '1'
  );
  const [flyAnim, setFlyAnim] = useState<{
    crystal: Crystal;
    from: string;
    dominant: ElementId | null;
    key: number;
  } | null>(null);
  const [pendingCrystal, setPendingCrystal] = useState<Crystal | null>(null);
  const [flyingHideIndex, setFlyingHideIndex] = useState<number | null>(null);
  const [wellCatch, setWellCatch] = useState(false);
  const aiBusy = useRef(false);
  const partyMetaSaved = useRef(false);
  const prevTrickLen = useRef(0);
  const playLock = useRef(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  const dismissLegend = useCallback(() => {
    setShowLegend(false);
    if (typeof window !== 'undefined') localStorage.setItem(LEGEND_DISMISSED_KEY, '1');
  }, []);

  const triggerFly = useCallback((crystal: Crystal, from: string, dominant: ElementId | null) => {
    setWellCatch(true);
    setFlyAnim({ crystal, from, dominant, key: Date.now() });
    window.setTimeout(() => setWellCatch(false), 420);
    window.setTimeout(() => {
      setFlyAnim(null);
      setFlyingHideIndex(null);
    }, 580);
  }, []);

  const beginParty = useCallback(() => {
    partyMetaSaved.current = false;
    prevTrickLen.current = 0;
    setPendingCrystal(null);
    setFlyAnim(null);
    setGame(startKidDeal(createKidGame()));
    setPartyShards(0);
    setScreen('play');
  }, []);

  const advanceAfterDeal = useCallback(() => {
    setGame((prev) => {
      if (!prev) return prev;
      const next = kidNextDeal(prev);
      return next ?? prev;
    });
  }, []);

  const humanBid = useCallback((bid: number) => {
    setGame((prev) => (prev ? kidPlaceBid(prev, 0, bid) : prev));
  }, []);

  const applyPlay = useCallback((crystal: Crystal) => {
    setGame((prev) => (prev ? kidPlayCrystal(prev, 0, crystal) : prev));
  }, []);

  const humanPlayWithFly = useCallback(
    (crystal: Crystal) => {
      if (!game || playLock.current || pendingCrystal) return;
      if (game.currentPlayerIndex !== 0 || game.phase !== 'playing') return;
      if (!kidValidPlays(game, 0).some((c) => sameCrystal(c, crystal))) return;

      playLock.current = true;
      setPendingCrystal(crystal);
      triggerFly(crystal, 's', game.dominant);
      window.setTimeout(() => {
        applyPlay(crystal);
        setPendingCrystal(null);
        playLock.current = false;
      }, 560);
    },
    [game, applyPlay, pendingCrystal, triggerFly]
  );

  useEffect(() => {
    if (!game || screen !== 'play') return;
    if (aiBusy.current) return;

    const runAi = async () => {
      if (!game || isKidHuman(game, game.currentPlayerIndex)) return;
      aiBusy.current = true;
      await new Promise((r) => setTimeout(r, 480));

      setGame((prev) => {
        if (!prev) return prev;
        const pi = prev.currentPlayerIndex;
        if (isKidHuman(prev, pi)) return prev;

        if (prev.phase === 'bidding' || prev.phase === 'blind-bidding') {
          return kidPlaceBid(prev, pi, kidAiBid(prev, pi));
        }
        if (prev.phase === 'playing' && !prev.pendingTrickDone) {
          const c = kidAiPlay(prev, pi);
          return c ? kidPlayCrystal(prev, pi, c) : prev;
        }
        return prev;
      });

      aiBusy.current = false;
    };

    void runAi();
  }, [game, screen]);

  useEffect(() => {
    prevTrickLen.current = 0;
    setFlyingHideIndex(null);
  }, [game?.dealNumber]);

  useEffect(() => {
    if (!game || game.phase !== 'playing') {
      prevTrickLen.current = game?.trick.length ?? 0;
      return;
    }
    const len = game.trick.length;
    if (len < prevTrickLen.current) {
      prevTrickLen.current = len;
      return;
    }
    if (len > prevTrickLen.current && len > 0) {
      const crystal = game.trick[len - 1];
      const pi = playerAtLeftFrom(game.trickLeaderIndex, len - 1);
      if (!isKidHuman(game, pi)) {
        setFlyingHideIndex(len - 1);
        triggerFly(crystal, slotKeyForPlayer(pi), game.dominant);
      }
    }
    prevTrickLen.current = len;
  }, [game, game?.trick, game?.phase, triggerFly]);

  useEffect(() => {
    if (!game?.pendingTrickDone) return;
    const t = window.setTimeout(() => {
      setGame((prev) => (prev ? kidCompleteTrickAnim(prev) : prev));
    }, 900);
    return () => window.clearTimeout(t);
  }, [game?.pendingTrickDone]);

  useEffect(() => {
    if (!game || game.phase !== 'deal-done') return;

    const human = game.players[0];
    const bid = game.bids[0] as number;
    if (human.wellsTaken === bid) {
      const shards = kidShardsForExactDeal(game.dealNumber);
      setPartyShards((s) => s + shards);
      showToast(
        shards === 2 ? 'Точный заказ! Двойной осколок ✦✦' : 'Точный заказ! Новый осколок ✦'
      );
    }

    const dealNum = game.dealNumber;
    const t = window.setTimeout(() => {
      if (dealNum >= KID_DEALS_TOTAL) {
        setScreen('party-over');
      } else {
        advanceAfterDeal();
      }
    }, 1600);

    return () => window.clearTimeout(t);
  }, [game?.phase, game?.dealNumber, advanceAfterDeal, showToast]);

  useEffect(() => {
    if (screen !== 'party-over' || !game || partyMetaSaved.current) return;
    partyMetaSaved.current = true;
    const earned = game.dealHistory.reduce(
      (sum, d) => (d.bids[0] === d.wells[0] ? sum + kidShardsForExactDeal(d.dealNumber) : sum),
      0
    );
    setPartyShards(earned);
    setMeta((m) => {
      const updated: MetaProgress = {
        shards: m.shards + earned,
        unlocked: [...m.unlocked],
        partiesPlayed: m.partiesPlayed + 1,
      };
      for (const c of CONSTELLATIONS) {
        if (updated.shards >= c.cost && !updated.unlocked.includes(c.id)) {
          updated.unlocked.push(c.id);
        }
      }
      saveMetaProgress(updated);
      return updated;
    });
  }, [screen, game]);

  const validPlays = useMemo(() => {
    if (!game || game.currentPlayerIndex !== 0 || game.phase !== 'playing') return [];
    return kidValidPlays(game, 0);
  }, [game]);

  const leadElement = game?.trick[0]?.element ?? null;
  const wellLeadClass = leadElement ? ` cosmo-demo__well--lead-${leadElement === 'air' ? 'air' : leadElement}` : '';
  const dealKind = game ? kidDealKind(game.dealNumber) : 'normal';

  if (screen === 'intro') {
    return (
      <div className="cosmo-demo">
        <div className="cosmo-demo__intro">
          <button type="button" className="cosmo-demo__btn" onClick={onBack}>
            ← Назад
          </button>
          <h1 className="cosmo-demo__title cosmo-demo__title--hero">Космогенез: Galaxy</h1>
          <span className="cosmo-demo__badge" style={{ display: 'inline-block', marginTop: 10 }}>
            15 раундов · 3 игрока · 5 сил
          </span>

          <div className="cosmo-demo__intro-visual">
            <ElementShowcaseRow />
            <ChaosHintCard />
          </div>

          <p style={{ marginTop: 12 }}>
            Четыре стихии — <strong className="cosmo-neon-text--coral">Пламя</strong>,{' '}
            <strong className="cosmo-neon-text--cyan">Волна</strong>,{' '}
            <strong className="cosmo-neon-text--lime">Камень</strong>,{' '}
            <strong className="cosmo-neon-text--violet">Плазма</strong>. У каждого кристалла{' '}
            <strong className="cosmo-neon-text--amber">до пяти огоньков</strong>: два слабых, три суперсильных.
          </p>
          <p>
            Трое за столом: <strong className="cosmo-neon-text--cyan">вы</strong>,{' '}
            <strong className="cosmo-neon-text--pink">Север</strong> и{' '}
            <strong className="cosmo-neon-text--lime">Запад</strong>. Заказываешь колодцы, бросаешь кристаллы в
            центр. Угадал — <strong className="cosmo-neon-text--amber">осколок</strong> и звёзды. Промах — просто
            ноль, без наказания.
          </p>
          <p className="cosmo-demo__intro-special">
            Особые раунды: <strong className="cosmo-neon-text--violet">День без Хаоса</strong> (без главной стихии) и{' '}
            <strong className="cosmo-neon-text--amber">Двойной осколок</strong> (×2 за точный заказ).
          </p>
          <p className="cosmo-neon-text--lime" style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <ShardStars count={meta.shards} max={16} />
            <span>накоплено</span>
          </p>
          <div className="cosmo-demo__actions" style={{ justifyContent: 'center', marginTop: 24 }}>
            <button type="button" className="cosmo-demo__btn cosmo-demo__btn--primary" onClick={beginParty}>
              Начать турнир ✦
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'party-over' && game) {
    const winner = [...game.players].sort((a, b) => b.score - a.score)[0];
    const winnerIndex = game.players.indexOf(winner);
    return (
      <div className="cosmo-demo">
        <div className="cosmo-demo__intro">
          <h2 className="cosmo-demo__title">Турнир завершён ✦</h2>
          <p className="cosmo-neon-text--pink" style={{ fontSize: '1.05rem' }}>
            Победитель: {winnerIndex === 0 ? 'Вы' : winner.name}
          </p>
          <p style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <ScoreGems score={winner.score} color={PLAYER_NEON[winnerIndex]} />
          </p>
          <p className="cosmo-neon-text--amber" style={{ marginTop: 12 }}>
            Осколки за партию: <ShardStars count={partyShards} />
          </p>
          <div className="cosmo-demo__actions" style={{ justifyContent: 'center', marginTop: 20 }}>
            <button type="button" className="cosmo-demo__btn cosmo-demo__btn--primary" onClick={beginParty}>
              Ещё турнир ✦
            </button>
            <button type="button" className="cosmo-demo__btn" onClick={onBack}>
              В меню
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!game) return null;

  const isBidding = game.phase === 'bidding' || game.phase === 'blind-bidding';
  const humanTurnBid = isBidding && game.currentPlayerIndex === 0 && game.bids[0] === null;
  const hideHand = game.phase === 'blind-bidding';
  const dominantMeta = game.dominant ? ELEMENTS[game.dominant] : null;

  return (
    <div className="cosmo-demo">
      <header className="cosmo-demo__hud">
        <button type="button" className="cosmo-demo__btn cosmo-demo__btn--icon" onClick={onBack} aria-label="Назад">
          ←
        </button>
        <div className="cosmo-demo__hud-center">
          <h1 className="cosmo-demo__title">Galaxy</h1>
          <DealProgressStrip current={game.dealNumber} total={KID_DEALS_TOTAL} />
        </div>
        <span className="cosmo-demo__badge cosmo-neon-text--violet">{dealPhaseLabel(game.dealNumber)}</span>
      </header>

      <div className="cosmo-demo__layout">
        <section className="cosmo-demo__arena">
          {game.dealNumber === 1 && showLegend && <FirstRoundLegend onDismiss={dismissLegend} />}

          <div className="cosmo-demo__status">
            {dominantMeta ? (
              <span className="cosmo-demo__status-chip cosmo-demo__status-chip--trump">
                <span className="cosmo-demo__dominant">
                  <ElementIcon meta={dominantMeta} />
                  <span style={{ color: dominantMeta.accent }}>Главная — {dominantMeta.shortLabel}</span>
                </span>
              </span>
            ) : (
              <span className="cosmo-demo__status-chip cosmo-demo__status-chip--void">
                {dealKind === 'void-day' ? 'День без Хаоса ✦' : 'Без главной стихии'}
              </span>
            )}
            <span className="cosmo-demo__status-chip">
              Колодцев: <WellCounter count={game.wellsInDeal} color="#67e8f9" />
            </span>
            {dealKind === 'double-shard' && (
              <span className="cosmo-demo__status-chip cosmo-demo__status-chip--bonus">
                ×2 осколок за точный заказ
              </span>
            )}
          </div>

          <div className="cosmo-demo__table">
            <div className="cosmo-demo__stars" aria-hidden />
            <div className={`cosmo-demo__well${wellCatch ? ' cosmo-demo__well--catch' : ''}${wellLeadClass}`} aria-hidden>
              <div className="cosmo-demo__well-ring" />
              <div className="cosmo-demo__well-ring cosmo-demo__well-ring--b" />
              <div className="cosmo-demo__well-core" />
            </div>
            <div className="cosmo-demo__well-label">Колодец</div>

            {flyAnim && (() => {
              const q = crystalToQuantum(flyAnim.crystal, flyAnim.dominant);
              return (
                <FlyingCrystal
                  key={flyAnim.key}
                  meta={q.meta}
                  power={q.power}
                  tierLabel={q.tierLabel}
                  isChaos={q.isChaos}
                  from={flyAnim.from}
                />
              );
            })()}

            {PLAYER_SLOTS.map(({ key, index }) => {
              const p = game.players[index];
              const bid = game.bids[index];
              const color = PLAYER_NEON[index];
              return (
                <div
                  key={key}
                  className={`cosmo-demo__player-tag ${TAG_CLASS[key]}`}
                  style={{ '--pt-color': color } as React.CSSProperties}
                >
                  <div className="cosmo-demo__player-name">{index === 0 ? 'Вы ✦' : p.name}</div>
                  <div className="cosmo-demo__player-bid">
                    {bid !== null ? (
                      <>заказ: <WellCounter count={bid} color="#e879f9" /></>
                    ) : isBidding ? (
                      'думает…'
                    ) : null}
                  </div>
                  {!isBidding && (
                    <div className="cosmo-demo__player-taken">
                      <WellCounter count={p.wellsTaken} color={color} />
                    </div>
                  )}
                  <div style={{ marginTop: 4 }}>
                    <ScoreGems score={p.score} color={color} />
                  </div>
                </div>
              );
            })}

            {game.trick.map((crystal, i) => {
              if (flyingHideIndex === i) return null;
              const pi = playerAtLeftFrom(game.trickLeaderIndex, i);
              const slot = slotKeyForPlayer(pi);
              return (
                <div key={`${crystalKey(crystal)}-${i}`} className={`cosmo-demo__trick-slot ${TRICK_SLOT_CLASS[slot]}`}>
                  <CrystalView crystal={crystal} dominant={game.dominant} compact />
                </div>
              );
            })}
          </div>

          {humanTurnBid && (
            <div className="cosmo-demo__bid-panel">
              <div className="cosmo-demo__bid-title">
                {hideHand ? '✦ Слепой заказ — выбери вслепую' : '✦ Сколько колодцев осилишь?'}
              </div>
              <div className="cosmo-demo__bid-row">
                {Array.from({ length: game.wellsInDeal + 1 }, (_, n) => (
                  <BidChoice key={n} n={n} onClick={() => humanBid(n)} />
                ))}
              </div>
            </div>
          )}

          {!hideHand && (
            <div className="cosmo-demo__hand">
              <div className="cosmo-demo__hand-hint">
                {game.phase === 'playing' && game.currentPlayerIndex === 0
                  ? '✦ Твой ход — тапни по кристаллу'
                  : '✦ Твои кристаллы'}
              </div>
              <div className="cosmo-demo__hand-row">
                {[...game.players[0].hand]
                  .filter((c) => !pendingCrystal || !sameCrystal(c, pendingCrystal))
                  .sort((a, b) => {
                    const qa = crystalToQuantum(a, game.dominant);
                    const qb = crystalToQuantum(b, game.dominant);
                    if (qa.element !== qb.element) return qa.element.localeCompare(qb.element);
                    return qa.power - qb.power;
                  })
                  .map((crystal) => {
                    const canPlay =
                      game.phase === 'playing' &&
                      game.currentPlayerIndex === 0 &&
                      !game.pendingTrickDone &&
                      validPlays.some((c) => sameCrystal(c, crystal));
                    return (
                      <CrystalView
                        key={crystalKey(crystal)}
                        crystal={crystal}
                        dominant={game.dominant}
                        playable={canPlay}
                        onClick={canPlay ? () => humanPlayWithFly(crystal) : undefined}
                      />
                    );
                  })}
              </div>
            </div>
          )}

          {game.phase === 'deal-done' && (
            <p className="cosmo-demo__phase-msg">Раунд завершён — космос перестраивается…</p>
          )}
        </section>

        <aside className="cosmo-demo__sidebar">
          <div className="cosmo-demo__glass-card">
            <div className="cosmo-demo__glass-section">
              <span className="cosmo-demo__glass-label">Осколки</span>
              <ShardStars count={partyShards} />
            </div>
            <div className="cosmo-demo__glass-section cosmo-demo__glass-section--rules">
              <span className="cosmo-demo__glass-label">Очки</span>
              <span className="cosmo-demo__glass-rules">10 · 5 · 0</span>
            </div>
            <div className="cosmo-demo__glass-section cosmo-demo__glass-section--scores">
              {game.players.map((p, i) => (
                <div key={p.id} className={`cosmo-demo__score-row${i === 0 ? ' cosmo-demo__score-row--you' : ''}`}>
                  <span className="cosmo-demo__score-name">{i === 0 ? 'Вы' : p.name.replace(' ✦', '')}</span>
                  <ScoreGems score={p.score} color={PLAYER_NEON[i]} />
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {toast && (
        <div className="cosmo-demo__toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
