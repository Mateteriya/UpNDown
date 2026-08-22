import { v4 as uuidv4 } from 'uuid';

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
 * Со входом: Supabase user id (= JWT sub на WS-сервере).
 * Без входа: device id (LAN / гость; на VPS с WS_AUTH=required нужен логин).
 */
export function getOnlinePlayerId(userId: string | null | undefined): string {
  const u = userId?.trim();
  if (u) return u;
  return getDeviceId();
}
