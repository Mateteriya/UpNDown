/**
 * Политика «Продолжить / в партию» на главном меню:
 * показывать только когда быстрый возврат реально возможен по локальным якорям.
 * Облако — нужен логин; LAN/WS — достаточно того же deviceId (логин не проверяем здесь).
 */

import { loadOnlineSession } from './onlineSession';
import { loadLastOnlineParty } from './lastOnlineParty';
import { isRoomIgnoredForAutoRestore } from './onlineIgnoredRooms';
import { isWsOnlineTransport } from './onlineTransport';

/** Как в hydrate LAN: «голый» last-party без session старше этого — не держим Continue. */
const LAST_PARTY_ONLY_TTL_MS = 4 * 60 * 60 * 1000;

export function canShowOnlineContinue(opts: { loggedIn: boolean }): boolean {
  const session = loadOnlineSession();
  const last = loadLastOnlineParty();

  const sessionOk =
    session != null &&
    Boolean(session.roomId?.trim()) &&
    !isRoomIgnoredForAutoRestore(session.roomId);

  let lastOk = false;
  if (last?.roomId && !isRoomIgnoredForAutoRestore(last.roomId)) {
    if (sessionOk) {
      lastOk = true;
    } else {
      const age = last.savedAt > 0 ? Date.now() - last.savedAt : 0;
      lastOk = age < LAST_PARTY_ONLY_TTL_MS;
    }
  }

  if (!sessionOk && !lastOk) return false;

  if (!isWsOnlineTransport() && !opts.loggedIn) return false;
  return true;
}
