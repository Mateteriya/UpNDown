/** Подвал космических тултипов: свитч «убрать подсказку» + «Понятно». */

type MenuMapTipDismissProps = {
  onDismiss: () => void;
  /** Скрыть только этот пунктир (glyph / pill / guest) и закрыть тултип. */
  onHideHint: () => void;
  dismissLabel?: string;
  hideLabel?: string;
};

export function MenuMapTipDismiss({
  onDismiss,
  onHideHint,
  dismissLabel = 'Понятно',
  hideLabel = 'убрать подсказку',
}: MenuMapTipDismissProps) {
  return (
    <div className="menu-map-tip-footer">
      <button
        type="button"
        className="menu-map-tip-hide"
        role="switch"
        aria-checked={false}
        aria-label={hideLabel}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          const btn = e.currentTarget;
          btn.setAttribute('aria-checked', 'true');
          window.setTimeout(() => onHideHint(), 200);
        }}
      >
        <span className="menu-map-tip-hide__track" aria-hidden="true">
          <span className="menu-map-tip-hide__thumb" />
        </span>
        <span className="menu-map-tip-hide__label">{hideLabel}</span>
      </button>
      <button
        type="button"
        className="menu-map-tip-dismiss"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onDismiss();
        }}
      >
        <span className="menu-map-tip-dismiss__label">{dismissLabel}</span>
      </button>
    </div>
  );
}
