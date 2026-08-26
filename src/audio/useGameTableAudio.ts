import { useEffect, useRef } from 'react';
import type { GameState } from '../game/GameEngine';
import {
  playOtherSound,
  playSound,
  stopNudgeSounds,
  YOUR_TURN_NUDGE_IDLE_MS,
  YOUR_TURN_NUDGE_LONG_MS,
  YOUR_TURN_NUDGE_REPEAT_MS,
} from './index';

type Opts = {
  state: GameState | null;
  humanIdx: number;
  isOnline: boolean;
  silenced?: boolean;
  /** Фаза анимации итогов раздачи (улёт в Σ). */
  dealResultsCollectPhase?: string | null;
};

function tricksRemainingInDeal(state: GameState): number {
  const played = state.players.reduce((sum, p) => sum + (p.tricksTaken ?? 0), 0);
  return Math.max(0, state.tricksInDeal - played);
}

function bidOf(state: GameState, i: number): number | null {
  const raw = state.bids[i] ?? state.players[i]?.bid;
  if (raw == null || Number.isNaN(Number(raw))) return null;
  return Number(raw);
}

function tricksOf(state: GameState, i: number): number {
  const n = Number(state.players[i]?.tricksTaken);
  return Number.isFinite(n) ? n : 0;
}

function isUnderPenalize(state: GameState, i: number): boolean {
  const bid = bidOf(state, i);
  if (bid == null) return false;
  const taken = tricksOf(state, i);
  if (taken >= bid) return false;
  return taken + tricksRemainingInDeal(state) < bid;
}

/**
 * События стола по смене state.
 * card_play для Юга — только из клика (playCardPlaySouth), здесь только чужие/боты.
 */
export function useGameTableAudio({
  state,
  humanIdx,
  isOnline,
  silenced,
  dealResultsCollectPhase,
}: Opts): void {
  const prevRef = useRef<GameState | null>(null);
  const underLatchedRef = useRef<boolean[]>([]);
  const nudgeTimersRef = useRef<{ idle?: number; long?: number; repeat?: number }>({});
  const prevDealAnimRef = useRef<string | null>(null);
  /** Сигнатура, чтобы не пропускать события при частых новых ссылках с тем же смыслом. */
  const lastSigRef = useRef<string>('');

  const clearNudge = () => {
    const t = nudgeTimersRef.current;
    if (t.idle != null) window.clearTimeout(t.idle);
    if (t.long != null) window.clearTimeout(t.long);
    if (t.repeat != null) window.clearInterval(t.repeat);
    nudgeTimersRef.current = {};
    /* Глушим уже играющий long/soft — иначе накладывается на карты после хода */
    stopNudgeSounds();
  };

  useEffect(() => {
    if (silenced || !state) {
      clearNudge();
      /* null — после возврата на стол снова сыграть soft, а не молчать до следующего хода */
      prevRef.current = silenced ? null : state;
      lastSigRef.current = '';
      return;
    }

    const prev = prevRef.current;
    const nPlayers = state.players.length;
    const sig = [
      state.dealNumber,
      state.phase,
      state.currentPlayerIndex,
      state.currentTrick?.length ?? 0,
      state.pendingTrickCompletion ? 1 : 0,
      state.players.map((p, i) => `${p.tricksTaken}:${bidOf(state, i) ?? ''}`).join(','),
    ].join('|');

    if (underLatchedRef.current.length !== nPlayers) {
      underLatchedRef.current = Array.from({ length: nPlayers }, () => false);
    }

    if (prev && prev.dealNumber !== state.dealNumber) {
      underLatchedRef.current = Array.from({ length: nPlayers }, () => false);
    }

    /* Пропуск только если сигнатура та же И prev уже есть (частый опрос онлайна). */
    const sameSig = sig === lastSigRef.current && prev != null;

    if (prev && !sameSig) {
      for (let i = 0; i < nPlayers; i++) {
        const pb = bidOf(prev, i);
        const nb = bidOf(state, i);
        if (pb == null && nb != null) {
          /* Юг уже озвучен в handleBid */
          if (i !== humanIdx && !isOnline) playOtherSound('bid_place');
        }
      }

      for (let i = 0; i < nPlayers; i++) {
        const pt = tricksOf(prev, i);
        const nt = tricksOf(state, i);
        if (nt <= pt) continue;
        const bid = bidOf(state, i);
        const isSouth = i === humanIdx;

        /* Взятка чуть после карты; ровно/перебор — отдельной фразой */
        const playOutcome = (soundId: Parameters<typeof playSound>[0], other: boolean) => {
          window.setTimeout(() => {
            if (other) playOtherSound(soundId);
            else playSound(soundId);
          }, 40);
        };

        /* «Взятка взята» — только Юг; чужие взятки без этого слота */
        if (isSouth) playOutcome('trick_won', false);

        if (bid != null) {
          if (pt < bid && nt === bid) {
            window.setTimeout(() => {
              if (isSouth) playSound('exact_south');
              else playOtherSound('exact_other');
            }, 220);
          } else if (pt === bid && nt === bid + 1) {
            window.setTimeout(() => {
              if (isSouth) playSound('over_south');
              else playOtherSound('over_other');
            }, 220);
          }
        }
      }

      const prevLen = prev.currentTrick?.length ?? 0;
      const nextLen = state.currentTrick?.length ?? 0;
      if (nextLen > prevLen && (state.phase === 'playing' || state.phase === 'trick-complete')) {
        const lastIdx =
          state.currentTrick.length > 0
            ? (state.trickLeaderIndex + state.currentTrick.length - 1) % nPlayers
            : -1;
        /* Юг уже озвучен в onClick */
        if (lastIdx !== humanIdx && lastIdx >= 0 && !isOnline) {
          playOtherSound('card_play');
        }
      }

      for (let i = 0; i < nPlayers; i++) {
        const nowUnder = isUnderPenalize(state, i);
        const was = underLatchedRef.current[i];
        if (nowUnder && !was) {
          underLatchedRef.current[i] = true;
          if (i === humanIdx) playSound('under_south');
          else playOtherSound('under_other');
        }
        if (!nowUnder) underLatchedRef.current[i] = false;
      }

      if (state.phase === 'deal-complete' && prev.phase !== 'deal-complete') {
        let southLead = false;
        try {
          const scores = state.players.map((p) => Number(p.score) || 0);
          const max = Math.max(...scores);
          southLead = scores[humanIdx] === max && scores.filter((s) => s === max).length === 1;
        } catch {
          southLead = false;
        }
        playSound(southLead ? 'deal_complete_south' : 'deal_complete');
      }

      if (state.phase === 'game-complete' && prev.phase !== 'game-complete') {
        const scores = state.players.map((p) => Number(p.score) || 0);
        const max = Math.max(...scores);
        playSound(scores[humanIdx] === max ? 'game_win' : 'game_lose');
      }
    }

    const southTurn =
      (state.phase === 'playing' || state.phase === 'bidding' || state.phase === 'dark-bidding') &&
      state.currentPlayerIndex === humanIdx &&
      !state.pendingTrickCompletion;

    const wasSouthTurn =
      !!prev &&
      (prev.phase === 'playing' || prev.phase === 'bidding' || prev.phase === 'dark-bidding') &&
      prev.currentPlayerIndex === humanIdx &&
      !prev.pendingTrickCompletion;

    if (southTurn && !wasSouthTurn) {
      clearNudge();
      playSound('your_turn_soft');
      nudgeTimersRef.current.idle = window.setTimeout(() => {
        playSound('your_turn_nudge_long');
        nudgeTimersRef.current.long = window.setTimeout(() => {
          nudgeTimersRef.current.repeat = window.setInterval(() => {
            playSound('your_turn_nudge_short');
          }, YOUR_TURN_NUDGE_REPEAT_MS);
        }, YOUR_TURN_NUDGE_LONG_MS);
      }, YOUR_TURN_NUDGE_IDLE_MS);
    } else if (!southTurn) {
      clearNudge();
    }

    prevRef.current = state;
    lastSigRef.current = sig;
  }, [state, humanIdx, isOnline, silenced]);

  useEffect(() => {
    if (silenced) {
      prevDealAnimRef.current = dealResultsCollectPhase ?? null;
      return;
    }
    const prev = prevDealAnimRef.current;
    const next = dealResultsCollectPhase ?? null;
    if (next === 'collapsing' && prev !== 'collapsing') {
      playSound('deal_results_fly');
    }
    prevDealAnimRef.current = next;
  }, [dealResultsCollectPhase, silenced]);

  useEffect(() => () => clearNudge(), []);
}
