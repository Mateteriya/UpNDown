import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  countMobileSouthLandscapeNameChars,
  getMobileSouthLandscapeNameFontPx,
} from './mobileSouthLandscapeNameLayout';

type MobileSouthLandscapePlayerNameProps = {
  name: string;
  chatBody: string | null;
  chatKey: number;
  nameClassName: string;
  baseNameStyle: CSSProperties;
  title: string;
  /** Моб. landscape · Юг: до 2 строк, без роста высоты панели. */
  twoLine?: boolean;
  /** ~9% меньше при >4 заглавных в исходном имени (см. playerDisplayNameFormat). */
  fontScale?: number;
};

const CHAT_PHASE_MS = 3800;

function buildLandscapeNameStyle(baseNameStyle: CSSProperties, fontPx: number): CSSProperties {
  return {
    ...baseNameStyle,
    fontSize: fontPx,
    lineHeight: 1.05,
    ['--south-landscape-name-font-px' as string]: `${fontPx}px`,
  };
}

function AdaptiveNameShell({
  fontPx,
  twoLine,
  children,
}: {
  fontPx: number;
  twoLine?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={[
        'user-south-landscape-name-adaptive',
        twoLine ? 'user-south-landscape-name-adaptive--two-line' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ ['--south-landscape-name-font-px' as string]: `${fontPx}px` }}
    >
      {children}
    </span>
  );
}

/**
 * Моб. landscape · Юг: адаптивный размер имени (≤8 — полный, 9–13 — меньше, ≥14 — минимальный)
 * и чередование с последним сообщением чата. Без бегущей строки — имя статично.
 */
export function MobileSouthLandscapePlayerName({
  name,
  chatBody,
  chatKey,
  nameClassName,
  baseNameStyle,
  title,
  twoLine = false,
  fontScale = 1,
}: MobileSouthLandscapePlayerNameProps) {
  const [phase, setPhase] = useState(0);
  const charCount = countMobileSouthLandscapeNameChars(name);
  const baseFontPx = getMobileSouthLandscapeNameFontPx(charCount);
  const fontPx = (twoLine ? Math.max(13, baseFontPx + 2) : baseFontPx) * fontScale;
  const nameStyle = useMemo(
    () => buildLandscapeNameStyle(baseNameStyle, fontPx),
    [baseNameStyle, fontPx],
  );

  useEffect(() => {
    if (!chatBody?.trim()) {
      setPhase(0);
      return;
    }
    setPhase(0);
    const id = window.setInterval(() => setPhase(p => (p + 1) % 2), CHAT_PHASE_MS);
    return () => window.clearInterval(id);
  }, [chatBody, chatKey]);

  const nameNode = (
    <span className={nameClassName} style={nameStyle} title={title}>
      {name}
    </span>
  );

  if (!chatBody?.trim()) {
    return (
      <AdaptiveNameShell fontPx={fontPx} twoLine={twoLine}>
        {nameNode}
      </AdaptiveNameShell>
    );
  }

  const showChat = phase % 2 === 1;
  const chatTypography: CSSProperties = {
    fontSize: fontPx,
    fontWeight: nameStyle.fontWeight,
    fontFamily: nameStyle.fontFamily,
    color: nameStyle.color,
    lineHeight: nameStyle.lineHeight ?? 1,
  };

  return (
    <AdaptiveNameShell fontPx={fontPx} twoLine={twoLine && !showChat}>
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
          nameNode
        )}
      </span>
    </AdaptiveNameShell>
  );
}
