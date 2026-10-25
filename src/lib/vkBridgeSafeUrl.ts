/** Без supabase — для лёгкого vkBridgeBoot / auth-callback. */

export const VK_LAN_FINAL_RET_KEY = 'updown_vk_lan_final_ret';

export function isSafeLanAuthCallbackUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (!/auth-callback\.html/i.test(u.pathname)) return false;
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1') return true;
    if (h === 'up2down.ru' || h === 'www.up2down.ru') return true;
    if (h === 'up2down.online' || h === 'www.up2down.online') return true;
    if (/\.vercel\.app$/i.test(h)) return true;
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(h)) {
      if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
      if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
      const m = /^172\.(\d{1,2})\.\d{1,3}\.\d{1,3}$/.exec(h);
      if (m) {
        const n = Number(m[1]);
        if (n >= 16 && n <= 31) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
