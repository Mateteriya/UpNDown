import { useRef, type CSSProperties } from 'react';

import { usePlasmaTurnNameFit } from './usePlasmaTurnNameFit';

type GameInfoPlasmaTurnPlayerNameProps = {
  name: string;
  style?: CSSProperties;
  /** After-short: shrink font only when the name overflows at base size. */
  fitLongName?: boolean;
};

/** Имя на plasma-экранчике («Сейчас ход» / «Заказывает»). Перелив — plasma-turn-name-flow.css. */
export function GameInfoPlasmaTurnPlayerName({
  name,
  style,
  fitLongName = false,
}: GameInfoPlasmaTurnPlayerNameProps) {
  const ref = useRef<HTMLSpanElement>(null);
  usePlasmaTurnNameFit(ref, fitLongName, name);

  /* Inline color ломает CSS chroma — оставляем только типографику. */
  const { color: _c, WebkitTextFillColor: _w, ...safeStyle } = (style ?? {}) as CSSProperties & {
    WebkitTextFillColor?: string;
  };

  return (
    <span ref={ref} style={safeStyle} className="game-info-value-name game-info-turn-player-name">
      {name}
    </span>
  );
}
