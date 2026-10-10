/**
 * Deep link / invite URL → код комнаты и флаги входа.
 * Поддержка: ?code=&autojoin=1, #join?code=, updown://join?code=
 */

export type JoinDeepLink = {
  code: string | null;
  autojoin: boolean;
  ws: string | null;
  transport: 'ws' | null;
  wsProtocol: 'v1' | 'v2' | null;
};

function normalizeCode(raw: string | null | undefined): string | null {
  const c = (raw ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length >= 4 ? c.slice(0, 12) : null;
}

function fromSearchParams(p: URLSearchParams): JoinDeepLink {
  const wsProtocolRaw = p.get('wsProtocol')?.trim().toLowerCase();
  let wsProtocol: 'v1' | 'v2' | null = null;
  if (wsProtocolRaw === 'v2' || wsProtocolRaw === '2') wsProtocol = 'v2';
  if (wsProtocolRaw === 'v1' || wsProtocolRaw === '1') wsProtocol = 'v1';
  const transport = p.get('transport')?.trim().toLowerCase() === 'ws' ? 'ws' : null;
  return {
    code: normalizeCode(p.get('code') ?? p.get('room')),
    autojoin: p.get('autojoin') === '1' || p.get('join') === '1',
    ws: p.get('ws')?.trim() || null,
    transport,
    wsProtocol,
  };
}

/** Разобрать произвольную строку URL / custom scheme / hash. */
export function parseJoinDeepLink(raw: string): JoinDeepLink {
  const empty: JoinDeepLink = {
    code: null,
    autojoin: false,
    ws: null,
    transport: null,
    wsProtocol: null,
  };
  const s = (raw || '').trim();
  if (!s) return empty;

  try {
    if (/^updown:/i.test(s)) {
      const asHttp = s.replace(/^updown:/i, 'https://join.updown.local');
      const u = new URL(asHttp);
      const pathCode = u.pathname.replace(/^\/+/, '').split('/')[0];
      const fromQuery = fromSearchParams(u.searchParams);
      if (!fromQuery.code && pathCode && pathCode.toLowerCase() !== 'join') {
        fromQuery.code = normalizeCode(pathCode);
      }
      if (!fromQuery.code && u.hostname && u.hostname !== 'join.updown.local') {
        fromQuery.code = normalizeCode(u.hostname);
      }
      if (fromQuery.code && !u.searchParams.has('autojoin')) fromQuery.autojoin = true;
      return fromQuery;
    }

    const u = new URL(s, typeof window !== 'undefined' ? window.location.origin : 'http://local');
    const fromQuery = fromSearchParams(u.searchParams);
    if (fromQuery.code) return fromQuery;

    const hash = (u.hash || '').replace(/^#/, '');
    if (hash.startsWith('join')) {
      const q = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
      const pathPart = hash.split('?')[0] || '';
      const segs = pathPart.split('/').filter(Boolean);
      const fromHash = fromSearchParams(new URLSearchParams(q));
      if (!fromHash.code && segs[1]) fromHash.code = normalizeCode(segs[1]);
      if (fromHash.code && !q.includes('autojoin')) fromHash.autojoin = true;
      return fromHash;
    }
    return fromQuery;
  } catch {
    const m = s.match(/[?&#]code=([A-Za-z0-9]+)/i);
    return { ...empty, code: normalizeCode(m?.[1]), autojoin: /autojoin=1/i.test(s) };
  }
}

/** Собрать deep link для установленного клиента. */
export function buildAppJoinDeepLink(code: string, opts?: { autojoin?: boolean }): string {
  const c = normalizeCode(code) || '';
  const auto = opts?.autojoin !== false ? '1' : '0';
  return `updown://join?code=${encodeURIComponent(c)}&autojoin=${auto}`;
}

/** Прочитать join из location (search + hash + полный href). */
export function readJoinDeepLinkFromLocation(
  loc: Pick<Location, 'href' | 'search' | 'hash'> = typeof window !== 'undefined'
    ? window.location
    : { href: '', search: '', hash: '' },
): JoinDeepLink {
  const fromSearch = parseJoinDeepLink(`http://x/${loc.search || ''}`);
  if (fromSearch.code) return fromSearch;
  const fromHash = parseJoinDeepLink(`http://x/${loc.hash || ''}`);
  if (fromHash.code) return fromHash;
  return parseJoinDeepLink(loc.href || '');
}
