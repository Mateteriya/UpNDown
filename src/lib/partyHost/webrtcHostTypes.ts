/**
 * Контракт WebRTC host-peer (фаза 3 offline party).
 * Транспорт: RTCDataChannel; логика комнаты — у host.
 */

export type PartyHostTransport = 'lan-ws' | 'webrtc-host-peer';

export type WebrtcHostWireMessage =
  | { type: 'hello'; protocol: 'updown-party/1'; role: 'host' | 'guest'; name?: string }
  | { type: 'room_snapshot'; payload: unknown }
  | { type: 'player_action'; action: 'bid' | 'play' | 'chat'; payload: unknown }
  | { type: 'error'; code: string; message?: string };

export type WebrtcHostSessionStatus =
  | 'idle'
  | 'creating_offer'
  | 'waiting_answer'
  | 'connecting'
  | 'open'
  | 'closed'
  | 'error';

export type WebrtcSignalingBundle = {
  /** SDP offer/answer (base64 или raw) для QR / ручного обмена в LAN. */
  sdp: string;
  roomCodeHint?: string;
};
