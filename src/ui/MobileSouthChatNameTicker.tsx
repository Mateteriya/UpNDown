import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';

type MobileSouthChatNameTickerProps = {
  name: string;
  chatBody: string | null;
  /** Меняется при новой отправке — сброс фазы и перезапуск бегущей строки */
  chatKey: number;
  nameClassName: string;
  nameStyle: CSSProperties;
  title: string;
};

const PHASE_MS = 3800;

/**
 * Моб. панель Юга: на месте имени по очереди имя и последнее своё сообщение чата (бегущая строка при длинном тексте).
 */
export function MobileSouthChatNameTicker({
  name,
  chatBody,
  chatKey,
  nameClassName,
  nameStyle,
  title,
}: MobileSouthChatNameTickerProps) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!chatBody?.trim()) {
      setPhase(0);
      return;
    }
    setPhase(0);
    const id = window.setInterval(() => setPhase((p) => (p + 1) % 2), PHASE_MS);
    return () => window.clearInterval(id);
  }, [chatBody, chatKey]);

  if (!chatBody?.trim()) {
    return (
      <span className={nameClassName} style={nameStyle} title={title}>
        {name}
      </span>
    );
  }

  const showChat = phase % 2 === 1;
  const chatTypography: CSSProperties = {
    fontSize: nameStyle.fontSize,
    fontWeight: nameStyle.fontWeight,
    fontFamily: nameStyle.fontFamily,
    color: nameStyle.color,
    lineHeight: nameStyle.lineHeight ?? 1.25,
  };

  return (
    <span className="mobile-south-name-chat-slot" title={title}>
      {showChat ? (
        <span
          className="mobile-south-name-chat-marquee"
          style={chatTypography}
          key={`${chatKey}-${chatBody.slice(0, 24)}`}
        >
          <span className="mobile-south-name-chat-marquee__track">
            <span className="mobile-south-name-chat-marquee__text">{chatBody}</span>
            <span className="mobile-south-name-chat-marquee__gap" aria-hidden>
              {' · '}
            </span>
            <span className="mobile-south-name-chat-marquee__text">{chatBody}</span>
          </span>
        </span>
      ) : (
        <span className={nameClassName} style={nameStyle}>
          {name}
        </span>
      )}
    </span>
  );
}
