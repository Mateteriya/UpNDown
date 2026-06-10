/**
 * Контекст онлайн-игры. Принцип: "Я всегда Юг".
 */
import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { v4 as uuidv4 } from 'uuid';
import type { Card } from '../game/types';
import type { GameState } from '../game/GameEngine';
import {
  startDeal,
  startNextDeal,
  placeBid,
  playCard,
  completeTrick,
  createGameOnline,
} from '../game/GameEngine';
import { saveUnfinishedOnlineGame, getPlayerProfile } from '../game/persistence';
import { rotateStateForPlayer } from '../game/rotateState';
import {
  createRoom as apiCreateRoom,
  joinRoom as apiJoinRoom,
  recoverJoinByCode,
  getRoom,
  getRoomQuick,
  getRoomForSyncPoll,
  updateRoomState,
  updateRoomPlayerSlots,
  subscribeToRoom,
  leaveRoom as apiLeaveRoom,
  returnSlotToPlayer as apiReturnSlotToPlayer,
  takePauseInRoom as apiTakePause,
  heartbeatPresence,
  transferHostRoom,
  hostResolveAbsent,
  normalizeRoomPhase,
  type PlayerSlot,
  type GameRoomRow,
  type GameRoomPhase,
  type HostResolveAbsentChoice,
  type CreateRoomOptions,
} from '../lib/onlineGameApi';
import type { SettlementMode } from '../game/partySettlement';
import { DEFAULT_CASUAL_SETTLEMENT } from '../lib/roomSettlement';
import type { RoomKind } from '../lib/roomSettlement';
import {
  saveOnlineSession,
  clearOnlineSession,
  loadOnlineSession,
  markLobbyUiOpen,
} from '../lib/onlineSession';
import { loadLastOnlineParty, clearLastOnlineParty, saveLastOnlineParty } from '../lib/lastOnlineParty';
import {
  addIgnoredRoomForAutoRestore,
  isRoomIgnoredForAutoRestore,
  removeIgnoredRoomForAutoRestore,
} from '../lib/onlineIgnoredRooms';
import { getOnlinePlayerId } from '../lib/deviceId';
import { isServerAuthoritativeOnline } from '../lib/onlineTransport';
import { wsV2StartGame } from '../lib/onlineGameWs';
import { OnlineGameProviderV2 } from './OnlineGameContextV2';

/** Сообщение при обрыве по таймауту fetch в supabase.ts (~55 с). */
function formatSupabaseNetworkError(e: unknown): string {
  if (e instanceof DOMException && e.name === 'AbortError') {
    return 'Нет ответа от Supabase вовремя. Проверьте интернет и VPN. Откройте игру по адресу ПК в Wi‑Fi (http://192.168.…:5173), не localhost. В панели Supabase убедитесь, что проект не на паузе (бесплатный тариф).';
  }
  if (e instanceof Error && (e.name === 'AbortError' || /aborted|abort/i.test(e.message))) {
    return 'Нет ответа от Supabase вовремя. Проверьте интернет, VPN и статус проекта на supabase.com.';
  }
  if (e instanceof TypeError && /failed to fetch|load failed|networkerror/i.test(e.message)) {
    return 'Нет связи с сервером (сеть или блокировка). Проверьте Wi‑Fi/VPN, не используйте localhost с другого устройства — откройте игру по IP ПК в одной сети.';
  }
  return e instanceof Error ? e.message : String(e);
}

// --- Управление Device ID (остается без изменений) ---
const DEVICE_ID_KEY = 'updown_device_id';
function getDeviceId(): string {
  try {
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = uuidv4();
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  } catch {
    return 'in-memory-device-id';
  }
}

export type OnlineStatus = 'idle' | 'waiting' | 'playing' | 'left' | 'finished';

type PendingReclaimOffer = {
  roomId: string;
  code: string;
  slotIndex: number;
  replacedDisplayName: string;
};

/** Хотя бы у одного игрока есть карты на руке (раздача уже в состоянии). */
function stateHasDealtHands(state: GameState | null): boolean {
  if (!state) return false;
  return state.players.some((p) => (p.hand?.length ?? 0) > 0);
}

/** PostgREST иногда отдаёт bigint как строку — без числа ломается ветка по game_state_revision */
function parseGameStateRevision(raw: unknown): number | undefined {
  if (raw == null || raw === '') return undefined;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && !Number.isNaN(n) ? n : undefined;
}

function gameStateJsonEqual(a: GameState | null, b: GameState | null): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function playerSlotsJsonEqual(a: PlayerSlot[], b: PlayerSlot[]): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/** Имена в game_state и displayName в слотах должны совпадать у всех клиентов. */
function patchGameStateNamesFromSlots(gs: GameState, slots: PlayerSlot[]): GameState {
  let changed = false;
  const players = gs.players.map((p, i) => {
    const dn = slots.find((s) => s.slotIndex === i)?.displayName?.trim();
    if (dn && dn !== p.name) {
      changed = true;
      return { ...p, name: dn };
    }
    return p;
  });
  return changed ? { ...gs, players } : gs;
}

function cardEqual(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

/**
 * Опрос вернул тот же номер раздачи, но взятка «короче» — без последних выложенных карт (кэш).
 * Подмена таким JSON уводит карты с стола обратно в руку.
 */
function tricksTakenEqual(a: GameState, b: GameState): boolean {
  try {
    return JSON.stringify(a.tricksTaken) === JSON.stringify(b.tricksTaken);
  } catch {
    return false;
  }
}

/**
 * Опрос/кэш вернул тот же номер раздачи, но взятка «короче» — без последних выложенных карт.
 * Включая currentTrick=[] при картах на столе (типичный откат после 2–3 ходов в LAN).
 */
function isStaleShortCurrentTrick(local: GameState | null, incoming: GameState | null): boolean {
  if (local == null || incoming == null) return false;
  if (
    local.phase !== 'playing' ||
    incoming.phase !== 'playing' ||
    local.dealNumber !== incoming.dealNumber ||
    local.pendingTrickCompletion != null ||
    incoming.pendingTrickCompletion != null
  ) {
    return false;
  }
  const a = local.currentTrick ?? [];
  const b = incoming.currentTrick ?? [];
  if (b.length >= a.length) return false;
  if (b.length === 0 && a.length > 0) {
    /** Первый ход раздачи: stale часто с пустой взяткой, но другим currentPlayerIndex — тоже откат. */
    return local.tricksInDeal === incoming.tricksInDeal && tricksTakenEqual(local, incoming);
  }
  for (let i = 0; i < b.length; i++) {
    if (!cardEqual(a[i]!, b[i]!)) return false;
  }
  return true;
}

/** Продления same-rev нельзя откладывать «вечно»: иначе при лавине опросов/кэша стол перестаёт догонять сервер (откаты ходов, залипший ИИ). */
const STALE_SAME_REV_GRACE_CAP_MS = 4000;

function bumpStaleSameRevGraceCap(ref: { current: number }, extendMs: number) {
  const now = Date.now();
  ref.current = Math.min(Math.max(ref.current, now + extendMs), now + STALE_SAME_REV_GRACE_CAP_MS);
}

function resetStaleSameRevGraceAfterWrite(ref: { current: number }) {
  const now = Date.now();
  ref.current = Math.min(now + 2300, now + STALE_SAME_REV_GRACE_CAP_MS);
}

function roomRowMetaKey(room: GameRoomRow): string {
  try {
    return JSON.stringify({
      st: room.status,
      h: room.host_user_id ?? null,
      p: normalizeRoomPhase(room),
      au: room.absent_until ?? null,
      asi: room.absent_slot_index,
      s: room.player_slots,
    });
  } catch {
    return String(room.updated_at ?? '') + (room.id ?? '');
  }
}

// --- Интерфейс Контекста (остается без изменений) ---
export interface OnlineGameContextValue {
  status: OnlineStatus;
  roomId: string | null;
  code: string | null;
  myServerIndex: number; // ИЗМЕНЕНО: mySlotIndex -> myServerIndex для ясности
  playerSlots: PlayerSlot[];
  canonicalState: GameState | null;
  displayState: GameState | null;
  error: string | null;
  createRoom: (
    userId: string,
    displayName: string,
    shortLabel?: string,
    roomOpts?: CreateRoomOptions,
  ) => Promise<{ ok: boolean; error?: string }>;
  joinRoom: (code: string, userId: string, displayName: string, shortLabel?: string) => Promise<{ ok: boolean; error?: string }>;
  /** Если «Вход…» оборвался, а на сервере вы уже в слотах — подтянуть комнату по коду */
  recoverJoinIfAlreadyInRoom: (code: string) => Promise<boolean>;
  // ... остальной интерфейс без изменений
  leaveRoom: () => Promise<void>;
  refreshRoom: () => Promise<void>;
  /** Если ход есть у других, а у вас стол «замёрз» без VPN — тянет строку через getRoom и перевешивает Realtime (как переключение VPN). */
  resyncRoomAggressive: () => Promise<void>;
  syncMySlotDisplayName: (displayName: string) => Promise<void>;
  /** Обновить аватарку в нашем слоте (после смены фото в профиле). */
  syncMySlotAvatar: () => Promise<void>;
  startGame: () => Promise<boolean>;
  sendBid: (bid: number) => Promise<boolean>;
  sendPlay: (card: Card) => Promise<boolean>;
  sendCompleteTrick: () => Promise<boolean>;
  sendStartNextDeal: () => Promise<boolean>;
  sendState: (state: GameState) => Promise<boolean>;
  tryRestoreSession: () => Promise<{ ok: boolean; needReclaim?: boolean; roomFinished?: boolean; error?: string }>;
  /** Убрать сохранённую подсказку «последняя комната» (меню / лобби), без выхода с сервера. */
  forgetLastOnlineParty: () => void;
  /** Меняется при forgetLast — чтобы меню перечитало localStorage. */
  lastPartyHintVersion: number;
  /**
   * Лобби / ожидание: выйти с сервера и отключить автопродолжение этой комнаты при следующем открытии вкладки.
   * Не вызывать во время активной партии (playing).
   */
  stopAutoRestoreForCurrentRoom: () => Promise<void>;
  confirmReclaim: () => Promise<boolean>;
  dismissReclaim: () => void;
  pendingReclaimOffer: PendingReclaimOffer | null;
  returnSlotToPlayer: (slotIndex: number) => Promise<boolean>;
  /** Игрок сам вручную взял паузу (передал слот ИИ), может вернуть управление. */
  userOnPause: boolean;
  takePause: () => Promise<boolean>;
  returnFromPause: () => Promise<boolean>;
  playerLeftToast: string | null;
  clearPlayerLeftToast: () => void;
  clearError: () => void;
  userLeftTemporarily: boolean;
  setUserLeftTemporarily: (value: boolean) => void;
  /**
   * После первичной проверки sessionStorage/lastOnlineParty + performSessionRestore (или решения «сессии нет»).
   * Пока false — GameTable не должен поднимать офлайн-стол, иначе после убийства вкладки моб. браузером показывается локальная партия вместо ожидания онлайна.
   */
  onlineHydratedFromStorage: boolean;
  roomPhase: GameRoomPhase;
  hostUserId: string | null;
  absentUntil: string | null;
  absentSlotIndex: number | null;
  transferHostTo: (
    newHostUserId: string,
    /** Явный id комнаты с экрана (GameTable), чтобы не упереться в устаревший roomId в замыкании. */
    roomIdForRpc?: string | null,
  ) => Promise<{ ok: boolean; error?: string }>;
  hostResolveAbsentChoice: (choice: HostResolveAbsentChoice) => Promise<boolean>;
  settlementMode: SettlementMode;
  buyIn: number | null;
  roomKind: RoomKind;
  /** Id для онлайн-комнаты: Supabase user id или device id в LAN (ws). */
  onlinePlayerId: string;
}
// --- Конец интерфейса ---

export const OnlineGameContext = createContext<OnlineGameContextValue | null>(null);

export function OnlineGameProvider({ children }: { children: React.ReactNode }) {
  if (isServerAuthoritativeOnline()) {
    return <OnlineGameProviderV2>{children}</OnlineGameProviderV2>;
  }

  const { user, loading: authLoading } = useAuth();
  const onlinePlayerId = useMemo(() => getOnlinePlayerId(user?.id), [user?.id]);
  const lanWs = isWsOnlineConfigured();
  const [status, setStatus] = useState<OnlineStatus>('idle');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  /** Актуальный roomId для отсечения поздних ответов getRoom после смены/выхода из комнаты (синхронно сбрасывается в leaveRoom). */
  const roomIdRef = useRef<string | null>(roomId);
  roomIdRef.current = roomId;

  // ИЗМЕНЕНО: mySlotIndex -> myServerIndex. Это наш индекс на сервере (0, 1, 2, или 3).
  // Для отображения мы всегда будем на месте 0.
  const [myServerIndex, setMyServerIndex] = useState(0); 

  const [playerSlots, setPlayerSlots] = useState<PlayerSlot[]>([]);
  const [canonicalState, setCanonicalState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roomPhase, setRoomPhase] = useState<GameRoomPhase>('lobby');
  const [hostUserId, setHostUserId] = useState<string | null>(null);
  const [absentUntil, setAbsentUntil] = useState<string | null>(null);
  const [absentSlotIndex, setAbsentSlotIndex] = useState<number | null>(null);
  const [settlementMode, setSettlementMode] = useState<SettlementMode>(DEFAULT_CASUAL_SETTLEMENT);
  const [buyIn, setBuyIn] = useState<number | null>(null);
  const [roomKind, setRoomKind] = useState<RoomKind>('private');
  const [realtimeHealKey, setRealtimeHealKey] = useState(0);
  const [onlineHydratedFromStorage, setOnlineHydratedFromStorage] = useState(false);
  const onlineHydrateGenRef = useRef(0);
  const [pendingReclaimOffer, setPendingReclaimOffer] = useState<PendingReclaimOffer | null>(null);
  const deviceIdRef = useRef<string>(getDeviceId());
  const unsubRef = useRef<(() => void) | null>(null);
  const realtimeErrorDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimePollBurstTimeoutsRef = useRef<number[]>([]);
  /** Чтобы несколько интервалов/кнопок не гоняли getRoom параллельно (ещё один «залипший» канал без VPN). */
  const roomHardRefreshLockRef = useRef(false);
  const roomResyncAggressiveLockRef = useRef(false);
  /** Последняя номер раздачи, для доборного heal при переходе 1→2… без ручного VPN. */
  const prevHealDealNumberRef = useRef<number | null>(null);
  
  // Порядок слотов ВЕЗДЕ один и тот же: 0=Юг, 1=Север, 2=Запад, 3=Восток. Не вращаем — только «я» = myServerIndex.
  /** Без useMemo каждый ререндер провайдера (опрос слотов, heartbeat) создавал новый объект → стол и карты взятки перерисовывались и «мигали». */
  const displayState = useMemo(
    () => (canonicalState ? rotateStateForPlayer(canonicalState, myServerIndex) : null),
    [canonicalState, myServerIndex],
  );

  const playerSlotsNameSig = useMemo(
    () =>
      JSON.stringify(
        (playerSlots ?? []).map((s) => [s.slotIndex, s.displayName ?? '', s.userId ?? '']),
      ),
    [playerSlots],
  );

  useEffect(() => {
    if (status !== 'playing' && status !== 'finished') return;
    setCanonicalState((prev) => {
      if (!prev) return prev;
      const next = patchGameStateNamesFromSlots(prev, playerSlots);
      if (next === prev) return prev;
      canonicalStateRef.current = next;
      return next;
    });
  }, [playerSlotsNameSig, status, playerSlots]);
  const canonicalStateRef = useRef<GameState | null>(null);
  canonicalStateRef.current = canonicalState;
  const lastSendAtRef = useRef(0);
  /** Активный update game_state в Supabase — пока >0, игнорируем устаревшие строки из опроса/Realtime (сброс заказа, откат стола). */
  const gameWriteInFlightRef = useRef(0);
  /** Сразу после send* опрос иногда отдаёт ту же game_state_revision, но предыдущий JSON — карта на столе мелькает; коротко игнорируем такие снимки. */
  const gameStateStaleSameRevIgnoreUntilRef = useRef(0);
  /** Время последней строки комнаты с сервера (updated_at), чтобы опрос мог принудительно подтянуть актуальное game_state при «залипании» onlyIfNewer. */
  const lastSeenRoomUpdatedAtMsRef = useRef(0);
  /** Последняя применённая game_state_revision с сервера (колонка + триггер в БД); -1 = ещё не было. */
  const lastAppliedGameStateRevisionRef = useRef(-1);
  /** Версия host/фаз/слотов — чтобы out-of-order ответ (меньше updated_at) не выкидывал смену хоста. */
  const appliedRowMetaKeyRef = useRef<string>('');
  /** Для одноразового всплеска refresh при входе в playing (старт с лобби — гости быстрее получают game_state). */
  const prevStatusForPlayingBurstRef = useRef<OnlineStatus | undefined>(undefined);

  const syncRoomRowMeta = useCallback((room: GameRoomRow) => {
    setHostUserId(room.host_user_id ?? null);
    setRoomPhase(normalizeRoomPhase(room));
    setAbsentUntil(room.absent_until ?? null);
    const mode = room.settlement_mode;
    if (
      mode === 'points_only' ||
      mode === 'vs_average' ||
      mode === 'accuracy_bonus' ||
      mode === 'prize_pool'
    ) {
      setSettlementMode(mode);
    } else if (room.game_state?.settlementMode) {
      setSettlementMode(room.game_state.settlementMode);
    }
    const bi = room.buy_in ?? room.game_state?.buyIn ?? null;
    setBuyIn(typeof bi === 'number' && Number.isFinite(bi) ? bi : null);
    const rk = room.room_kind;
    setRoomKind(rk === 'public' ? 'public' : 'private');
    const asi = room.absent_slot_index;
    if (typeof asi === 'number' && Number.isFinite(asi)) setAbsentSlotIndex(asi);
    else if (asi != null && `${asi}`.trim() !== '') {
      const n = Number(asi);
      setAbsentSlotIndex(Number.isFinite(n) ? n : null);
    } else {
      setAbsentSlotIndex(null);
    }
  }, []);

  const applyRoomData = useCallback(
    (room: GameRoomRow) => {
      if (!room?.id) return;
      roomIdRef.current = room.id;
      const incoming = room.game_state ?? null;
      /** Ответ опроса «ещё лобби» пришёл после снимка playing — не сбрасывать стол в waiting/null (хост на мобилке). */
      if (room.status === 'waiting' && incoming == null) {
        const lg = canonicalStateRef.current;
        if (lg != null && stateHasDealtHands(lg) && lastSeenRoomUpdatedAtMsRef.current > 0) {
          const rowTs = Date.parse(room.updated_at);
          if (Number.isFinite(rowTs) && rowTs < lastSeenRoomUpdatedAtMsRef.current) {
            return;
          }
        }
      }
      const isPlayingWithoutState = room.status === 'playing' && incoming == null;
      // Не двигаем lastSeen на «playing без JSON»: иначе гонка с полной строкой и чуть меньшим updated_at может долго отбрасывать актуальный стол.
      if (!isPlayingWithoutState) {
        const ts = Date.parse(room.updated_at);
        if (Number.isFinite(ts)) {
          lastSeenRoomUpdatedAtMsRef.current = Math.max(lastSeenRoomUpdatedAtMsRef.current, ts);
        }
      }
      setRoomId(room.id);
      setCode(room.code);
      const nextSlotsApply = (room.player_slots || []) as PlayerSlot[];
      setPlayerSlots((prev) => (playerSlotsJsonEqual(prev, nextSlotsApply) ? prev : nextSlotsApply));
      syncRoomRowMeta(room);
      // playing без game_state в payload бывает при гонках Realtime/опроса — нельзя сбрасывать статус в waiting (гость «висит» на лобби при старте).
      if (isPlayingWithoutState) {
        setStatus('playing');
        const r = parseGameStateRevision(room.game_state_revision);
        if (r !== undefined) {
          lastAppliedGameStateRevisionRef.current = Math.max(lastAppliedGameStateRevisionRef.current, r);
        }
        appliedRowMetaKeyRef.current = roomRowMetaKey(room);
        return;
      }
      const phaseDone = room.status === 'finished' || normalizeRoomPhase(room) === 'finished';
      if (phaseDone) {
        setCanonicalState(incoming);
        setStatus('finished');
        const rFin = parseGameStateRevision(room.game_state_revision);
        if (rFin !== undefined) {
          lastAppliedGameStateRevisionRef.current = Math.max(
            lastAppliedGameStateRevisionRef.current,
            rFin,
          );
        }
        appliedRowMetaKeyRef.current = roomRowMetaKey(room);
        return;
      }
      const r2 = parseGameStateRevision(room.game_state_revision);
      const lastRev = lastAppliedGameStateRevisionRef.current;
      if (
        room.status === 'playing' &&
        incoming != null &&
        r2 !== undefined &&
        r2 === lastRev &&
        gameStateJsonEqual(canonicalStateRef.current, incoming)
      ) {
        const nextSlotsEq = (room.player_slots || []) as PlayerSlot[];
        setPlayerSlots((prev) => (playerSlotsJsonEqual(prev, nextSlotsEq) ? prev : nextSlotsEq));
        const patched = patchGameStateNamesFromSlots(incoming, nextSlotsEq);
        if (patched !== incoming) {
          setCanonicalState(patched);
          canonicalStateRef.current = patched;
        }
        if (r2 !== undefined) {
          lastAppliedGameStateRevisionRef.current = Math.max(lastAppliedGameStateRevisionRef.current, r2);
        }
        appliedRowMetaKeyRef.current = roomRowMetaKey(room);
        return;
      }
      /** Та же ревизия, другой JSON, но строка комнаты по времени старее уже применённого — кэш/порядок ответов. */
      if (
        room.status === 'playing' &&
        incoming != null &&
        r2 !== undefined &&
        r2 === lastRev &&
        !gameStateJsonEqual(canonicalStateRef.current, incoming)
      ) {
        const rowTs = Date.parse(room.updated_at);
        if (
          Number.isFinite(rowTs) &&
          lastSeenRoomUpdatedAtMsRef.current > 0 &&
          rowTs < lastSeenRoomUpdatedAtMsRef.current
        ) {
          return;
        }
      }
      if (
        room.status === 'playing' &&
        incoming != null &&
        canonicalStateRef.current != null &&
        gameStateJsonEqual(canonicalStateRef.current, incoming)
      ) {
        const nextSlotsEq = (room.player_slots || []) as PlayerSlot[];
        setPlayerSlots((prev) => (playerSlotsJsonEqual(prev, nextSlotsEq) ? prev : nextSlotsEq));
        if (r2 !== undefined) {
          lastAppliedGameStateRevisionRef.current = Math.max(lastAppliedGameStateRevisionRef.current, r2);
        }
        appliedRowMetaKeyRef.current = roomRowMetaKey(room);
        return;
      }
      if (
        room.status === 'playing' &&
        incoming != null &&
        isStaleShortCurrentTrick(canonicalStateRef.current, incoming)
      ) {
        bumpStaleSameRevGraceCap(gameStateStaleSameRevIgnoreUntilRef, 2000);
        return;
      }
      setCanonicalState(incoming);
      if (room.status === 'playing') setStatus('playing');
      else setStatus('waiting');
      if (r2 !== undefined) {
        lastAppliedGameStateRevisionRef.current = Math.max(lastAppliedGameStateRevisionRef.current, r2);
      }
      appliedRowMetaKeyRef.current = roomRowMetaKey(room);
    },
    [syncRoomRowMeta],
  );

  /** Лобби: слоты и код без подмены game_state (updated_at от аватаров не трогает стол). */
  const mergeLobbyFieldsFromRoom = useCallback(
    (room: GameRoomRow) => {
      if (!room?.id) return;
      // Иначе merge-only оставляет status=playing и пустой стол (висит UI после гонок revision/Realtime).
      if (room.status === 'playing' && room.game_state && !canonicalStateRef.current) {
        applyRoomData(room);
        return;
      }
      roomIdRef.current = room.id;
      const ts = Date.parse(room.updated_at);
      if (Number.isFinite(ts)) {
        lastSeenRoomUpdatedAtMsRef.current = Math.max(lastSeenRoomUpdatedAtMsRef.current, ts);
      }
      setRoomId(room.id);
      setCode(room.code);
      const nextSlotsM = (room.player_slots || []) as PlayerSlot[];
      setPlayerSlots((prev) => (playerSlotsJsonEqual(prev, nextSlotsM) ? prev : nextSlotsM));
      syncRoomRowMeta(room);
      // Сервер уже playing — UI не должен оставаться в лобби «ждём хоста», даже если JSON стола ещё не пришёл в этом payload.
      if (room.status === 'playing') setStatus('playing');
      else setStatus('waiting');
      appliedRowMetaKeyRef.current = roomRowMetaKey(room);
    },
    [applyRoomData, syncRoomRowMeta],
  );

  /** Одна точка: Realtime + опрос. Устаревшие по updated_at отбрасываем; по ревизии game_state — не откатывать стол из‑за свежего updated_at от слотов без смены state. */
  const applyRoomSnapshot = useCallback(
    (room: GameRoomRow) => {
      if (!room?.id) return;
      if (room.status === 'waiting' && room.game_state == null) {
        mergeLobbyFieldsFromRoom(room);
        return;
      }
      const rIn = parseGameStateRevision(room.game_state_revision);
      const lastRev = lastAppliedGameStateRevisionRef.current;
      if (rIn !== undefined && lastRev >= 0 && rIn < lastRev) {
        return;
      }
      /**
       * Пока летит startGame/send*: опрос/Realtime часто отдают строку **ещё из лобби** (waiting, без JSON) или
       * playing с тем же revision и старым JSON — на мобилке ответы приходят не по порядку и затирают оптимистичную раздачу
       * (панель заказа мигает, торги сбрасываются). Принимаем только эхо того же стола или строго более новую ревизию.
       */
      if (gameWriteInFlightRef.current > 0) {
        const localGs = canonicalStateRef.current;
        if (localGs != null && stateHasDealtHands(localGs)) {
          /** lastRev < 0 до первого applyRoomData: иначе «первая» ревизия с сервера отбрасывается и хост/ИИ замирают после старта. */
          const newerOnServer = rIn !== undefined && (lastRev < 0 || rIn > lastRev);
          if (!newerOnServer) {
            if (room.status !== 'playing' || room.game_state == null) {
              return;
            }
            const incomingGs = room.game_state as GameState;
            if (!gameStateJsonEqual(localGs, incomingGs)) {
              /**
               * Нельзя подмешивать player_slots из этой же устаревшей строки: при старте партии оптимистичный стол
               * уже с новыми слотами, а снимок — ещё из лобби → имена/состав слотов откатываются, isNativeVacantAiPlayerSlot
               * ломается и хост не ведёт ИИ (зависание на первом ходе бота).
               */
              return;
            }
          }
        }
      }
      const revisionIsNewer =
        rIn !== undefined && (lastRev < 0 || rIn > lastRev);
      const ts = Date.parse(room.updated_at);
      if (
        !revisionIsNewer &&
        Number.isFinite(ts) &&
        lastSeenRoomUpdatedAtMsRef.current > 0 &&
        ts < lastSeenRoomUpdatedAtMsRef.current
      ) {
        /** Пока летит startGame/send*, не подмешивать устаревшую строку (иначе слоты/лобби откатывают оптимистичный стол). */
        if (gameWriteInFlightRef.current > 0) {
          const lg = canonicalStateRef.current;
          if (lg != null && stateHasDealtHands(lg)) {
            return;
          }
        }
        /** Устаревшее лобби при уже идущей раздаче — не подмешивать слоты (иначе рассинхрон с ПК/гостем). */
        if (room.status === 'waiting') {
          const lg = canonicalStateRef.current;
          if (lg != null && stateHasDealtHands(lg)) {
            return;
          }
        }
        const k = roomRowMetaKey(room);
        if (k !== appliedRowMetaKeyRef.current) {
          setRoomId(room.id);
          setCode(room.code);
          const nextSlotsS = (room.player_slots || []) as PlayerSlot[];
          setPlayerSlots((prev) => (playerSlotsJsonEqual(prev, nextSlotsS) ? prev : nextSlotsS));
          syncRoomRowMeta(room);
          appliedRowMetaKeyRef.current = k;
        }
        return;
      }
      if (room.status === 'waiting' && gameWriteInFlightRef.current > 0) {
        const local = canonicalStateRef.current;
        if (local && stateHasDealtHands(local)) {
          /** mergeLobbyFieldsFromRoom вызывал setStatus('waiting') — кнопка «Начать игру» снова активна, стол в ref ещё с картами. */
          return;
        }
      }
      if (
        room.status === 'playing' &&
        room.game_state != null &&
        Date.now() < gameStateStaleSameRevIgnoreUntilRef.current
      ) {
        const rg = parseGameStateRevision(room.game_state_revision);
        const lr = lastAppliedGameStateRevisionRef.current;
        if (rg !== undefined && lr >= 0 && rg === lr) {
          const inc = room.game_state as GameState;
          const loc = canonicalStateRef.current;
          if (loc != null && !gameStateJsonEqual(loc, inc)) {
            bumpStaleSameRevGraceCap(gameStateStaleSameRevIgnoreUntilRef, 1800);
            return;
          }
        }
      }
      /** Та же ревизия, JSON не совпадает, но currentTrick — укороченный префикс кэша; не зовём applyRoomData (там уже успели бы тронуть слоты/lastSeen). */
      if (room.status === 'playing' && room.game_state != null) {
        const inc = room.game_state as GameState;
        const loc = canonicalStateRef.current;
        const rg = parseGameStateRevision(room.game_state_revision);
        const lr = lastAppliedGameStateRevisionRef.current;
        if (loc != null && inc.dealNumber < loc.dealNumber) {
          return;
        }
        if (
          loc != null &&
          rg !== undefined &&
          lr >= 0 &&
          rg === lr &&
          !gameStateJsonEqual(loc, inc) &&
          isStaleShortCurrentTrick(loc, inc)
        ) {
          bumpStaleSameRevGraceCap(gameStateStaleSameRevIgnoreUntilRef, 2000);
          return;
        }
      }
      applyRoomData(room);
    },
    [applyRoomData, mergeLobbyFieldsFromRoom]
  );

  const refreshRoom = useCallback(async () => {
    if (!roomId) return;
    const rid = roomId;
    const room = await getRoom(rid);
    if (!room?.id || room.id !== rid || roomIdRef.current !== rid) return;
    applyRoomSnapshot(room);
  }, [roomId, applyRoomSnapshot]);

  /** Тяжее опросного getRoomForSyncPoll: несколько попыток/таймаут — разруливает «залипшие» без переключения VPN. Одновременный один полёт. */
  const runHardRoomRefresh = useCallback(async () => {
    if (!roomId) return;
    if (roomHardRefreshLockRef.current) return;
    roomHardRefreshLockRef.current = true;
    try {
      await refreshRoom();
    } finally {
      roomHardRefreshLockRef.current = false;
    }
  }, [roomId, refreshRoom]);

  const resyncRoomAggressive = useCallback(async () => {
    if (!roomId) return;
    if (roomResyncAggressiveLockRef.current) return;
    roomResyncAggressiveLockRef.current = true;
    try {
      await runHardRoomRefresh();
      setRealtimeHealKey((k) => k + 1);
    } finally {
      roomResyncAggressiveLockRef.current = false;
    }
  }, [roomId, runHardRoomRefresh]);

  /** Новая раздача — узкий случай после deal-complete/startNextDeal: перевешиваем канал + тяжёлый GET. */
  useEffect(() => {
    prevHealDealNumberRef.current = null;
  }, [roomId]);

  useEffect(() => {
    if (!roomId || status !== 'playing') return;
    const dn = canonicalState?.dealNumber;
    if (dn == null || typeof dn !== 'number') return;
    const prev = prevHealDealNumberRef.current;
    prevHealDealNumberRef.current = dn;
    if (prev !== null && dn !== prev) {
      /** LAN: push room_snapshot уже приходит; resubscribe + hard GET давали мигание раздачи. */
      if (lanWs) {
        void refreshRoom();
      } else {
        void runHardRoomRefresh();
        queueMicrotask(() => {
          setRealtimeHealKey((k) => k + 1);
        });
      }
    }
  }, [roomId, status, canonicalState?.dealNumber, lanWs, refreshRoom, runHardRoomRefresh]);

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    const unsub = subscribeToRoom(roomId, applyRoomSnapshot, (status) => {
      if (cancelled) return;
      if (status === 'SUBSCRIBED') {
        void refreshRoom();
        return;
      }
      if (status === 'CLOSED') {
        return;
      }
      if (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT') return;
      if (realtimeErrorDebounceRef.current) clearTimeout(realtimeErrorDebounceRef.current);
      realtimeErrorDebounceRef.current = setTimeout(() => {
        realtimeErrorDebounceRef.current = null;
        if (cancelled) return;
        realtimePollBurstTimeoutsRef.current.forEach((id) => clearTimeout(id));
        realtimePollBurstTimeoutsRef.current = [];
        void refreshRoom();
        const idA = window.setTimeout(() => void refreshRoom(), 400);
        const idB = window.setTimeout(() => void refreshRoom(), 1000);
        realtimePollBurstTimeoutsRef.current.push(idA, idB);
        setRealtimeHealKey((k) => k + 1);
      }, 250);
    });
    unsubRef.current = unsub;
    return () => {
      cancelled = true;
      unsubRef.current = null;
      realtimePollBurstTimeoutsRef.current.forEach((id) => clearTimeout(id));
      realtimePollBurstTimeoutsRef.current = [];
      if (realtimeErrorDebounceRef.current) {
        clearTimeout(realtimeErrorDebounceRef.current);
        realtimeErrorDebounceRef.current = null;
      }
      unsub();
    };
  }, [roomId, applyRoomSnapshot, refreshRoom, realtimeHealKey]);

  /**
   * Без реакции только на ошибки канала WS «молча» висит как у вкл/выкл VPN: переподнимаем периодически канал игры и тянем строку через тяжёлый getRoom.
   */
  useEffect(() => {
    if (!roomId || (status !== 'waiting' && status !== 'playing')) return;
    const HARD_MS = lanWs ? 28_000 : 4600;
    const REALTIME_SELF_HEAL_MS = lanWs ? 60_000 : 26_000;
    const ivHard = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void runHardRoomRefresh();
    }, HARD_MS);
    const ivHeal = window.setInterval(() => {
      setRealtimeHealKey((k) => k + 1);
    }, REALTIME_SELF_HEAL_MS);
    return () => {
      clearInterval(ivHard);
      clearInterval(ivHeal);
    };
  }, [roomId, status, lanWs, runHardRoomRefresh]);

  useEffect(() => {
    if (!roomId) return;
    const raw = (
      typeof navigator !== 'undefined' ? (navigator as unknown as { connection?: { addEventListener?: (t: string, fn: () => void) => void; removeEventListener?: (t: string, fn: () => void) => void } }).connection : undefined
    );
    if (!raw?.addEventListener) return undefined;
    let deb: number | null = null;
    const bump = () => {
      if (deb != null) return;
      deb = window.setTimeout(() => {
        deb = null;
        void runHardRoomRefresh();
        setRealtimeHealKey((k) => k + 1);
      }, 600);
    };
    raw.addEventListener('change', bump);
    return () => {
      if (deb != null) clearTimeout(deb);
      raw.removeEventListener?.('change', bump);
    };
  }, [roomId, runHardRoomRefresh]);

  /**
   * Опрос: в игре — Realtime не всегда доставляет ходы.
   * 280 ms × N игроков + VPN давит лимиты/очередь PostgREST → гонки ревизий, конфликты и «залипший» ход ИИ.
   */
  /** LAN (ws): push room_snapshot + редкий опрос; Supabase: чаще из‑за Realtime/VPN. */
  const ROOM_SYNC_POLL_WAITING_MS = lanWs ? 1200 : 1600;
  const ROOM_SYNC_POLL_PLAYING_MS = lanWs ? 2400 : 760;
  /**
   * Раньше ~420 ms после любого send* гасили каждый тик опроса — при частых ходах ИИ/живых почти всегда «тишина» после lastSendAt,
   * а при заблокированном WebSocket Realtime стол на ПК в LAN не обновлялся без VPN. Жёсткие рассылки уже закрывает grace после записи.
   */
  const ROOM_SYNC_AFTER_SEND_SILENCE_MS = 0;
  const ROOM_SYNC_POLL_SKIP = 0;
  const roomSyncSkipRef = useRef(ROOM_SYNC_POLL_SKIP);
  roomSyncSkipRef.current = ROOM_SYNC_POLL_SKIP;

  const runRoomSyncPollTick = useCallback(() => {
    if (Date.now() - lastSendAtRef.current < roomSyncSkipRef.current) return;
    if (
      ROOM_SYNC_AFTER_SEND_SILENCE_MS > 0 &&
      Date.now() - lastSendAtRef.current < ROOM_SYNC_AFTER_SEND_SILENCE_MS
    ) {
      return;
    }
    if (lanWs && gameWriteInFlightRef.current > 0) return;
    const rid = roomIdRef.current;
    if (!rid) return;
    void getRoomForSyncPoll(rid).then((room) => {
      if (!room?.id || room.id !== rid || roomIdRef.current !== rid) return;
      applyRoomSnapshot(room);
    });
  }, [applyRoomSnapshot, lanWs]);

  useEffect(() => {
    if (!roomId || (status !== 'waiting' && status !== 'playing')) return;
    const period = status === 'waiting' ? ROOM_SYNC_POLL_WAITING_MS : ROOM_SYNC_POLL_PLAYING_MS;
    runRoomSyncPollTick();
    // И в лобби, и в игре: Realtime часто «зелёный», но события не доходят до второго устройства — без опроса ходы не синхронизируются.
    const iv = setInterval(() => runRoomSyncPollTick(), period);
    return () => clearInterval(iv);
  }, [roomId, status, runRoomSyncPollTick]);

  useEffect(() => {
    const prev = prevStatusForPlayingBurstRef.current;
    prevStatusForPlayingBurstRef.current = status;
    if (status !== 'playing' || !roomId) return;
    if (prev === 'playing') return;
    void refreshRoom();
    const ids = [90, 220, 480].map((ms) => window.setTimeout(() => void refreshRoom(), ms));
    return () => ids.forEach((id) => clearTimeout(id));
  }, [status, roomId, refreshRoom]);

  /** После успешного авто-восстановления не дублировать, пока сессия жива. Сбрасывается в leaveRoom и при отсутствии saved. */
  const sessionRestoreOkRef = useRef(false);

  const performSessionRestore = useCallback(
    async (saved: { roomId: string; deviceId: string }): Promise<{ ok: boolean; roomFinished?: boolean; error?: string }> => {
      if (!onlinePlayerId && !lanWs) return { ok: false, error: 'Войдите в аккаунт, чтобы продолжить онлайн-партию.' };
      /** Сессия в storage уже не та (успели выйти/войти в другую комнату) — не трогаем UI и не затираем новую сессию. */
      const storageStillThisRoom = (): boolean => {
        const latest = loadOnlineSession();
        return latest != null && latest.roomId === saved.roomId;
      };
      let room: GameRoomRow | null = null;
      const maxAttempts = 4;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          room = await getRoomQuick(saved.roomId);
        } catch {
          return { ok: false, error: 'Нет связи с сервером. Проверьте интернет и попробуйте снова.' };
        }
        if (room) break;
        if (attempt < maxAttempts - 1) await new Promise((r) => setTimeout(r, 280));
      }
      if (!room) {
        if (storageStillThisRoom()) clearOnlineSession();
        clearLastOnlineParty();
        return { ok: false, error: 'Комната не найдена или сервер не ответил (проверьте вход в аккаунт и RLS в Supabase).' };
      }
      if (room.status === 'finished') {
        if (storageStillThisRoom()) clearOnlineSession();
        clearLastOnlineParty();
        return { ok: false, roomFinished: true };
      }
      const slots = (room.player_slots || []) as PlayerSlot[];
      const meSlot = slots.find((s) => s.userId === onlinePlayerId || s.replacedUserId === onlinePlayerId);
      if (!meSlot) {
        if (storageStillThisRoom()) clearOnlineSession();
        /** Иначе при следующем F5 session пустой, а last-party снова подставляет roomId — вечный возврат в лобби «чужой» комнаты. */
        clearLastOnlineParty();
        return { ok: false, error: 'В этой комнате нет вашего места. Войдите по коду заново.' };
      }
      if (!storageStillThisRoom()) {
        return { ok: false };
      }
      saveOnlineSession(saved.roomId, deviceIdRef.current, room.code ?? undefined);
      applyRoomData(room);
      setMyServerIndex(meSlot.slotIndex);
      removeIgnoredRoomForAutoRestore(saved.roomId);
      return { ok: true };
    },
    [applyRoomData, onlinePlayerId, lanWs]
  );

  // F5 / холодный старт: sessionStorage или lastOnlineParty → performSessionRestore; флаг onlineHydratedFromStorage — чтобы GameTable не поднял офлайн до этого.
  useEffect(() => {
    if (authLoading && !lanWs) return;
    if (!onlinePlayerId && !lanWs) {
      setOnlineHydratedFromStorage(true);
      return;
    }
    const gen = ++onlineHydrateGenRef.current;
    let saved = loadOnlineSession();
    if (saved && isRoomIgnoredForAutoRestore(saved.roomId)) {
      clearOnlineSession();
      clearLastOnlineParty();
      sessionRestoreOkRef.current = false;
      setOnlineHydratedFromStorage(true);
      return;
    }
    /** Облако: без sessionStorage не подмешиваем last-party молча. LAN: камера часто убивает вкладку — восстанавливаем по last-party. */
    if (!saved && lanWs) {
      const last = loadLastOnlineParty();
      if (last?.roomId && !isRoomIgnoredForAutoRestore(last.roomId)) {
        const age = last.savedAt > 0 ? Date.now() - last.savedAt : 0;
        if (age < 4 * 60 * 60 * 1000) {
          saveOnlineSession(last.roomId, deviceIdRef.current, last.code);
          saved = loadOnlineSession();
        }
      }
    }
    if (!saved) {
      sessionRestoreOkRef.current = false;
      setOnlineHydratedFromStorage(true);
      return;
    }
    if (sessionRestoreOkRef.current) {
      setOnlineHydratedFromStorage(true);
      return;
    }
    setOnlineHydratedFromStorage(false);
    void performSessionRestore(saved)
      .then((r) => {
        if (onlineHydrateGenRef.current !== gen) return;
        if (r.ok || r.roomFinished) sessionRestoreOkRef.current = true;
      })
      .catch(() => {
        if (onlineHydrateGenRef.current !== gen) return;
      })
      .finally(() => {
        if (onlineHydrateGenRef.current !== gen) return;
        setOnlineHydratedFromStorage(true);
      });
  }, [authLoading, onlinePlayerId, lanWs, performSessionRestore]);

  /** Пока вы в слотах — держим подсказку с кодом (на случай обхода saveOnlineSession без code). */
  useEffect(() => {
    if (!roomId || !code || !onlinePlayerId) return;
    const inSlots = playerSlots.some((s) => s.userId === onlinePlayerId || s.replacedUserId === onlinePlayerId);
    if (!inSlots) return;
    saveLastOnlineParty(roomId, code);
  }, [roomId, code, onlinePlayerId, playerSlots]);

  // Если в игре есть слот с replacedUserId === наш user.id (ручная пауза) — предложить вернуть слот.
  useEffect(() => {
    if (status !== 'playing' || !roomId || !onlinePlayerId) {
      setPendingReclaimOffer(null);
      return;
    }
    const slot = playerSlots.find((s) => s.replacedUserId === onlinePlayerId);
    if (slot) {
      setPendingReclaimOffer({
        roomId,
        code: code ?? '',
        slotIndex: slot.slotIndex,
        replacedDisplayName: slot.replacedDisplayName ?? slot.displayName ?? 'Игрок',
      });
    } else {
      setPendingReclaimOffer(null);
    }
  }, [status, roomId, code, onlinePlayerId, playerSlots]);

  const createRoom = useCallback(
    async (
      userId: string,
      displayName: string,
      shortLabel?: string,
      roomOpts?: CreateRoomOptions,
    ): Promise<{ ok: boolean; error?: string }> => {
      try {
        clearLastOnlineParty();
        clearOnlineSession();
        sessionRestoreOkRef.current = false;
        setError(null);
        const avatarDataUrl = getPlayerProfile().avatarDataUrl ?? undefined;
        const result = await apiCreateRoom(userId, displayName, shortLabel, avatarDataUrl, roomOpts);
        if ('error' in result) {
          setError(result.error);
          return { ok: false, error: result.error };
        }
        applyRoomData(result.room);
        saveOnlineSession(result.room.id, deviceIdRef.current, result.room.code);
        removeIgnoredRoomForAutoRestore(result.room.id);
        setMyServerIndex(0);
        sessionRestoreOkRef.current = true;
        return { ok: true };
      } catch (e) {
        const msg = formatSupabaseNetworkError(e) || 'Ошибка при создании комнаты.';
        setError(msg);
        return { ok: false, error: msg };
      }
    },
    [applyRoomData]
  );

  const joinRoom = useCallback(
    async (codeInput: string, userId: string, displayName: string, shortLabel?: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        /* Иначе при пустом sessionStorage гидратация подставляет last-party — старый roomId «перебивает» новый код. */
        clearLastOnlineParty();
        clearOnlineSession();
        sessionRestoreOkRef.current = false;
        setError(null);
        const avatarDataUrl = getPlayerProfile().avatarDataUrl ?? undefined;
        const result = await apiJoinRoom(codeInput, userId, displayName, shortLabel, avatarDataUrl);
        if ('error' in result) {
          setError(result.error);
          return { ok: false, error: result.error };
        }
        applyRoomData(result.room);
        setMyServerIndex(result.mySlotIndex);
        saveOnlineSession(result.roomId, deviceIdRef.current, result.room.code);
        removeIgnoredRoomForAutoRestore(result.roomId);
        sessionRestoreOkRef.current = true;
        void getRoom(result.roomId).then((r) => {
          if (r?.id === result.roomId) applyRoomSnapshot(r);
        });
        return { ok: true };
      } catch (e) {
        const msg = formatSupabaseNetworkError(e) || 'Ошибка при входе в комнату.';
        setError(msg);
        return { ok: false, error: msg };
      }
    },
    [applyRoomData, applyRoomSnapshot]
  );

  const recoverJoinIfAlreadyInRoom = useCallback(
    async (codeInput: string): Promise<boolean> => {
      if (!onlinePlayerId) return false;
      clearLastOnlineParty();
      clearOnlineSession();
      sessionRestoreOkRef.current = false;
      const r = await recoverJoinByCode(codeInput, onlinePlayerId);
      if (!r) return false;
      setError(null);
      applyRoomData(r.room);
      setMyServerIndex(r.mySlotIndex);
      saveOnlineSession(r.roomId, deviceIdRef.current, codeInput.trim().toUpperCase());
      removeIgnoredRoomForAutoRestore(r.roomId);
      sessionRestoreOkRef.current = true;
      return true;
    },
    [onlinePlayerId, applyRoomData]
  );

  // --- Остальной код в основном без изменений, просто использует myServerIndex ---
  // ... (leaveRoom, startGame, sendBid, sendPlay и т.д.)
  // ... (Я включу его полностью для простоты копирования)

  /** Тот же канал, что и аватар: update_slots / update_state — у гостей имена доходят стабильнее, чем отдельный RPC. */
  const syncMySlotDisplayName = useCallback(
    async (displayName: string) => {
      if (!roomId || !displayName.trim()) return;
      const trimmed = displayName.trim().slice(0, 17);
      const avatarDataUrl = getPlayerProfile().avatarDataUrl ?? undefined;

      if (status === 'waiting') {
        const fresh = await getRoom(roomId);
        if (!fresh?.id || fresh.id !== roomId) return;
        const slots = ((fresh.player_slots as PlayerSlot[]) || []).slice();
        const idx = slots.findIndex((s) => s.slotIndex === myServerIndex);
        if (idx === -1) return;
        slots[idx] = {
          ...slots[idx],
          displayName: trimmed,
          ...(avatarDataUrl != null && avatarDataUrl !== '' ? { avatarDataUrl } : {}),
        };
        setPlayerSlots(slots);
        const { error: err } = await updateRoomPlayerSlots(roomId, slots);
        if (err) setError(err);
        else applyRoomData({ ...fresh, player_slots: slots });
        return;
      }

      if (status === 'playing' && canonicalState) {
        const slots = playerSlots.slice();
        const idx = slots.findIndex((s) => s.slotIndex === myServerIndex);
        if (idx === -1) return;
        slots[idx] = {
          ...slots[idx],
          displayName: trimmed,
          ...(avatarDataUrl != null && avatarDataUrl !== '' ? { avatarDataUrl } : {}),
        };
        const nextState: GameState = {
          ...canonicalState,
          players: canonicalState.players.map((p, i) =>
            i === myServerIndex ? { ...p, name: trimmed } : p,
          ),
        };
        setPlayerSlots(slots);
        setCanonicalState(nextState);
        canonicalStateRef.current = nextState;
        gameWriteInFlightRef.current += 1;
        try {
          const exp =
            lastAppliedGameStateRevisionRef.current >= 0
              ? lastAppliedGameStateRevisionRef.current
              : undefined;
          const { error: err, room, conflict } = await updateRoomState(roomId, nextState, slots, {
            expectedRevision: exp,
          });
          if (conflict && room) applyRoomData(room);
          else if (!err && room) applyRoomData(room);
          else if (!err) {
            setPlayerSlots(slots);
            setCanonicalState(nextState);
          } else if (err) setError(err);
        } finally {
          gameWriteInFlightRef.current -= 1;
          resetStaleSameRevGraceAfterWrite(gameStateStaleSameRevIgnoreUntilRef);
        }
      }
    },
    [roomId, status, myServerIndex, playerSlots, canonicalState, applyRoomData]
  );

  const syncMySlotAvatar = useCallback(async () => {
    if (!roomId) return;
    const avatarDataUrl = getPlayerProfile().avatarDataUrl ?? undefined;
    if (status === 'waiting') {
      const fresh = await getRoom(roomId);
      if (!fresh?.id || fresh.id !== roomId) return;
      const slots = ((fresh.player_slots as PlayerSlot[]) || []).slice();
      const idx = slots.findIndex((s) => s.slotIndex === myServerIndex);
      if (idx === -1) return;
      slots[idx] = {
        ...slots[idx],
        ...(avatarDataUrl != null && avatarDataUrl !== '' ? { avatarDataUrl } : { avatarDataUrl: null }),
      };
      const { error: err } = await updateRoomPlayerSlots(roomId, slots);
      if (!err) applyRoomData({ ...fresh, player_slots: slots });
    } else if (canonicalState) {
      const slots = playerSlots.slice();
      const idx = slots.findIndex((s) => s.slotIndex === myServerIndex);
      if (idx === -1) return;
      slots[idx] = { ...slots[idx], ...(avatarDataUrl != null && avatarDataUrl !== '' ? { avatarDataUrl } : { avatarDataUrl: null }) };
      gameWriteInFlightRef.current += 1;
      try {
        const exp =
          lastAppliedGameStateRevisionRef.current >= 0 ? lastAppliedGameStateRevisionRef.current : undefined;
        const { error: err, room, conflict } = await updateRoomState(roomId, canonicalState, slots, {
          expectedRevision: exp,
        });
        if (conflict && room?.game_state != null) applyRoomData(room);
        else if (!err && room) applyRoomData(room);
        else if (!err) setPlayerSlots(slots);
      } finally {
        gameWriteInFlightRef.current -= 1;
        resetStaleSameRevGraceAfterWrite(gameStateStaleSameRevIgnoreUntilRef);
      }
    }
  }, [roomId, status, playerSlots, myServerIndex, canonicalState, applyRoomData]);

  const profileSyncedRoomRef = useRef<string | null>(null);
  useEffect(() => {
    if (!roomId || status !== 'waiting') return;
    if (profileSyncedRoomRef.current === roomId) return;
    profileSyncedRoomRef.current = roomId;
    const name = getPlayerProfile().displayName?.trim();
    if (name) void syncMySlotDisplayName(name);
    void syncMySlotAvatar();
  }, [roomId, status, syncMySlotDisplayName, syncMySlotAvatar]);

  const [userLeftTemporarily, setUserLeftTemporarily] = useState(false);
  const [userOnPause, setUserOnPause] = useState(false);
  const [lastPartyHintVersion, setLastPartyHintVersion] = useState(0);

  /** Локальный сброс + очистка sessionStorage и last-party (иначе гидратация снова подтягивает старую комнату). */
  const disconnectLocalOnlineState = useCallback(() => {
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }
    roomIdRef.current = null;
    lastAppliedGameStateRevisionRef.current = -1;
    lastSeenRoomUpdatedAtMsRef.current = 0;
    gameStateStaleSameRevIgnoreUntilRef.current = 0;
    appliedRowMetaKeyRef.current = '';
    setRoomId(null);
    setCode(null);
    setCanonicalState(null);
    setPlayerSlots([]);
    setStatus('idle');
    setError(null);
    setRoomPhase('lobby');
    setHostUserId(null);
    setAbsentUntil(null);
    setAbsentSlotIndex(null);
    setSettlementMode(DEFAULT_CASUAL_SETTLEMENT);
    setBuyIn(null);
    setRoomKind('private');
    setMyServerIndex(0);
    sessionRestoreOkRef.current = false;
    setUserLeftTemporarily(false);
    setUserOnPause(false);
    setOnlineHydratedFromStorage(true);
    prevHealDealNumberRef.current = null;
    clearOnlineSession();
    clearLastOnlineParty();
    markLobbyUiOpen(false);
  }, []);

  const leaveRoom = useCallback(async () => {
    const rid = roomId;
    const uid = onlinePlayerId;
    if (rid && uid) {
      const leaveWallMs = 15_000;
      try {
        const timed = await Promise.race([
          apiLeaveRoom(rid, uid),
          new Promise<{ error: string }>((resolve) =>
            setTimeout(
              () =>
                resolve({
                  error:
                    'Выход из комнаты не завершился вовремя (сеть). Локально сбросили состояние — нажмите «Присоединиться» ещё раз.',
                }),
              leaveWallMs,
            ),
          ),
        ]);
        const leaveErr = timed.error;
        if (leaveErr) {
          setError(leaveErr);
          /* Иначе остаёмся «в комнате» в UI, а localStorage last-party тянет старую игру после входа по новому коду. */
          disconnectLocalOnlineState();
          return;
        }
      } catch (e) {
        setError(formatSupabaseNetworkError(e));
        disconnectLocalOnlineState();
        return;
      }
    }
    disconnectLocalOnlineState();
  }, [roomId, onlinePlayerId, disconnectLocalOnlineState]);

  const stopAutoRestoreForCurrentRoom = useCallback(async () => {
    const rid = roomIdRef.current;
    if (rid) addIgnoredRoomForAutoRestore(rid);
    await leaveRoom();
  }, [leaveRoom]);

  const AI_NAMES = ['ИИ Север', 'ИИ Восток', 'ИИ Юг', 'ИИ Запад'] as const;

  const countHumanSlots = (slots: PlayerSlot[]) =>
    slots.filter((s) => s.userId != null && s.userId !== '').length;
  const humanUserIdsKey = (slots: PlayerSlot[]) =>
    [...new Set(slots.map((s) => s.userId).filter((u): u is string => !!u && u !== ''))].sort().join('|');

  const startGame = useCallback(async (): Promise<boolean> => {
    if (!roomId || myServerIndex !== 0) {
      if (roomId && myServerIndex !== 0) {
        const captain = playerSlots.find((s) => s.slotIndex === 0 && s.userId);
        const who = captain?.displayName?.trim();
        setError(
          who
            ? `Начать игру может ${who} (первый в комнате, слот ведущего).`
            : 'Начать игру может ведущий — первый вошедший в комнату (слот 0).',
        );
      }
      return false;
    }
    /**
     * Один getRoom может отстать (кэш/сеть): хост записывает player_slots только с собой — гости исчезают из БД,
     * стол уходит в «все ИИ», хост гоняет sendState. Два чтения + сравнение с UI и отказ при «потере» людей.
     */
    const uiHumans = countHumanSlots(playerSlots);
    const r1 = await getRoom(roomId);
    if (!r1?.id || r1.id !== roomId) {
      setError('Нет актуального состава комнаты. Проверьте сеть и нажмите «Начать игру» снова.');
      return false;
    }
    /** Комната v2 с панели хоста — нельзя update_state; только start_game на сервере. */
    if (r1.protocol_version === 2) {
      const res = await wsV2StartGame(roomId, onlinePlayerId);
      if (!res.ok) {
        setError(res.error ?? 'Не удалось начать игру (протокол v2)');
        return false;
      }
      const row = await getRoom(roomId);
      if (row) applyRoomData(row);
      setStatus('playing');
      return true;
    }
    await new Promise((r) => setTimeout(r, 110));
    const r2 = await getRoom(roomId);
    if (!r2?.id || r2.id !== roomId) {
      setError('Нет актуального состава комнаты. Проверьте сеть и нажмите «Начать игру» снова.');
      return false;
    }
    const slots1 = ((r1.player_slots as PlayerSlot[]) || []).slice();
    const slots2 = ((r2.player_slots as PlayerSlot[]) || []).slice();
    const c1 = countHumanSlots(slots1);
    const c2 = countHumanSlots(slots2);
    const k1 = humanUserIdsKey(slots1);
    const k2 = humanUserIdsKey(slots2);
    if (c2 < c1) {
      setError('Сервер вернул устаревший состав (меньше игроков). Подождите секунду и нажмите «Начать игру» снова.');
      applyRoomData(r1);
      return false;
    }
    let fresh = r2;
    let sourceSlots = slots2;
    if (c1 !== c2 || k1 !== k2) {
      await new Promise((r) => setTimeout(r, 200));
      const r3 = await getRoom(roomId);
      if (!r3?.id || r3.id !== roomId) {
        setError('Состав комнаты меняется. Подождите и нажмите «Начать игру» снова.');
        return false;
      }
      const slots3 = ((r3.player_slots as PlayerSlot[]) || []).slice();
      const c3 = countHumanSlots(slots3);
      const k3 = humanUserIdsKey(slots3);
      if (c3 !== c2 || k3 !== k2) {
        setError('Состав комнаты ещё синхронизируется. Подождите 1–2 с и нажмите «Начать игру» снова.');
        applyRoomData(r3);
        return false;
      }
      fresh = r3;
      sourceSlots = slots3;
    }
    const srvHumans = countHumanSlots(sourceSlots);
    if (uiHumans > srvHumans) {
      setError(
        'На сервере сейчас меньше игроков, чем у вас на экране (данные отстают). Подождите 2–3 с и нажмите «Начать игру» снова.',
      );
      applyRoomData(fresh);
      return false;
    }
    const humans = sourceSlots.filter((s) => s.userId != null && s.userId !== '');
    if (humans.length < 1) {
      setError('В комнате нет игроков. Обновите экран или зайдите по коду снова.');
      applyRoomData(fresh);
      return false;
    }

    const prevSlots = playerSlots.slice();
    const prevCanonical = canonicalStateRef.current;

    gameWriteInFlightRef.current += 1;
    try {
      const fullSlots: PlayerSlot[] = [];
      const myAvatar = getPlayerProfile().avatarDataUrl ?? undefined;
      for (let i = 0; i < 4; i++) {
        const existing = sourceSlots.find((s) => s.slotIndex === i);
        if (existing) {
          const slot =
            existing.userId === onlinePlayerId && myAvatar
              ? { ...existing, avatarDataUrl: myAvatar }
              : existing;
          fullSlots.push(slot);
        } else {
          fullSlots.push({ slotIndex: i, displayName: AI_NAMES[i], userId: null });
        }
      }
      const names: [string, string, string, string] = [ fullSlots[0].displayName, fullSlots[1].displayName, fullSlots[2].displayName, fullSlots[3].displayName, ];
      let state = createGameOnline(names);
      state = {
        ...state,
        settlementMode,
        buyIn: buyIn ?? undefined,
      };
      state = startDeal(state);
      canonicalStateRef.current = state;
      setPlayerSlots(fullSlots);
      setCanonicalState(state);
      setStatus('playing');

      const exp =
        lastAppliedGameStateRevisionRef.current >= 0 ? lastAppliedGameStateRevisionRef.current : undefined;
      const { error: err, room, conflict } = await updateRoomState(roomId, state, fullSlots, {
        expectedRevision: exp,
        roomPhase: 'playing',
        hostLastSeenAtNow: true,
      });
      if (conflict) {
        void getRoom(roomId).then((r) => {
          if (r) applyRoomData(r);
        });
        setError('Не удалось начать: данные комнаты успели измениться. Нажмите «Начать игру» ещё раз.');
        canonicalStateRef.current = prevCanonical ?? null;
        setPlayerSlots(prevSlots);
        setCanonicalState(prevCanonical ?? null);
        setStatus('waiting');
        return false;
      }
      if (err) {
        setError(err);
        canonicalStateRef.current = prevCanonical ?? null;
        setPlayerSlots(prevSlots);
        setCanonicalState(prevCanonical ?? null);
        setStatus('waiting');
        return false;
      }
      if (room) applyRoomData(room);
      return true;
    } finally {
      gameWriteInFlightRef.current -= 1;
      resetStaleSameRevGraceAfterWrite(gameStateStaleSameRevIgnoreUntilRef);
    }
  }, [roomId, myServerIndex, playerSlots, applyRoomData, settlementMode, buyIn, onlinePlayerId]);

    const sendBid = useCallback(async (bid: number): Promise<boolean> => {
        if (!roomId || !canonicalState) return false;
        const prev = canonicalState;
        gameWriteInFlightRef.current += 1;
        try {
          for (let attempt = 0; attempt < 2; attempt++) {
            const base = canonicalStateRef.current;
            if (!base) return false;
            const next = placeBid(base, myServerIndex, bid);
            canonicalStateRef.current = next;
            setCanonicalState(next);
            lastSendAtRef.current = Date.now();
            const exp =
              lastAppliedGameStateRevisionRef.current >= 0 ? lastAppliedGameStateRevisionRef.current : undefined;
            const { error: err, room, conflict } = await updateRoomState(roomId, next, undefined, {
              expectedRevision: exp,
            });
            if (conflict && room?.game_state != null && attempt === 0) {
              applyRoomData(room);
              continue;
            }
            if (conflict) {
              setError('Заказ не сохранился: стол обновился. Попробуйте снова.');
              canonicalStateRef.current = prev;
              setCanonicalState(prev);
              return false;
            }
            if (err) {
              setError(err);
              canonicalStateRef.current = prev;
              setCanonicalState(prev);
              return false;
            }
            if (room) applyRoomData(room);
            return true;
          }
          return false;
        } finally {
          gameWriteInFlightRef.current -= 1;
          resetStaleSameRevGraceAfterWrite(gameStateStaleSameRevIgnoreUntilRef);
        }
    }, [roomId, canonicalState, myServerIndex, applyRoomData]);

    const sendPlay = useCallback(async (card: Card): Promise<boolean> => {
        if (!roomId || !canonicalState) return false;
        const prev = canonicalState;
        gameWriteInFlightRef.current += 1;
        try {
          for (let attempt = 0; attempt < 2; attempt++) {
            const base = canonicalStateRef.current;
            if (!base) return false;
            let next: GameState;
            try {
              next = playCard(base, myServerIndex, card);
            } catch {
              if (attempt === 0) {
                setError('Сейчас этой картой ходить нельзя.');
                return false;
              }
              setError('Ход не удался после синхронизации стола.');
              canonicalStateRef.current = prev;
              setCanonicalState(prev);
              return false;
            }
            canonicalStateRef.current = next;
            setCanonicalState(next);
            lastSendAtRef.current = Date.now();
            const exp =
              lastAppliedGameStateRevisionRef.current >= 0 ? lastAppliedGameStateRevisionRef.current : undefined;
            const { error: err, room, conflict } = await updateRoomState(roomId, next, undefined, {
              expectedRevision: exp,
            });
            if (conflict && room?.game_state != null && attempt === 0) {
              applyRoomData(room);
              continue;
            }
            if (conflict) {
              setError('Ход не сохранился: другой игрок успел изменить стол. Попробуйте снова.');
              canonicalStateRef.current = prev;
              setCanonicalState(prev);
              return false;
            }
            if (err) {
              setError(err);
              canonicalStateRef.current = prev;
              setCanonicalState(prev);
              return false;
            }
            if (room) applyRoomData(room);
            return true;
          }
          return false;
        } finally {
          gameWriteInFlightRef.current -= 1;
          resetStaleSameRevGraceAfterWrite(gameStateStaleSameRevIgnoreUntilRef);
        }
    }, [roomId, canonicalState, myServerIndex, applyRoomData]);

    const forgetLastOnlineParty = useCallback(() => {
      clearLastOnlineParty();
      setLastPartyHintVersion((v) => v + 1);
    }, []);

    const tryRestoreSession = useCallback(async (): Promise<{ ok: boolean; needReclaim?: boolean; roomFinished?: boolean; error?: string }> => {
      let saved = loadOnlineSession();
      const last = loadLastOnlineParty();
      if (!saved && last?.roomId && !isRoomIgnoredForAutoRestore(last.roomId)) {
        saveOnlineSession(last.roomId, deviceIdRef.current, last.code);
        saved = loadOnlineSession();
      }
      if (saved && isRoomIgnoredForAutoRestore(saved.roomId)) {
        clearOnlineSession();
        return {
          ok: false,
          error:
            'Эта комната отключена от автопродолжения. Войдите по коду через «Онлайн» или дождитесь приглашения.',
        };
      }
      if (!saved) {
        if (last?.roomId && isRoomIgnoredForAutoRestore(last.roomId)) {
          return {
            ok: false,
            error:
              'Эта комната отключена от автопродолжения. Введите код вручную в «Онлайн» или создайте новую комнату.',
          };
        }
        return {
          ok: false,
          error:
            'Нет сохранённой онлайн-сессии. Попросите код у друзей или откройте «Онлайн» — там показывается последняя комната, если вы уже играли.',
        };
      }
      let r = await performSessionRestore(saved);
      if (r.ok || r.roomFinished) {
        sessionRestoreOkRef.current = true;
        return r;
      }
      if (!onlinePlayerId) return r;
      if (last?.code) {
        const recovered = await recoverJoinIfAlreadyInRoom(last.code);
        if (recovered) {
          sessionRestoreOkRef.current = true;
          return { ok: true };
        }
        const prof = getPlayerProfile();
        const name = prof.displayName?.trim() || 'Игрок';
        const shortLabel = user?.email ? user.email.replace(/@.*$/, '').slice(-8) : undefined;
        const avatarDataUrl = prof.avatarDataUrl ?? undefined;
        const jr = await apiJoinRoom(last.code, onlinePlayerId, name, shortLabel, avatarDataUrl);
        if (!('error' in jr)) {
          applyRoomData(jr.room);
          setMyServerIndex(jr.mySlotIndex);
          saveOnlineSession(jr.roomId, deviceIdRef.current, jr.room.code);
          sessionRestoreOkRef.current = true;
          return { ok: true };
        }
      }
      return r;
    }, [performSessionRestore, onlinePlayerId, user?.email, recoverJoinIfAlreadyInRoom, applyRoomData]);

  /** Камера на телефоне уводит вкладку в фон или перезагружает её — подтягиваем комнату при возврате. */
  useEffect(() => {
    const tryRestoreAfterBackground = () => {
      if (document.visibilityState !== 'visible') return;
      if (roomIdRef.current) {
        void refreshRoom();
        return;
      }
      if (!onlinePlayerId && !lanWs) return;
      void tryRestoreSession();
    };
    document.addEventListener('visibilitychange', tryRestoreAfterBackground);
    window.addEventListener('pageshow', tryRestoreAfterBackground);
    window.addEventListener('online', tryRestoreAfterBackground);
    return () => {
      document.removeEventListener('visibilitychange', tryRestoreAfterBackground);
      window.removeEventListener('pageshow', tryRestoreAfterBackground);
      window.removeEventListener('online', tryRestoreAfterBackground);
    };
  }, [refreshRoom, onlinePlayerId, lanWs, tryRestoreSession]);

  useEffect(() => {
    if (roomId && status === 'waiting') markLobbyUiOpen(true);
  }, [roomId, status]);

    // ... Остальной код, который вы можете скопировать из предыдущей версии, он не должен требовать изменений
    // ... confirmReclaim, dismissReclaim, и т.д.
    
    // Я оставлю их здесь для полноты
    const [playerLeftToast, setPlayerLeftToast] = useState<string | null>(null);
    /** Без canonicalState в deps: иначе ссылка меняется на каждом опросе и useEffect в GameTable сбрасывает таймер sendCompleteTrick. */
    const sendCompleteTrick = useCallback(async (): Promise<boolean> => {
      const rid = roomIdRef.current;
      if (!rid) return false;
      const prev = canonicalStateRef.current;
      if (!prev?.pendingTrickCompletion) return true;
      gameWriteInFlightRef.current += 1;
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const base = canonicalStateRef.current;
          if (!base?.pendingTrickCompletion) return true;
          const next = completeTrick(base);
          canonicalStateRef.current = next;
          setCanonicalState(next);
          lastSendAtRef.current = Date.now();
          const exp =
            lastAppliedGameStateRevisionRef.current >= 0 ? lastAppliedGameStateRevisionRef.current : undefined;
          const { error: err, room, conflict } = await updateRoomState(rid, next, undefined, {
            expectedRevision: exp,
          });
          if (conflict && room?.game_state != null && attempt === 0) {
            applyRoomData(room);
            continue;
          }
          if (conflict) {
            setError('Не удалось завершить взятку: стол изменился.');
            canonicalStateRef.current = prev;
            setCanonicalState(prev);
            return false;
          }
          if (err) {
            setError(err);
            canonicalStateRef.current = prev;
            setCanonicalState(prev);
            return false;
          }
          if (room) applyRoomData(room);
          return true;
        }
        return false;
      } finally {
        gameWriteInFlightRef.current -= 1;
        resetStaleSameRevGraceAfterWrite(gameStateStaleSameRevIgnoreUntilRef);
      }
    }, [applyRoomData]);
    const sendStartNextDeal = useCallback(async (): Promise<boolean> => {
      if (!roomId || !canonicalState) return false;
      const prev = canonicalState;
      gameWriteInFlightRef.current += 1;
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const base = canonicalStateRef.current;
          if (!base) return false;
          /** Иначе повторный таймер/гонка клиентов сделает вторую «сдачу» с новым random — мигание карт в торгах. */
          if (base.phase !== 'deal-complete') return false;
          const next = startNextDeal(base);
          if (!next) return false;
          canonicalStateRef.current = next;
          setCanonicalState(next);
          lastSendAtRef.current = Date.now();
          const exp =
            lastAppliedGameStateRevisionRef.current >= 0 ? lastAppliedGameStateRevisionRef.current : undefined;
          const { error: err, room, conflict } = await updateRoomState(roomId, next, undefined, {
            expectedRevision: exp,
          });
          if (conflict && room?.game_state != null && attempt === 0) {
            applyRoomData(room);
            continue;
          }
          if (conflict) {
            setError('Не удалось начать следующую раздачу: стол изменился.');
            canonicalStateRef.current = prev;
            setCanonicalState(prev);
            return false;
          }
          if (err) {
            setError(err);
            canonicalStateRef.current = prev;
            setCanonicalState(prev);
            return false;
          }
          if (room) applyRoomData(room);
          return true;
        }
        return false;
      } finally {
        gameWriteInFlightRef.current -= 1;
        resetStaleSameRevGraceAfterWrite(gameStateStaleSameRevIgnoreUntilRef);
      }
    }, [roomId, canonicalState, applyRoomData]);
    const sendState = useCallback(async (newState: GameState): Promise<boolean> => {
      if (!roomId) return false;
      const prev = canonicalStateRef.current;
      canonicalStateRef.current = newState;
      /** Как sendPlay/sendBid: без этого React-стол отстаёт, latestCanonicalForAiRef в GameTable «застывает» и таймер ИИ шлёт дубликаты/конфликты (на мобильной сети заметнее). */
      setCanonicalState(newState);
      lastSendAtRef.current = Date.now();
      gameWriteInFlightRef.current += 1;
      try {
        const exp =
          lastAppliedGameStateRevisionRef.current >= 0 ? lastAppliedGameStateRevisionRef.current : undefined;
        const { error: err, room, conflict } = await updateRoomState(roomId, newState, undefined, {
          expectedRevision: exp,
        });
        if (conflict && room?.game_state != null) {
          applyRoomData(room);
          return false;
        }
        if (conflict) {
          canonicalStateRef.current = prev;
          setCanonicalState(prev);
          return false;
        }
        if (err) {
          setError(err);
          canonicalStateRef.current = prev;
          setCanonicalState(prev);
          return false;
        }
        if (room) applyRoomData(room);
        else {
          canonicalStateRef.current = newState;
          setCanonicalState(newState);
        }
        return true;
      } finally {
        gameWriteInFlightRef.current -= 1;
        resetStaleSameRevGraceAfterWrite(gameStateStaleSameRevIgnoreUntilRef);
      }
    }, [roomId, applyRoomData]);
    const confirmReclaim = useCallback(async (): Promise<boolean> => {
      if (!roomId || !pendingReclaimOffer || pendingReclaimOffer.roomId !== roomId || !onlinePlayerId) return false;
      const { error: err } = await apiReturnSlotToPlayer(roomId, pendingReclaimOffer.slotIndex);
      if (err) { setError(err); return false; }
      setPendingReclaimOffer(null);
      await heartbeatPresence(roomId, onlinePlayerId);
      const room = await getRoom(roomId);
      if (room) applyRoomData(room);
      return true;
    }, [roomId, pendingReclaimOffer, onlinePlayerId, applyRoomData]);
    const dismissReclaim = useCallback(() => { /* не сбрасываем offer — кнопка «Вернуть игру в свои руки» остаётся доступной */ }, []);
    const returnSlotToPlayer = useCallback(async (slotIndex: number): Promise<boolean> => {
      if (!roomId) return false;
      const { error: err } = await apiReturnSlotToPlayer(roomId, slotIndex);
      if (err) { setError(err); return false; }
      const room = await getRoom(roomId);
      if (room) applyRoomData(room);
      return true;
    }, [roomId, applyRoomData]);
    const takePause = useCallback(async (): Promise<boolean> => {
      if (!roomId || !onlinePlayerId) return false;
      const displayName = playerSlots.find((s) => s.slotIndex === myServerIndex)?.displayName ?? user?.email?.split('@')[0] ?? 'Игрок';
      const shortLabel = user?.email ? user.email.replace(/@.*$/, '').slice(-8) : undefined;
      const { error: err } = await apiTakePause(roomId, onlinePlayerId, displayName.slice(0, 17), shortLabel);
      if (err) { setError(err); return false; }
      setUserOnPause(true);
      const room = await getRoom(roomId);
      if (room) applyRoomData(room);
      return true;
    }, [roomId, onlinePlayerId, user?.email, myServerIndex, playerSlots]);
    const returnFromPause = useCallback(async (): Promise<boolean> => {
      if (!roomId || !onlinePlayerId) {
        setUserOnPause(false);
        return false;
      }
      const slot = playerSlots.find((s) => s.replacedUserId === onlinePlayerId);
      const slotIndex = slot != null ? slot.slotIndex : myServerIndex;
      const ok = await returnSlotToPlayer(slotIndex);
      setUserOnPause(false);
      if (ok) {
        await heartbeatPresence(roomId, onlinePlayerId);
        const room = await getRoom(roomId);
        if (room) applyRoomData(room);
      } else {
        setError('Не удалось вернуть управление. Попробуйте ещё раз или обновите страницу.');
      }
      return ok;
    }, [roomId, onlinePlayerId, myServerIndex, playerSlots, returnSlotToPlayer, getRoom, applyRoomData]);
    const clearPlayerLeftToast = useCallback(() => setPlayerLeftToast(null), []);
    const clearError = useCallback(() => setError(null), []);

  const transferHostTo = useCallback(
    async (
      newHostUserId: string,
      roomIdForRpc?: string | null,
    ): Promise<{ ok: boolean; error?: string }> => {
      const rid = String(roomIdForRpc ?? roomIdRef.current ?? '').trim();
      if (!rid) return { ok: false, error: 'no_room' };
      const res = await transferHostRoom(rid, newHostUserId);
      if (res.error) {
        setError(res.error);
        return { ok: false, error: res.error };
      }
      if (res.room) applyRoomData(res.room);
      void refreshRoom();
      return { ok: true };
    },
    [applyRoomData, refreshRoom],
  );

  const hostResolveAbsentChoice = useCallback(
    async (choice: HostResolveAbsentChoice): Promise<boolean> => {
      if (!roomId) return false;
      const res = await hostResolveAbsent(roomId, choice);
      if (res.error) {
        const c = res.error.toLowerCase();
        setError(
          c === 'not_host' || c.includes('not_host')
            ? 'Сервер не считает вас хостом (сессия устарела). Обновите страницу.'
            : c === 'wrong_room_phase' || c.includes('wrong_room')
              ? 'Решение уже не актуально (фаза комнаты изменилась). Обновите страницу.'
              : c === 'no_room_in_response' || c === 'bad_response'
                ? 'Ответ сервера неполный. Нажмите снова или обновите страницу.'
                : res.error,
        );
        return false;
      }
      if (res.room) applyRoomData(res.room);
      void refreshRoom();
      return true;
    },
    [roomId, applyRoomData, refreshRoom],
  );

  const value: OnlineGameContextValue = {
    status,
    roomId,
    code,
    myServerIndex,
    playerSlots,
    canonicalState,
    displayState,
    error,
    createRoom,
    joinRoom,
    recoverJoinIfAlreadyInRoom,
    leaveRoom,
    refreshRoom,
    resyncRoomAggressive,
    syncMySlotDisplayName,
    syncMySlotAvatar,
    startGame,
    sendBid,
    sendPlay,
    sendCompleteTrick,
    sendStartNextDeal,
    sendState,
    tryRestoreSession,
    forgetLastOnlineParty,
    stopAutoRestoreForCurrentRoom,
    lastPartyHintVersion,
    confirmReclaim,
    dismissReclaim,
    pendingReclaimOffer,
    returnSlotToPlayer,
    userOnPause,
    takePause,
    returnFromPause,
    playerLeftToast,
    clearPlayerLeftToast,
    clearError,
    userLeftTemporarily,
    setUserLeftTemporarily,
    onlineHydratedFromStorage,
    roomPhase,
    hostUserId,
    absentUntil,
    absentSlotIndex,
    transferHostTo,
    hostResolveAbsentChoice,
    settlementMode,
    buyIn,
    roomKind,
    onlinePlayerId,
  };

  return (
    <OnlineGameContext.Provider value={value}>{children}</OnlineGameContext.Provider>
  );
}
