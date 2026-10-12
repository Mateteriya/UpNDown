import { networkInterfaces } from 'node:os';

/**
 * Выше — лучше для Wi‑Fi вечеринки.
 * 172.16–31 часто WSL / Hyper-V / Docker — телефон их не видит
 * (у нас был баг: QR вёл на 172.31… вместо 192.168…).
 */
function scoreLanIp(ip: string): number {
  if (
    ip.startsWith('192.168.56.') ||
    ip.startsWith('192.168.57.') ||
    ip.startsWith('192.168.59.')
  ) {
    return 5;
  }
  const m172 = /^172\.(\d+)\./.exec(ip);
  if (m172) {
    const n = Number(m172[1]);
    if (n >= 16 && n <= 31) return 4; /* WSL/Hyper-V/Docker — в конец */
  }
  if (ip.startsWith('192.168.')) return 100;
  if (ip.startsWith('10.')) return 85;
  return 20;
}

export function listLanIPv4(): string[] {
  const out: string[] = [];
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        out.push(net.address);
      }
    }
  }
  return [...new Set(out)].sort((a, b) => scoreLanIp(b) - scoreLanIp(a));
}

/** IP для QR/гостевых ссылок: явный override или лучший LAN. */
export function pickGuestLanIp(preferred?: string | null): string {
  const ips = listLanIPv4();
  const want = (preferred ?? '').trim();
  if (want && ips.includes(want)) return want;
  return ips[0] ?? '127.0.0.1';
}
