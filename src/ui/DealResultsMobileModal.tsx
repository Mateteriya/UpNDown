import { memo, type LegacyRef, type ReactNode, type Ref } from 'react';

import { dealResultsModalResizingRef } from './dealResultsModalStretch';
import { MobileSouthResizeHandle } from './MobileSouthResizeHandle';



type DealResultsMobileModalStackProps = {

  stackRef: Ref<HTMLDivElement | null>;

  stackMaxPx: number;

  bodyBasePx: number;

  tableBodyMaxAllowedPx: number;

  stretchPx: number;

  stretchMaxPx: number;

  onStretchPxChange: (px: number) => void;

  children: ReactNode;

};



/** Стек модалки: memo — не пересобирается при каждом тике GameTable. */

const DealResultsMobileModalStack = memo(function DealResultsMobileModalStack({

  stackRef,

  stackMaxPx,

  bodyBasePx,

  tableBodyMaxAllowedPx,

  stretchPx,

  stretchMaxPx,

  onStretchPxChange,

  children,

}: DealResultsMobileModalStackProps) {

  return (

    <div

      ref={stackRef as LegacyRef<HTMLDivElement>}

      className="deal-results-modal-mobile-stack"

      style={{

        display: 'flex',

        flexDirection: 'column',

        alignItems: 'center',

        justifyContent: 'flex-start',

        flexShrink: 0,

        alignSelf: 'stretch',

        width: '100%',

        maxHeight: stackMaxPx,

        minHeight: 0,

        boxSizing: 'border-box',

        ['--deal-results-body-base-px' as string]: `${bodyBasePx}px`,

        ['--deal-results-body-max-px' as string]: `${tableBodyMaxAllowedPx}px`,

      }}

    >

      <div

        className="deal-results-modal-panel"

        style={{

          alignSelf: 'stretch',

          flex: '0 0 auto',

          width: '100%',

          maxHeight: stackMaxPx,

          overflow: 'hidden',

          display: 'flex',

          flexDirection: 'column',

          boxSizing: 'border-box',

        }}

      >

        {children}

        <MobileSouthResizeHandle

          stretchPx={stretchPx}

          stretchMaxPx={stretchMaxPx}

          onStretchPxChange={onStretchPxChange}

          visible

          handleClassName="game-mobile-short-south-resize-handle--deal-results-modal"

          capsuleVariant="deal-results-modal"

          ariaHints={{

            downOnly: 'Можно потянуть только вниз, чтобы увеличить высоту таблицы',

            upOnly: 'Можно потянуть только вверх, чтобы уменьшить высоту',

            both: 'Потяните вверх или вниз, чтобы изменить высоту таблицы',

            none: 'Изменить высоту таблицы «Результаты»',

          }}

        />

      </div>

    </div>

  );

});



export type DealResultsMobileModalOverlayProps = {

  stackRef: Ref<HTMLDivElement | null>;

  columnRef: Ref<HTMLDivElement | null>;

  stackMaxPx: number;

  bodyBasePx: number;

  tableBodyMaxAllowedPx: number;

  stretchPx: number;

  stretchMaxPx: number;

  onStretchPxChange: (px: number) => void;

  onClose: () => void;

  onEscape: () => void;

  onBackdropPointerDown: React.PointerEventHandler<HTMLDivElement>;

  onBackdropPointerUp: React.PointerEventHandler<HTMLDivElement>;

  tableContent: ReactNode;

};



function overlayPropsEqual(

  prev: DealResultsMobileModalOverlayProps,

  next: DealResultsMobileModalOverlayProps,

): boolean {
  if (dealResultsModalResizingRef.current) return true;

  return (
    prev.stackMaxPx === next.stackMaxPx &&

    prev.bodyBasePx === next.bodyBasePx &&

    prev.tableBodyMaxAllowedPx === next.tableBodyMaxAllowedPx &&

    prev.stretchPx === next.stretchPx &&

    prev.stretchMaxPx === next.stretchMaxPx &&

    prev.tableContent === next.tableContent &&

    prev.onStretchPxChange === next.onStretchPxChange &&

    prev.onClose === next.onClose &&

    prev.onEscape === next.onEscape &&

    prev.onBackdropPointerDown === next.onBackdropPointerDown &&

    prev.onBackdropPointerUp === next.onBackdropPointerUp

  );

}



/** Оверлей модалки «Результаты» (моб.): изолирован от ре-рендеров игрового стола. */

export const DealResultsMobileModalOverlay = memo(function DealResultsMobileModalOverlay({

  stackRef,

  columnRef,

  stackMaxPx,

  bodyBasePx,

  tableBodyMaxAllowedPx,

  stretchPx,

  stretchMaxPx,

  onStretchPxChange,

  onEscape,

  onBackdropPointerDown,

  onBackdropPointerUp,

  tableContent,

}: DealResultsMobileModalOverlayProps) {

  return (

    <div

      className="deal-results-modal-overlay-mobile game-table-root viewport-mobile"

      role="dialog"

      aria-modal="true"

      aria-label="Результаты раздач"

      style={{

        position: 'fixed',

        inset: 0,

        zIndex: 9999,

        display: 'flex',

        flexDirection: 'column',

        justifyContent: 'flex-start',

        alignItems: 'stretch',

        overflow: 'hidden',

        pointerEvents: 'auto',

      }}

      onKeyDown={(e) => {

        if (e.key === 'Escape') onEscape();

      }}

    >

      <div

        aria-hidden

        className="deal-results-modal-backdrop"

        onPointerDown={onBackdropPointerDown}

        onPointerUp={onBackdropPointerUp}

      />

      <div

        ref={columnRef as LegacyRef<HTMLDivElement>}

        style={{

          position: 'relative',

          zIndex: 2,

          width: '100%',

          minWidth: 0,

          maxHeight: '100%',

          overflow: 'visible',

          display: 'flex',

          flexDirection: 'column',

          alignItems: 'stretch',

          justifyContent: 'flex-start',

          padding: 'max(6px, env(safe-area-inset-top, 0px)) 0 max(0px, env(safe-area-inset-bottom, 0px))',

          margin: 0,

          flex: '0 0 auto',

          alignSelf: 'stretch',

          touchAction: 'manipulation',

          boxSizing: 'border-box',

        }}

        onPointerDown={(e) => e.stopPropagation()}

        onPointerUp={(e) => e.stopPropagation()}

      >

        <DealResultsMobileModalStack

          stackRef={stackRef}

          stackMaxPx={stackMaxPx}

          bodyBasePx={bodyBasePx}

          tableBodyMaxAllowedPx={tableBodyMaxAllowedPx}

          stretchPx={stretchPx}

          stretchMaxPx={stretchMaxPx}

          onStretchPxChange={onStretchPxChange}

        >

          {tableContent}

        </DealResultsMobileModalStack>

      </div>

    </div>

  );

}, overlayPropsEqual);


