/**
 * Космогенез Galaxy: 3 игрока, 15 раундов, 20 кристаллов.
 */

import {
  ALL_ELEMENTS,
  ALL_TIERS,
  KID_DEALS_TOTAL,
  KID_PLAYER_COUNT,
  TIER_POWER,
  kidDealHasDominant,
  kidDealKind,
  kidHandSize,
  sameCrystal,
  type Crystal,
  type ElementId,
} from './kidTypes';

function nextLeft(i: number): number {
  return (i + 1) % KID_PLAYER_COUNT;
}

export function playerAtLeftFrom(base: number, steps: number): number {
  let cur = base;
  for (let k = 0; k < steps; k++) cur = nextLeft(cur);
  return cur;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function fullDeck(): Crystal[] {
  const deck: Crystal[] = [];
  for (const element of ALL_ELEMENTS) {
    for (const tier of ALL_TIERS) {
      deck.push({ element, tier });
    }
  }
  return deck;
}

function beats(a: Crystal, b: Crystal, lead: ElementId, dominant: ElementId | null): boolean {
  const aDom = dominant !== null && a.element === dominant;
  const bDom = dominant !== null && b.element === dominant;
  const ap = TIER_POWER[a.tier];
  const bp = TIER_POWER[b.tier];

  if (aDom && !bDom) return true;
  if (!aDom && bDom) return false;
  if (aDom && bDom) return ap > bp;
  if (a.element === lead && b.element !== lead) return true;
  if (a.element !== lead && b.element === lead) return false;
  if (a.element === lead && b.element === lead) return ap > bp;
  return false;
}

function trickWinner(trick: Crystal[], lead: ElementId, dominant: ElementId | null): number {
  let best = 0;
  for (let i = 1; i < trick.length; i++) {
    if (beats(trick[i], trick[best], lead, dominant)) best = i;
  }
  return best;
}

export function isValidKidPlay(
  crystal: Crystal,
  hand: Crystal[],
  trick: Crystal[],
  dominant: ElementId | null
): boolean {
  if (trick.length === 0) return hand.some((c) => sameCrystal(c, crystal));
  const lead = trick[0].element;
  const hasLead = hand.some((c) => c.element === lead);
  const hasDom = dominant !== null && hand.some((c) => c.element === dominant);
  if (hasLead) return crystal.element === lead;
  if (hasDom) return crystal.element === dominant;
  return true;
}

export interface KidPlayer {
  id: string;
  name: string;
  hand: Crystal[];
  bid?: number;
  wellsTaken: number;
  score: number;
}

export type KidPhase = 'bidding' | 'blind-bidding' | 'playing' | 'deal-done' | 'party-done';

export interface KidDealRecord {
  dealNumber: number;
  bids: number[];
  points: number[];
  wells: number[];
}

export interface KidGameState {
  phase: KidPhase;
  players: KidPlayer[];
  dealerIndex: number;
  currentPlayerIndex: number;
  dominant: ElementId | null;
  wellsInDeal: number;
  trick: Crystal[];
  trickLeaderIndex: number;
  bids: (number | null)[];
  dealNumber: number;
  dealHistory: KidDealRecord[];
  pendingTrickDone: boolean;
}

function emptyBids(): (number | null)[] {
  return Array.from({ length: KID_PLAYER_COUNT }, () => null);
}

export function createKidGame(humanName = 'Демиург'): KidGameState {
  const players: KidPlayer[] = [
    { id: 'human', name: humanName.slice(0, 17), hand: [], wellsTaken: 0, score: 0 },
    { id: 'ai1', name: 'Север ✦', hand: [], wellsTaken: 0, score: 0 },
    { id: 'ai2', name: 'Запад ✦', hand: [], wellsTaken: 0, score: 0 },
  ];
  return {
    phase: 'bidding',
    players,
    dealerIndex: Math.floor(Math.random() * KID_PLAYER_COUNT),
    currentPlayerIndex: 0,
    dominant: null,
    wellsInDeal: 1,
    trick: [],
    trickLeaderIndex: 0,
    bids: emptyBids(),
    dealNumber: 1,
    dealHistory: [],
    pendingTrickDone: false,
  };
}

function dealHands(deck: Crystal[], count: number, firstReceiver: number): Crystal[][] {
  const hands: Crystal[][] = Array.from({ length: KID_PLAYER_COUNT }, () => []);
  let idx = firstReceiver;
  for (let i = 0; i < count * KID_PLAYER_COUNT; i++) {
    hands[idx].push(deck[i]);
    idx = nextLeft(idx);
  }
  return hands;
}

function pickDominant(deck: Crystal[], wells: number): ElementId {
  const idx = wells * KID_PLAYER_COUNT;
  return idx < deck.length ? deck[idx].element : deck[deck.length - 1].element;
}

export function startKidDeal(state: KidGameState): KidGameState {
  const kind = kidDealKind(state.dealNumber);
  const wells = kidHandSize(state.dealNumber);
  const firstBidder = nextLeft(state.dealerIndex);

  if (kind === 'blind') {
    return {
      ...state,
      phase: 'blind-bidding',
      players: state.players.map((p) => ({ ...p, hand: [], bid: undefined, wellsTaken: 0 })),
      dominant: null,
      wellsInDeal: wells,
      trick: [],
      trickLeaderIndex: firstBidder,
      currentPlayerIndex: firstBidder,
      bids: emptyBids(),
      pendingTrickDone: false,
    };
  }

  const deck = shuffle(fullDeck());
  const firstReceiver = nextLeft(state.dealerIndex);
  const hands = dealHands(deck, wells, firstReceiver);
  const dominant = kidDealHasDominant(state.dealNumber) ? pickDominant(deck, wells) : null;

  return {
    ...state,
    phase: 'bidding',
    players: state.players.map((p, i) => ({
      ...p,
      hand: hands[i],
      bid: undefined,
      wellsTaken: 0,
    })),
    dominant,
    wellsInDeal: wells,
    trick: [],
    trickLeaderIndex: firstBidder,
    currentPlayerIndex: firstBidder,
    bids: emptyBids(),
    pendingTrickDone: false,
  };
}

function finishBlindDeal(state: KidGameState): KidGameState {
  const wells = state.wellsInDeal;
  const deck = shuffle(fullDeck());
  const firstReceiver = nextLeft(state.dealerIndex);
  const hands = dealHands(deck, wells, firstReceiver);
  const dominant = pickDominant(deck, wells);
  const firstPlayer = nextLeft(state.dealerIndex);

  return {
    ...state,
    phase: 'playing',
    players: state.players.map((p, i) => ({ ...p, hand: hands[i], wellsTaken: 0 })),
    dominant,
    trick: [],
    trickLeaderIndex: firstPlayer,
    currentPlayerIndex: firstPlayer,
  };
}

export function kidPlaceBid(state: KidGameState, playerIndex: number, bid: number): KidGameState {
  const bids = [...state.bids];
  bids[playerIndex] = bid;
  const players = state.players.map((p, i) => (i === playerIndex ? { ...p, bid } : p));

  if (bids.some((b) => b === null)) {
    return { ...state, bids, players, currentPlayerIndex: nextLeft(playerIndex) };
  }

  if (state.phase === 'blind-bidding') {
    return finishBlindDeal({ ...state, bids: bids as number[], players });
  }

  return {
    ...state,
    bids: bids as number[],
    players,
    phase: 'playing',
    currentPlayerIndex: state.trickLeaderIndex,
    trick: [],
  };
}

export function kidPlayCrystal(state: KidGameState, playerIndex: number, crystal: Crystal): KidGameState {
  const hand = state.players[playerIndex].hand;
  if (!isValidKidPlay(crystal, hand, state.trick, state.dominant)) return state;

  const newHand = hand.filter((c) => !sameCrystal(c, crystal));
  const trick = [...state.trick, crystal];
  const players = state.players.map((p, i) =>
    i === playerIndex ? { ...p, hand: newHand } : p
  );

  if (trick.length < KID_PLAYER_COUNT) {
    return {
      ...state,
      players,
      trick,
      currentPlayerIndex: nextLeft(playerIndex),
    };
  }

  const lead = trick[0].element;
  const winOffset = trickWinner(trick, lead, state.dominant);
  const winner = playerAtLeftFrom(state.trickLeaderIndex, winOffset);
  const withWell = players.map((p, i) =>
    i === winner ? { ...p, wellsTaken: p.wellsTaken + 1 } : p
  );

  const allEmpty = withWell.every((p) => p.hand.length === 0);

  return {
    ...state,
    players: withWell,
    trick,
    currentPlayerIndex: winner,
    trickLeaderIndex: winner,
    pendingTrickDone: true,
    phase: allEmpty ? 'deal-done' : 'playing',
  };
}

export function kidCompleteTrickAnim(state: KidGameState): KidGameState {
  if (!state.pendingTrickDone) return state;
  if (state.phase === 'deal-done') {
    return kidFinishDeal({ ...state, trick: [], pendingTrickDone: false });
  }
  return { ...state, trick: [], pendingTrickDone: false };
}

function kidScoreDeal(bid: number, taken: number): number {
  if (bid === taken) return 10;
  if (Math.abs(bid - taken) === 1) return 5;
  return 0;
}

function kidFinishDeal(state: KidGameState): KidGameState {
  const bids = state.bids as number[];
  const points = state.players.map((p, i) => kidScoreDeal(bids[i], p.wellsTaken));
  const players = state.players.map((p, i) => ({ ...p, score: p.score + points[i] }));
  const record: KidDealRecord = {
    dealNumber: state.dealNumber,
    bids: [...bids],
    points: [...points],
    wells: players.map((p) => p.wellsTaken),
  };

  return {
    ...state,
    players,
    dealHistory: [...state.dealHistory, record],
    trick: [],
    pendingTrickDone: false,
    phase: 'deal-done',
  };
}

export function kidNextDeal(state: KidGameState): KidGameState | null {
  if (state.dealNumber >= KID_DEALS_TOTAL) return null;
  return startKidDeal({
    ...state,
    dealNumber: state.dealNumber + 1,
    dealerIndex: nextLeft(state.dealerIndex),
  });
}

export function kidValidPlays(state: KidGameState, playerIndex: number): Crystal[] {
  const hand = state.players[playerIndex].hand;
  return hand.filter((c) => isValidKidPlay(c, hand, state.trick, state.dominant));
}

export function isKidHuman(state: KidGameState, index: number): boolean {
  return state.players[index].id === 'human';
}

export function kidAiBid(state: KidGameState, playerIndex: number): number {
  const hand = state.players[playerIndex].hand;
  const wells = state.wellsInDeal;
  if (state.phase === 'blind-bidding' || hand.length === 0) {
    return Math.min(wells, Math.max(0, Math.floor(Math.random() * (wells + 1))));
  }
  let estimate = 0;
  for (const c of hand) {
    if (TIER_POWER[c.tier] >= 4) estimate += 1;
    else if (TIER_POWER[c.tier] >= 3) estimate += 0.5;
    if (state.dominant && c.element === state.dominant) estimate += 0.4;
  }
  return Math.min(wells, Math.max(0, Math.round(estimate)));
}

export function kidAiPlay(state: KidGameState, playerIndex: number): Crystal | null {
  const valid = kidValidPlays(state, playerIndex);
  if (valid.length === 0) return null;
  const bid = state.bids[playerIndex] as number;
  const taken = state.players[playerIndex].wellsTaken;
  const needMore = taken < bid;
  const sorted = [...valid].sort((a, b) => TIER_POWER[a.tier] - TIER_POWER[b.tier]);
  return needMore ? sorted[sorted.length - 1] : sorted[0];
}

export { KID_DEALS_TOTAL, KID_PLAYER_COUNT };
