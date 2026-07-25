import type { RulesParagraph, RulesSection, RulesTextPart } from './rulesContent';
import {
  isRulesLinkPart,
  RULES_DETAILED,
  RULES_HOW_TO_START,
  RULES_PAGE_LEAD,
  RULES_PAGE_TITLE,
  RULES_SHORT,
} from './rulesContent';

export type RulesLayoutMode = 'mobile' | 'pc';

type RulesViewProps = {
  layout: RulesLayoutMode;
  detailed: boolean;
  onToggleDetailed: () => void;
  onBack?: () => void;
  /** Lab: показать бейдж режима */
  showLayoutBadge?: boolean;
};

function RichParagraph({ parts }: { parts: RulesParagraph }) {
  return (
    <p className="rules-view__card-text">
      {parts.map((part: RulesTextPart, i) =>
        isRulesLinkPart(part) ? (
          <a key={`l-${i}`} className="rules-view__link" href={part.href}>
            {part.label}
          </a>
        ) : (
          <span key={`t-${i}`}>{part}</span>
        ),
      )}
    </p>
  );
}

function NeonTitle({ text }: { text: string }) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return (
    <h3 className="rules-view__card-title">
      {words.map((word, i) => (
        <span
          key={`${word}-${i}`}
          className="rules-view__neon-word"
          style={{ ['--rules-neon-i' as string]: i }}
        >
          {word}
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </h3>
  );
}

function SectionCard({ section, accentIndex }: { section: RulesSection; accentIndex: number }) {
  const accent = accentIndex % 3;
  return (
    <article
      className={`rules-view__card rules-view__card--accent-${accent}`}
      id={`rules-section-${section.id}`}
    >
      <div className="rules-view__card-frame">
        <span className="rules-view__card-shine" aria-hidden="true" />
        <div className="rules-view__card-inner">
          <span className="rules-view__card-rail" aria-hidden="true" />
          <div className="rules-view__card-body">
            <NeonTitle text={section.title} />
            {section.body.map((parts, i) => (
              <RichParagraph key={`${section.id}-${i}`} parts={parts} />
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

export function RulesView({
  layout,
  detailed,
  onToggleDetailed,
  onBack,
  showLayoutBadge = false,
}: RulesViewProps) {
  const sections = detailed ? RULES_DETAILED : RULES_SHORT;

  return (
    <div className={`rules-view rules-view--${layout}`}>
      <div className="rules-view__cosmos" aria-hidden="true">
        <span className="rules-view__star rules-view__star--a" />
        <span className="rules-view__star rules-view__star--b" />
        <span className="rules-view__star rules-view__star--c" />
        <span className="rules-view__star rules-view__star--d" />
        <span className="rules-view__star rules-view__star--e" />
        <span className="rules-view__nebula rules-view__nebula--1" />
        <span className="rules-view__nebula rules-view__nebula--2" />
      </div>
      <header className="rules-view__top">
        {onBack ? (
          <button type="button" className="rules-view__back" onClick={onBack}>
            ← Меню
          </button>
        ) : (
          <span className="rules-view__back-spacer" />
        )}
        {showLayoutBadge ? (
          <span className="rules-view__badge">{layout === 'pc' ? 'ПК' : 'Мобилка'}</span>
        ) : null}
      </header>

      <div className="rules-view__shell">
        <div className="rules-view__hero">
          <span className="rules-view__hero-shine" aria-hidden="true" />
          <p className="rules-view__eyebrow">
            <span className="rules-view__neon-word" style={{ ['--rules-neon-i' as string]: 0 }}>
              Up
            </span>
            <span className="rules-view__eyebrow-amp">&amp;</span>
            <span className="rules-view__neon-word" style={{ ['--rules-neon-i' as string]: 1 }}>
              Down
            </span>
          </p>
          <h1 className="rules-view__title">
            {RULES_PAGE_TITLE.split(/\s+/).map((word, i, arr) => (
              <span
                key={`${word}-${i}`}
                className="rules-view__neon-word rules-view__neon-word--hero"
                style={{ ['--rules-neon-i' as string]: i }}
              >
                {word}
                {i < arr.length - 1 ? ' ' : ''}
              </span>
            ))}
          </h1>
          <p className="rules-view__lead">{RULES_PAGE_LEAD}</p>
          <div className="rules-view__mode-row" role="group" aria-label="Объём правил">
            <button
              type="button"
              className={`rules-view__mode-btn${!detailed ? ' rules-view__mode-btn--on' : ''}`}
              onClick={() => detailed && onToggleDetailed()}
              aria-pressed={!detailed}
            >
              Кратко
            </button>
            <button
              type="button"
              className={`rules-view__mode-btn${detailed ? ' rules-view__mode-btn--on' : ''}`}
              onClick={() => !detailed && onToggleDetailed()}
              aria-pressed={detailed}
            >
              Подробнее
            </button>
          </div>
        </div>

        <div className={`rules-view__grid${detailed ? ' rules-view__grid--detailed' : ''}`}>
          {layout === 'pc' && detailed ? (
            <nav className="rules-view__toc" aria-label="Разделы">
              <p className="rules-view__toc-label">Разделы</p>
              <ul>
                {sections.map((s) => (
                  <li key={s.id}>
                    <a href={`#rules-section-${s.id}`}>{s.title}</a>
                  </li>
                ))}
                <li>
                  <a href={`#rules-section-${RULES_HOW_TO_START.id}`}>{RULES_HOW_TO_START.title}</a>
                </li>
              </ul>
            </nav>
          ) : null}

          <div className="rules-view__main">
            {sections.map((section, i) => (
              <SectionCard key={section.id} section={section} accentIndex={i} />
            ))}
            <SectionCard section={RULES_HOW_TO_START} accentIndex={sections.length} />
          </div>
        </div>
      </div>
    </div>
  );
}
