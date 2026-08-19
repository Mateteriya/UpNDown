/**
 * Текстовый протокол чата без отдельных колонок БД:
 * реакции (скрытые control-строки) и адресация `→ Имя:`.
 */

export const CHAT_REACT_MARK = '\u2063UDREACT\u2063';
export const CHAT_REACT_SEP = '\u2063';

export type ChatReactionOp = 'set' | 'clear';

export type ChatReactionPayload = {
  op: ChatReactionOp;
  targetId: string;
  emoji: string;
};

export type ChatReactionChip = {
  emoji: string;
  count: number;
  mine: boolean;
};

export type AddressedChatBody = {
  to: string;
  text: string;
};

const ADDRESS_RE = /^→\s*(.{1,40}?):\s*([\s\S]*)$/;

export function buildChatReactionBody(
  targetId: string,
  emoji: string,
  op: ChatReactionOp,
): string {
  const id = targetId.trim();
  const emo = emoji.trim().slice(0, 16);
  return `${CHAT_REACT_MARK}${op === 'set' ? '+' : '-'}${CHAT_REACT_SEP}${id}${CHAT_REACT_SEP}${emo}`;
}

export function parseChatReactionBody(body: string): ChatReactionPayload | null {
  if (!body.startsWith(CHAT_REACT_MARK)) return null;
  const rest = body.slice(CHAT_REACT_MARK.length);
  const sep = rest.indexOf(CHAT_REACT_SEP);
  if (sep < 1) return null;
  const opRaw = rest.slice(0, sep);
  const afterOp = rest.slice(sep + CHAT_REACT_SEP.length);
  const idSep = afterOp.indexOf(CHAT_REACT_SEP);
  if (idSep < 1) return null;
  const targetId = afterOp.slice(0, idSep).trim();
  const emoji = afterOp.slice(idSep + CHAT_REACT_SEP.length).trim();
  if ((opRaw !== '+' && opRaw !== '-') || !targetId || !emoji) return null;
  return { op: opRaw === '+' ? 'set' : 'clear', targetId, emoji };
}

export function isChatReactionControlBody(body: string): boolean {
  return parseChatReactionBody(body) !== null;
}

export function aggregateChatReactions(
  messages: ReadonlyArray<{ user_id: string; body: string }>,
  selfUserId: string,
): Map<string, ChatReactionChip[]> {
  const byTarget = new Map<string, Map<string, string>>();
  for (const m of messages) {
    const p = parseChatReactionBody(m.body);
    if (!p) continue;
    let users = byTarget.get(p.targetId);
    if (!users) {
      users = new Map();
      byTarget.set(p.targetId, users);
    }
    if (p.op === 'clear') {
      if (users.get(m.user_id) === p.emoji) users.delete(m.user_id);
    } else {
      users.set(m.user_id, p.emoji);
    }
  }
  const out = new Map<string, ChatReactionChip[]>();
  for (const [targetId, users] of byTarget) {
    const counts = new Map<string, { count: number; mine: boolean }>();
    for (const [uid, emoji] of users) {
      const cur = counts.get(emoji) ?? { count: 0, mine: false };
      cur.count += 1;
      if (uid === selfUserId) cur.mine = true;
      counts.set(emoji, cur);
    }
    const chips: ChatReactionChip[] = [];
    for (const [emoji, c] of counts) {
      chips.push({ emoji, count: c.count, mine: c.mine });
    }
    chips.sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
    if (chips.length) out.set(targetId, chips);
  }
  return out;
}

export function myReactionEmoji(
  chips: ReadonlyArray<ChatReactionChip> | undefined,
): string | null {
  return chips?.find((c) => c.mine)?.emoji ?? null;
}

export function parseAddressedChatBody(body: string): AddressedChatBody | null {
  const m = ADDRESS_RE.exec(body);
  if (!m) return null;
  const to = m[1].trim();
  if (!to) return null;
  return { to, text: m[2] };
}

export function buildAddressedChatBody(to: string, text: string, maxTotal: number): string {
  const name = to.trim().slice(0, 28) || 'Игрок';
  const prefix = `→ ${name}: `;
  const rest = text.trimStart();
  if (rest.startsWith(prefix) || rest.startsWith(`→ ${name}:`)) {
    return rest.slice(0, maxTotal);
  }
  return `${prefix}${text}`.slice(0, maxTotal);
}

/** Текст в буфер: без служебной цитаты и без префикса адресата. */
export function chatBodyForClipboard(body: string): string {
  const sep = '\n—\n';
  const sepIdx = body.indexOf(sep);
  const raw = (sepIdx >= 0 ? body.slice(sepIdx + sep.length) : body).trim();
  const addr = parseAddressedChatBody(raw);
  return (addr ? addr.text : raw).trim();
}

/** Поиск в ленте: имя, сырое тело и «чистый» текст (без адреса/цитаты). */
export function messageMatchesChatSearch(
  msg: { display_name?: string | null; body: string },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const name = (msg.display_name || '').toLowerCase();
  const body = (msg.body || '').toLowerCase();
  const clip = chatBodyForClipboard(msg.body || '').toLowerCase();
  return name.includes(q) || body.includes(q) || clip.includes(q);
}

export type ChatSearchHighlightPart = { t: string; hit: boolean };

/** Разбивка текста для подсветки вхождений запроса (без regex). */
export function splitChatSearchHighlight(text: string, query: string): ChatSearchHighlightPart[] {
  const q = query.trim();
  if (!q || !text) return [{ t: text, hit: false }];
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const out: ChatSearchHighlightPart[] = [];
  let i = 0;
  while (i < text.length) {
    const idx = lower.indexOf(needle, i);
    if (idx < 0) {
      out.push({ t: text.slice(i), hit: false });
      break;
    }
    if (idx > i) out.push({ t: text.slice(i, idx), hit: false });
    out.push({ t: text.slice(idx, idx + needle.length), hit: true });
    i = idx + needle.length;
  }
  return out;
}
