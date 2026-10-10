/**
 * Заглушка WebRTC host-сессии — API фиксируем, реализацию наращиваем отдельно.
 * Сейчас вечеринка = LAN WS на ПК (см. docs/OFFLINE-PARTY.md).
 */

import type {
  WebrtcHostSessionStatus,
  WebrtcHostWireMessage,
  WebrtcSignalingBundle,
} from './webrtcHostTypes';

export type WebrtcHostSessionCallbacks = {
  onStatus?: (s: WebrtcHostSessionStatus) => void;
  onMessage?: (msg: WebrtcHostWireMessage) => void;
  onError?: (err: Error) => void;
};

export class WebrtcHostSession {
  private status: WebrtcHostSessionStatus = 'idle';
  private readonly cb: WebrtcHostSessionCallbacks;

  constructor(callbacks: WebrtcHostSessionCallbacks = {}) {
    this.cb = callbacks;
  }

  getStatus(): WebrtcHostSessionStatus {
    return this.status;
  }

  private setStatus(s: WebrtcHostSessionStatus): void {
    this.status = s;
    this.cb.onStatus?.(s);
  }

  /** Создать SDP offer для QR (ещё не реализовано — бросает). */
  async createHostOffer(): Promise<WebrtcSignalingBundle> {
    this.setStatus('creating_offer');
    this.setStatus('error');
    const err = new Error(
      'WebRTC host-peer ещё в разработке. Используйте ПК-хост + Wi‑Fi (docs/OFFLINE-PARTY.md).',
    );
    this.cb.onError?.(err);
    throw err;
  }

  async acceptGuestAnswer(_bundle: WebrtcSignalingBundle): Promise<void> {
    this.setStatus('error');
    throw new Error('WebRTC acceptAnswer: not implemented');
  }

  send(_msg: WebrtcHostWireMessage): void {
    throw new Error('WebRTC send: not implemented');
  }

  close(): void {
    this.setStatus('closed');
  }
}

export function isWebrtcPartyHostAvailable(): boolean {
  return false;
}
