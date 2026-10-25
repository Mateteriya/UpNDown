/**
 * Яркие моменты партии: тиры итога, крупные точные заказы, идеальная партия.
 * Снапшот при финише — не зависит от долгого deal_history в облаке.
 * @see docs/METRICS-MAP-V1.md
 */

import type { DealResult } from './GameEngine';
import { resolveTakenForPlayer, summarizeDealSkill } from './playerSkillStats';

export type MatchHighlightSource = 'offline' | 'online';

/** Порог итога партии → тир (от большего к меньшему). */
export type PartyScoreTierId =
  | 'unreal'
  | 'mythic'
  | 'incredible'
  | 'legendary'
  | 'rare'
  | 'great'
  | 'success'
  | 'mini';

export type MatchHighlightKind =
  | 'party_score'
  | 'exact_deal'
  | 'exact_streak'
  | 'perfect_party'
  | 'place_first'
  | 'score_margin';

export type MatchHighlight = {
  kind: MatchHighlightKind;
  value: number;
  /** Тир итога (только party_score) */
  tier?: PartyScoreTierId;
  dealIndex?: number;
  dealNumber?: number;
  bid?: number;
  taken?: number;
  /** i18n key under cabinet.highlight.* */
  labelKey: string;
  source: MatchHighlightSource;
};

export const PARTY_SCORE_TIERS: readonly { id: PartyScoreTierId; min: number; labelKey: string }[] = [
  { id: 'unreal', min: 1000, labelKey: 'scoreTierUnreal' },
  { id: 'mythic', min: 900, labelKey: 'scoreTierMythic' },
  { id: 'incredible', min: 800, labelKey: 'scoreTierIncredible' },
  { id: 'legendary', min: 700, labelKey: 'scoreTierLegendary' },
  { id: 'rare', min: 600, labelKey: 'scoreTierRare' },
  { id: 'great', min: 500, labelKey: 'scoreTierGreat' },
  { id: 'success', min: 400, labelKey: 'scoreTierSuccess' },
  { id: 'mini', min: 300, labelKey: 'scoreTierMini' },
];

/** Минимальный заказ для «крупной точной взятки». */
export const BIG_EXACT_BID_MIN = 8;

export function partyScoreTierFor(score: number): PartyScoreTierId | null {
  if (!Number.isFinite(score)) return null;
  for (const t of PARTY_SCORE_TIERS) {
    if (score >= t.min) return t.id;
  }
  return null;
}

export function partyScoreTierMin(tier: PartyScoreTierId): number {
  return PARTY_SCORE_TIERS.find((t) => t.id === tier)?.min ?? 0;
}

export type DetectHighlightsInput = {
  dealHistory: readonly DealResult[] | undefined;
  players: readonly { score: number }[];
  humanIndex: number;
  source: MatchHighlightSource;
};

export function detectMatchHighlights(input: DetectHighlightsInput): MatchHighlight[] {
  const { dealHistory, players, humanIndex, source } = input;
  const out: MatchHighlight[] = [];
  if (!players.length || humanIndex < 0 || humanIndex >= players.length) return out;

  const humanScore = players[humanIndex]?.score ?? 0;
  const scores = players.map((p) => p.score);
  const maxScore = Math.max(...scores);
  const winners = scores.filter((s) => s === maxScore).length;
  const humanWonSole = humanScore === maxScore && winners === 1;

  const tier = partyScoreTierFor(humanScore);
  if (tier) {
    out.push({
      kind: 'party_score',
      value: humanScore,
      tier,
      labelKey: PARTY_SCORE_TIERS.find((t) => t.id === tier)!.labelKey,
      source,
    });
  }

  if (humanWonSole) {
    const second = [...scores].sort((a, b) => b - a)[1] ?? 0;
    const margin = humanScore - second;
    out.push({
      kind: 'place_first',
      value: humanScore,
      labelKey: 'placeFirst',
      source,
    });
    if (margin >= 40) {
      out.push({
        kind: 'score_margin',
        value: margin,
        labelKey: 'scoreMargin',
        source,
      });
    }
  }

  if (!dealHistory?.length) return out;

  const skill = summarizeDealSkill(dealHistory, humanIndex);
  if (skill.deals > 0 && skill.exact === skill.deals) {
    out.push({
      kind: 'perfect_party',
      value: skill.deals,
      labelKey: 'perfectParty',
      source,
    });
  }
  if (skill.bestExactStreak >= 5) {
    out.push({
      kind: 'exact_streak',
      value: skill.bestExactStreak,
      labelKey: 'exactStreak',
      source,
    });
  }

  for (let i = 0; i < dealHistory.length; i++) {
    const deal = dealHistory[i]!;
    const bid = deal.bids[humanIndex];
    if (typeof bid !== 'number' || bid < BIG_EXACT_BID_MIN) continue;
    const taken = resolveTakenForPlayer(deal, humanIndex);
    if (taken == null || taken !== bid) continue;
    out.push({
      kind: 'exact_deal',
      value: bid,
      dealIndex: i,
      dealNumber: deal.dealNumber,
      bid,
      taken,
      labelKey: bid >= 10 ? 'exactDeal10' : bid === 9 ? 'exactDeal9' : 'exactDealBig',
      source,
    });
  }

  return out;
}

/** Есть ли повод для post-game «мини-радости». */
export function isCelebrationHighlight(h: MatchHighlight): boolean {
  if (h.kind === 'party_score') return true;
  if (h.kind === 'exact_deal' && (h.value ?? 0) >= 10) return true;
  if (h.kind === 'perfect_party') return true;
  if (h.kind === 'exact_streak' && h.value >= 8) return true;
  return false;
}

export function pickPrimaryCelebration(highlights: readonly MatchHighlight[]): MatchHighlight | null {
  const celeb = highlights.filter(isCelebrationHighlight);
  if (!celeb.length) return null;
  const rank = (h: MatchHighlight): number => {
    if (h.kind === 'party_score') {
      const order: PartyScoreTierId[] = [
        'unreal',
        'mythic',
        'incredible',
        'legendary',
        'rare',
        'great',
        'success',
        'mini',
      ];
      return 1000 - (order.indexOf(h.tier ?? 'mini') + 1) * 10 + Math.min(h.value, 999) / 1000;
    }
    if (h.kind === 'exact_deal') return 500 + h.value;
    if (h.kind === 'perfect_party') return 450;
    if (h.kind === 'exact_streak') return 400 + h.value;
    return 0;
  };
  return [...celeb].sort((a, b) => rank(b) - rank(a))[0] ?? null;
}
