/**
 * Мобильное меню → «Оффлайн с ИИ»: выбор продолжить сохранённую партию или начать новую.
 */

export interface OfflineResumeChoiceModalProps {
  onCancel: () => void;
  onContinue: () => void;
  onStartNew: () => void;
}

export function OfflineResumeChoiceModal({ onCancel, onContinue, onStartNew }: OfflineResumeChoiceModalProps) {
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
        aria-labelledby="offline-resume-modal-title"
        aria-describedby="offline-resume-modal-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="offline-resume-modal-card__glow" aria-hidden />
        <p className="offline-resume-modal-card__eyebrow" aria-hidden>
          Офлайн · сохранение
        </p>
        <h2 id="offline-resume-modal-title" className="offline-resume-modal-card__title">
          Продолжить незаконченную партию?
        </h2>
        <p id="offline-resume-modal-desc" className="offline-resume-modal-card__lead">
          Найдена сохранённая офлайн‑партия на этом устройстве.
        </p>
        <div className="offline-resume-modal-actions">
          <button
            type="button"
            className="offline-resume-modal-btn offline-resume-modal-btn--primary"
            onClick={onContinue}
          >
            Продолжить
          </button>
          <button
            type="button"
            className="offline-resume-modal-btn offline-resume-modal-btn--secondary"
            onClick={onStartNew}
          >
            Начать новую
          </button>
          <button type="button" className="offline-resume-modal-btn offline-resume-modal-btn--ghost" onClick={onCancel}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
