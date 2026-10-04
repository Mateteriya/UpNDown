/**
 * Временная отладка logout при входе в ЛК.
 * Фильтр в консоли: `[auth-debug]`
 * Выключить: localStorage.setItem('updown_auth_debug', '0')
 */

const FLAG = 'updown_auth_debug';

export function isAuthDebugEnabled(): boolean {
  try {
    if (typeof localStorage === 'undefined') return true;
    const v = localStorage.getItem(FLAG);
    if (v === '0' || v === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

export function authDebug(tag: string, detail?: Record<string, unknown>): void {
  if (!isAuthDebugEnabled()) return;
  const t = new Date().toISOString().slice(11, 23);
  if (detail) console.warn(`[auth-debug ${t}] ${tag}`, detail);
  else console.warn(`[auth-debug ${t}] ${tag}`);
}

/** Оценка заполненности localStorage (символы). */
export function authDebugStorageSnapshot(): Record<string, unknown> {
  if (typeof localStorage === 'undefined') return { ok: false };
  try {
    let total = 0;
    const big: Array<{ key: string; len: number }> = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const v = localStorage.getItem(k) ?? '';
      total += k.length + v.length;
      if (v.length >= 8_000 || /^sb-/.test(k) || k.includes('avatar') || k.includes('profile')) {
        big.push({ key: k, len: v.length });
      }
    }
    big.sort((a, b) => b.len - a.len);
    return {
      keys: localStorage.length,
      totalChars: total,
      totalApproxKB: Math.round(total / 1024),
      top: big.slice(0, 12),
      hasAuthToken: big.some((x) => /^sb-[\w-]+-auth-token/.test(x.key)),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function authDebugProbeSetItem(label: string): void {
  if (!isAuthDebugEnabled() || typeof localStorage === 'undefined') return;
  const probeKey = '__updown_auth_probe__';
  try {
    localStorage.setItem(probeKey, 'x'.repeat(2048));
    localStorage.removeItem(probeKey);
    authDebug(`storage.probe.ok (${label})`, authDebugStorageSnapshot());
  } catch (e) {
    authDebug(`storage.probe.FAIL (${label})`, {
      error: e instanceof Error ? e.message : String(e),
      name: e instanceof Error ? e.name : undefined,
      ...authDebugStorageSnapshot(),
    });
  }
}
