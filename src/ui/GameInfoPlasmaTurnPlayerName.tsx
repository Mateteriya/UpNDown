import { useRef, type CSSProperties } from 'react';

import { usePlasmaTurnNameFit } from './usePlasmaTurnNameFit';

type GameInfoPlasmaTurnPlayerNameProps = {
  name: string;
  style?: CSSProperties;
  /** After-short: shrink font only when the name overflows at 15px. */
  fitLongName?: boolean;
};

/** Имя на plasma-экранчике («Сейчас ход» / «Заказывает»). */
export function GameInfoPlasmaTurnPlayerName({
  name,
  style,
  fitLongName = false,
}: GameInfoPlasmaTurnPlayerNameProps) {
  const ref = useRef<HTMLSpanElement>(null);
  usePlasmaTurnNameFit(ref, fitLongName, name);

  return (
    <span
      ref={ref}
      style={style}
      className="game-info-value-name game-info-turn-player-name"
    >
      {name}
    </span>
  );
}
