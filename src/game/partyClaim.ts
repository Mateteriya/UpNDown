/**
 * Квитанции партии → облачный аккаунт (outbox на устройстве).
 * @see docs/OFFLINE-PARTY-SYNC.md
 */

import type { DealResult } from './GameEngine';
import type { PartyArchiveRecord } from './partyArchive';
import { newMatchKey } from './matchKey';
import { getPlayerProfile } from './persistence';
import { summarizeDealSkill } from './playerSkillStats';

const OUTBOX_KEY = 'updown_party_claim_outbox_v1';
const CLAIM_TOKEN_PENDING_KEY = 'updown_party_claim_pending_token';

export type PartyClaimIntent = 'existing_account' | 'new_account';

/** Снимок «как на экране отправителя» — не угадываем слот по имени. */
export interface PartyClaimViewerSnapshot {
  humanIndex: number;
  humanPlace: number;
  humanScore: number;
  humanChips: number;
  humanBidAccuracyPct: number;
  seatNames: string[];
  players: { name: string; score: number; chips: number; place: number; playerIndex: number }[];
  dealCount: number;
  settlementMode: string;
  dealHistory: DealResult[];
}

export interface PartyClaimReceipt {
  /** Одноразовый токен (в ссылке регистрации / привязке). */
  claimToken: string;
  matchKey: string;
  archiveId: string;
  finishedAt: string;
  intent: PartyClaimIntent;
  email: string;
  createdAt: string;
  /** uploaded | pending_network | bound | rejected | failed */
  status: 'pending_network' | 'uploaded' | 'bound' | 'rejected' | 'failed';
  cloudClaimId?: string | null;
  lastError?: string | null;
  viewer: PartyClaimViewerSnapshot;
  profileId: string;
}

function safeParseOutbox(raw: string | null): PartyClaimReceipt[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter(isPartyClaimReceipt);
  } catch {
    return [];
  }
}

export function isPartyClaimReceipt(x: unknown): x is PartyClaimReceipt {
  if (!x || typeof x !== 'object') return false;
  const r = x as PartyClaimReceipt;
  return (
    typeof r.claimToken === 'string' &&
    typeof r.matchKey === 'string' &&
    typeof r.email === 'string' &&
    typeof r.archiveId === 'string' &&
    r.viewer != null &&
    typeof r.viewer === 'object'
  );
}

export function readClaimOutbox(): PartyClaimReceipt[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    return safeParseOutbox(localStorage.getItem(OUTBOX_KEY));
  } catch {
    return [];
  }
}

function writeClaimOutbox(list: PartyClaimReceipt[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(list.slice(0, 40)));
  } catch {
    /* ignore */
  }
}

export function upsertClaimOutbox(receipt: PartyClaimReceipt): void {
  const list = readClaimOutbox().filter((r) => r.claimToken !== receipt.claimToken);
  writeClaimOutbox([receipt, ...list]);
}

export function updateClaimOutbox(
  claimToken: string,
  patch: Partial<PartyClaimReceipt>,
): PartyClaimReceipt | null {
  const list = readClaimOutbox();
  const i = list.findIndex((r) => r.claimToken === claimToken);
  if (i < 0) return null;
  const next = { ...list[i], ...patch };
  list[i] = next;
  writeClaimOutbox(list);
  return next;
}

export function removeClaimOutbox(claimToken: string): void {
  writeClaimOutbox(readClaimOutbox().filter((r) => r.claimToken !== claimToken));
}

export function rememberPendingClaimToken(token: string): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(CLAIM_TOKEN_PENDING_KEY, token);
  } catch {
    /* ignore */
  }
}

export function consumePendingClaimToken(): string | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const t = sessionStorage.getItem(CLAIM_TOKEN_PENDING_KEY)?.trim() || null;
    if (t) sessionStorage.removeItem(CLAIM_TOKEN_PENDING_KEY);
    return t;
  } catch {
    return null;
  }
}

export function peekClaimTokenFromUrl(href: string): string | null {
  try {
    const u = new URL(href);
    return (
      u.searchParams.get('ud_claim')?.trim() ||
      u.searchParams.get('claim')?.trim() ||
      null
    );
  } catch {
    return null;
  }
}

export function buildViewerSnapshotFromArchive(
  arch: PartyArchiveRecord,
): PartyClaimViewerSnapshot {
  const humanIndex = arch.humanIndex ?? 0;
  const skill = summarizeDealSkill(arch.dealHistory ?? [], humanIndex);
  return {
    humanIndex,
    humanPlace: arch.humanPlace,
    humanScore: arch.humanScore,
    humanChips: arch.humanChips,
    humanBidAccuracyPct: skill.accuracyPct,
    seatNames: arch.seatNames ?? arch.players.map((p) => p.name),
    players: arch.players.map((p) => ({
      name: p.name,
      score: p.score,
      chips: p.chips,
      place: p.place,
      playerIndex: p.playerIndex ?? 0,
    })),
    dealCount: arch.dealCount,
    settlementMode: arch.settlementMode,
    dealHistory: (arch.dealHistory ?? []).map((d) => ({
      dealNumber: d.dealNumber,
      bids: [...d.bids],
      points: [...d.points],
      ...(d.takens ? { takens: [...d.takens] } : {}),
    })),
  };
}

export function createClaimReceipt(opts: {
  archive: PartyArchiveRecord;
  email: string;
  intent: PartyClaimIntent;
}): PartyClaimReceipt {
  const email = opts.email.trim().toLowerCase();
  const claimToken = newMatchKey();
  const matchKey = opts.archive.matchKey?.trim() || newMatchKey();
  return {
    claimToken,
    matchKey,
    archiveId: opts.archive.id,
    finishedAt: opts.archive.finishedAt,
    intent: opts.intent,
    email,
    createdAt: new Date().toISOString(),
    status: 'pending_network',
    cloudClaimId: null,
    lastError: null,
    viewer: buildViewerSnapshotFromArchive(opts.archive),
    profileId: opts.archive.profileId || getPlayerProfile().profileId || '',
  };
}

/** Краткая строка для ЛК / письма. */
export function formatClaimCardLines(r: PartyClaimReceipt, locale: 'ru' | 'en' = 'ru'): {
  title: string;
  you: string;
  table: string;
} {
  const d = new Date(r.finishedAt);
  const when = Number.isFinite(d.getTime())
    ? d.toLocaleString(locale === 'en' ? 'en-GB' : 'ru-RU', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : r.finishedAt;
  const shortKey = r.matchKey.replace(/^room:/, '').slice(0, 8);
  const title =
    locale === 'en'
      ? `${when} · key ${shortKey}…`
      : `${when} · ключ ${shortKey}…`;
  const you =
    locale === 'en'
      ? `You: place ${r.viewer.humanPlace} · ${r.viewer.humanScore} pts · ${r.viewer.humanChips >= 0 ? '+' : ''}${r.viewer.humanChips} chips · bid ${r.viewer.humanBidAccuracyPct}%`
      : `Вы: ${r.viewer.humanPlace}-е · ${r.viewer.humanScore} очк. · ${r.viewer.humanChips >= 0 ? '+' : ''}${r.viewer.humanChips} фиш. · точн. ${r.viewer.humanBidAccuracyPct}%`;
  const table = r.viewer.players
    .slice()
    .sort((a, b) => a.place - b.place)
    .map((p) => `${p.name} ${p.score}`)
    .join(' · ');
  return { title, you, table };
}
