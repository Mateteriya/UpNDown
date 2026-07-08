/**
 * Визуальные метаданные квантов — без «сухих» цифр в UI.
 */

import type { Card, Suit } from '../game/types';
import { TIER_POWER, type Crystal, type ElementId } from './kidTypes';

export type { ElementId };

export const POWER_MAX = 5;

export interface ElementMeta {
  id: ElementId;
  label: string;
  shortLabel: string;
  color: string;
  glow: string;
  accent: string;
  iconClass: string;
}

export const ELEMENTS: Record<ElementId, ElementMeta> = {
  fire: {
    id: 'fire',
    label: 'Огонь',
    shortLabel: 'Пламя',
    color: '#ff6b2b',
    glow: 'rgba(255, 107, 43, 0.75)',
    accent: '#ffb347',
    iconClass: 'cosmo-icon--fire',
  },
  water: {
    id: 'water',
    label: 'Вода',
    shortLabel: 'Волна',
    color: '#00d4ff',
    glow: 'rgba(0, 212, 255, 0.7)',
    accent: '#7df9ff',
    iconClass: 'cosmo-icon--water',
  },
  earth: {
    id: 'earth',
    label: 'Земля',
    shortLabel: 'Камень',
    color: '#b8ff3c',
    glow: 'rgba(184, 255, 60, 0.65)',
    accent: '#eaff8f',
    iconClass: 'cosmo-icon--earth',
  },
  air: {
    id: 'air',
    label: 'Плазма',
    shortLabel: 'Плазма',
    color: '#d946ef',
    glow: 'rgba(217, 70, 239, 0.7)',
    accent: '#f0abfc',
    iconClass: 'cosmo-icon--air',
  },
};

export const ELEMENT_SHOWCASE: { id: ElementId; power: number; tierLabel: string }[] = [
  { id: 'fire', power: 5, tierLabel: 'Сверхновая' },
  { id: 'water', power: 2, tierLabel: 'Жар' },
  { id: 'earth', power: 4, tierLabel: 'Комета' },
  { id: 'air', power: 3, tierLabel: 'Буря' },
];

export const LEGEND_DISMISSED_KEY = 'cosmogenesis-demo.legend.v2';

const POWER_TIER: Record<number, string> = {
  1: 'Искра',
  2: 'Жар',
  3: 'Буря',
  4: 'Комета',
  5: 'Сверхновая',
};

/** Слабые уровни (1–2) vs сильные (3–5) — для подсказок */
export const POWER_IS_STRONG = (p: number) => p >= 3;

export const BID_WORDS: Record<number, string> = {
  0: 'Ни одного',
  1: 'Один',
  2: 'Два',
  3: 'Три',
  4: 'Четыре',
  5: 'Пять',
};

export const PLAYER_NEON = ['#22d3ee', '#f472b6', '#a3e635'] as const;

export interface QuantumView {
  element: ElementId;
  meta: ElementMeta;
  power: number;
  tierLabel: string;
  isChaos: boolean;
}

export function crystalToQuantum(crystal: Crystal, dominant: ElementId | null): QuantumView {
  const isChaos = dominant !== null && crystal.element === dominant;
  const power = TIER_POWER[crystal.tier];
  return {
    element: crystal.element,
    meta: ELEMENTS[crystal.element],
    power,
    tierLabel: POWER_TIER[power] ?? 'Искра',
    isChaos,
  };
}

/** @deprecated только если нужен мост к старому движку */
const SUIT_TO_ELEMENT: Record<Suit, ElementId> = {
  '♥': 'fire',
  '♦': 'water',
  '♣': 'earth',
  '♠': 'air',
};

const RANK_TO_POWER: Record<string, number> = {
  '6': 1, '7': 2, '8': 3, '9': 4, '10': 5, J: 3, Q: 4, K: 5, A: 5,
};

export function cardToQuantum(card: Card, trump: Suit | null): QuantumView & { card: Card } {
  const isChaos = trump !== null && card.suit === trump;
  const element = SUIT_TO_ELEMENT[card.suit];
  const power = RANK_TO_POWER[card.rank] ?? 1;
  return {
    element,
    meta: ELEMENTS[element],
    power,
    tierLabel: POWER_TIER[power] ?? 'Искра',
    isChaos,
    card,
  };
}

export function suitToElement(suit: Suit): ElementMeta {
  return ELEMENTS[SUIT_TO_ELEMENT[suit]];
}

export { kidDealPhaseLabel as dealPhaseLabel } from './kidTypes';

export interface ConstellationDef {
  id: string;
  name: string;
  cost: number;
  blurb: string;
  color: string;
}

export const CONSTELLATIONS: ConstellationDef[] = [
  {
    id: 'flame',
    name: 'Созвездие Пламени',
    cost: 2,
    blurb: 'Огненные кристаллы пылают ярче.',
    color: '#ff6b2b',
  },
  {
    id: 'void',
    name: 'Созвездие Забвения',
    cost: 5,
    blurb: 'Один раз за турнир — пересмотреть заказ.',
    color: '#d946ef',
  },
  {
    id: 'echo',
    name: 'Эхо Создателей',
    cost: 9,
    blurb: 'Подсказки по ходу соперников.',
    color: '#22d3ee',
  },
];

export const META_STORAGE_KEY = 'cosmogenesis-demo.v1';

export interface MetaProgress {
  shards: number;
  unlocked: string[];
  partiesPlayed: number;
}

export function loadMetaProgress(): MetaProgress {
  if (typeof window === 'undefined') return { shards: 0, unlocked: [], partiesPlayed: 0 };
  try {
    const raw = localStorage.getItem(META_STORAGE_KEY);
    if (!raw) return { shards: 0, unlocked: [], partiesPlayed: 0 };
    const parsed = JSON.parse(raw) as MetaProgress;
    return {
      shards: parsed.shards ?? 0,
      unlocked: Array.isArray(parsed.unlocked) ? parsed.unlocked : [],
      partiesPlayed: parsed.partiesPlayed ?? 0,
    };
  } catch {
    return { shards: 0, unlocked: [], partiesPlayed: 0 };
  }
}

export function saveMetaProgress(meta: MetaProgress): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
}
