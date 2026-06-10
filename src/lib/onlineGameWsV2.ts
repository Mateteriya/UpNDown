/**
 * Протокол v2 — server-authoritative команды (обёртка над onlineGameWs).
 */

export type { GameStatePush } from './onlineGameWs';

export {
  wsSubscribeToGameState,
  wsV2StartGame,
  wsV2PlaceBid,
  wsV2PlayCard,
  wsV2TakePause,
  wsV2ReturnFromPause,
  wsV2HostReturnSlot,
  wsV2TransferHost,
  wsV2HostResolveAbsent,
} from './onlineGameWs';
