import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchRoomChatMessages,
  sendRoomChatMessage,
  subscribeRoomChat,
  type RoomChatMessageRow,
} from '../lib/onlineGameSupabase';

const MAX_BODY = 500;
const FETCH_LIMIT = 120;

export type TableChatDockProps = {
  roomId: string;
  userId: string;
  displayName: string;
  variant: 'mobile' | 'pc';
};

export function TableChatDock({ roomId, userId, displayName, variant }: TableChatDockProps) {
  const [messages, setMessages] = useState<RoomChatMessageRow[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let off = () => {};
    setError(null);
    void (async () => {
      const initial = await fetchRoomChatMessages(roomId, FETCH_LIMIT);
      if (cancelled) return;
      setMessages(initial);
    })();
    off = subscribeRoomChat(roomId, (row) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === row.id)) return prev;
        return [...prev, row].slice(-FETCH_LIMIT);
      });
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [roomId]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, mobileOpen, variant]);

  const onSend = useCallback(async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setError(null);
    const { error: err } = await sendRoomChatMessage(roomId, userId, displayName, t);
    setSending(false);
    if (err) setError(err);
    else setText('');
  }, [roomId, userId, displayName, text, sending]);

  if (variant === 'mobile' && !mobileOpen) {
    return (
      <div className="table-chat-dock table-chat-dock--mobile table-chat-dock--collapsed">
        <button type="button" className="table-chat-toggle" onClick={() => setMobileOpen(true)}>
          Чат
        </button>
      </div>
    );
  }

  return (
    <div
      className={[
        'table-chat-dock',
        variant === 'mobile' ? 'table-chat-dock--mobile' : 'table-chat-dock--pc',
      ].join(' ')}
    >
      {variant === 'mobile' && (
        <div className="table-chat-dock-header">
          <span className="table-chat-dock-title">Чат</span>
          <button
            type="button"
            className="table-chat-dock-collapse"
            onClick={() => setMobileOpen(false)}
            aria-label="Свернуть чат"
          >
            Свернуть
          </button>
        </div>
      )}
      <div ref={listRef} className="table-chat-messages" role="log" aria-live="polite">
        {messages.length === 0 ? (
          <div className="table-chat-empty">Пока нет сообщений</div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={['table-chat-line', m.user_id === userId ? 'table-chat-line--self' : ''].filter(Boolean).join(' ')}
            >
              <span className="table-chat-name">{m.display_name || 'Игрок'}</span>
              <span className="table-chat-body">{m.body}</span>
            </div>
          ))
        )}
      </div>
      {error && <div className="table-chat-error">{error}</div>}
      <div className="table-chat-input-row">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_BODY))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void onSend();
            }
          }}
          placeholder="Сообщение…"
          maxLength={MAX_BODY}
          className="table-chat-input"
          autoComplete="off"
          aria-label="Текст сообщения в чат"
        />
        <button
          type="button"
          className="table-chat-send"
          onClick={() => void onSend()}
          disabled={sending || !text.trim()}
          aria-label="Отправить"
        >
          ➤
        </button>
      </div>
    </div>
  );
}
