import { v4 as uuidv4 } from 'uuid';
import { isWsOnlineTransport } from './onlineTransport';

const DEVICE_ID_KEY = 'updown_device_id';

/** Стабильный id устройства (LAN / офлайн-идентификатор без входа). */
export function getDeviceId(): string {
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

/**
 * Id игрока в комнате.
 * LAN (ws): всегда device id — иначе после входа в Google host_user_id и слоты не совпадают, ИИ не ходит, игрока «выбивает».
 * Облако: Supabase user id, без входа — device id.
 */
export function getOnlinePlayerId(userId: string | null | undefined): string {
  if (isWsOnlineTransport()) return getDeviceId();
  const u = userId?.trim();
  if (u) return u;
  return getDeviceId();
}
