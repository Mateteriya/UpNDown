/**
 * Выбор числа игроков перед новой офлайн-партией.
 */

export type OfflinePlayerCount = 3 | 4;

export interface OfflinePlayerCountModalProps {
  onCancel: () => void;
  onChoose: (count: OfflinePlayerCount) => void;
}

export function OfflinePlayerCountModal({ onCancel, onChoose }: OfflinePlayerCountModalProps) {
  return (
    <div
      className="offline-resume-modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
      role="presentation"
    >
      <div
        className="offline-resume-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="offline-player-count-title"
        aria-describedby="offline-player-count-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="offline-resume-modal-card__glow" aria-hidden />
        <p className="offline-resume-modal-card__eyebrow" aria-hidden>
          Офлайн · новая партия
        </p>
        <h2 id="offline-player-count-title" className="offline-resume-modal-card__title">
          Сколько игроков за столом?
        </h2>
        <p id="offline-player-count-desc" className="offline-resume-modal-card__lead">
          Вы и ИИ. На троих — без места «Восток», цикл раздач 1→12.
        </p>
        <div className="offline-resume-modal-actions">
          <button
            type="button"
            className="offline-resume-modal-btn offline-resume-modal-btn--primary"
            onClick={() => onChoose(4)}
          >
            4 игрока
          </button>
          <button
            type="button"
            className="offline-resume-modal-btn offline-resume-modal-btn--secondary"
            onClick={() => onChoose(3)}
          >
            3 игрока
          </button>
          <button type="button" className="offline-resume-modal-btn offline-resume-modal-btn--ghost" onClick={onCancel}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
