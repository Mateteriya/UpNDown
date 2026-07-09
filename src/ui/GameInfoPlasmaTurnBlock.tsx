import type { CSSProperties, MouseEvent, PointerEvent, ReactNode } from 'react';

import { getDealType } from '../game/GameEngine';

import type { GameInfoBadgeStyle } from '../lib/gameInfoBadgeStyle';



const gameInfoPlasmaScreenLayoutStyle: CSSProperties = {

  display: 'flex',

  flexDirection: 'column',

  alignItems: 'center',

  minWidth: 120,

};



type GameInfoPlasmaTurnBlockProps = {

  skin: GameInfoBadgeStyle;

  phaseStyle?: CSSProperties;

  dealNumber: number;

  tricksInDeal: number;

  showDealMeta: boolean;

  metaTitle?: string;

  metaAriaLabel?: string;

  onMetaClick?: () => void;

  children: ReactNode;

};



function stopBadgeGestureBubble(e: MouseEvent<HTMLButtonElement> | PointerEvent<HTMLButtonElement>) {

  e.stopPropagation();

}



function GameInfoPlasmaDealMeta({

  dealNumber,

  tricksInDeal,

  title,

  ariaLabel,

  onClick,

}: {

  dealNumber: number;

  tricksInDeal: number;

  title?: string;

  ariaLabel?: string;

  onClick?: () => void;

}) {

  const dealType = getDealType(dealNumber);

  const tip = title?.trim() ?? '';

  const label = ariaLabel?.trim() ?? tip;



  const body =

    dealType === 'no-trump' ? (

      <span className="game-info-plasma-deal-meta__mode">Бескозырка</span>

    ) : dealType === 'dark' ? (

      <span className="game-info-plasma-deal-meta__mode">Тёмная</span>

    ) : (

      <>

        <span className="game-info-plasma-deal-meta__label">КАРТ:</span>

        <span className="game-info-plasma-deal-meta__value">{tricksInDeal}</span>

      </>

    );



  return (

    <button

      type="button"

      className="game-info-plasma-deal-meta"

      aria-label={label || undefined}

      data-plasma-meta-tip={tip || undefined}

      onClick={(e) => {

        stopBadgeGestureBubble(e);

        onClick?.();

      }}

      onPointerDown={stopBadgeGestureBubble}

    >

      {body}

    </button>

  );

}



export function GameInfoPlasmaTurnBlock({

  skin,

  phaseStyle,

  dealNumber,

  tricksInDeal,

  showDealMeta,

  metaTitle,

  metaAriaLabel,

  onMetaClick,

  children,

}: GameInfoPlasmaTurnBlockProps) {

  if (skin !== 'plasma') {

    return <div style={{ ...gameInfoBadgeClassicScreenStyle, ...phaseStyle }}>{children}</div>;

  }



  return (

    <div className="game-info-plasma-turn-block">

      {showDealMeta ? (

        <GameInfoPlasmaDealMeta

          dealNumber={dealNumber}

          tricksInDeal={tricksInDeal}

          title={metaTitle}

          ariaLabel={metaAriaLabel}

          onClick={onMetaClick}

        />

      ) : null}

      <div className="game-info-plasma-screen" style={gameInfoPlasmaScreenLayoutStyle}>

        {children}

      </div>

    </div>

  );

}



const gameInfoBadgeClassicScreenStyle: CSSProperties = {

  display: 'flex',

  flexDirection: 'column',

  alignItems: 'center',

  padding: '10px 19px',

  background: 'linear-gradient(180deg, rgba(51, 65, 85, 0.7) 0%, rgba(30, 41, 59, 0.8) 100%)',

  borderRadius: 10,

  border: '1px solid rgba(71, 85, 105, 0.5)',

  minWidth: 120,

  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',

};


