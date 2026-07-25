import { useMemo, useState } from 'react';
import { RulesView, type RulesLayoutMode } from './rules/RulesView';
import '../styles/rules-view.css';
import '../styles/rules-lab.css';

/**
 * Лаборатория «Правила игры»: принудительный Mobile / PC layout + кратко/подробнее.
 * Маршрут: /rules-lab (devMode).
 */
export function RulesLabPage({ onBack }: { onBack: () => void }) {
  const autoLayout = useMemo<RulesLayoutMode>(() => {
    if (typeof window === 'undefined') return 'mobile';
    return window.matchMedia('(min-width: 1025px)').matches ? 'pc' : 'mobile';
  }, []);
  const [layout, setLayout] = useState<RulesLayoutMode>(autoLayout);
  const [detailed, setDetailed] = useState(false);

  return (
    <div className="rules-lab">
      <div className="rules-lab__bar">
        <button type="button" className="rules-lab__bar-btn" onClick={onBack}>
          ← Назад
        </button>
        <span className="rules-lab__bar-title">Лаб: правила</span>
        <div className="rules-lab__bar-modes" role="group" aria-label="Макет">
          <button
            type="button"
            className={`rules-lab__bar-btn${layout === 'mobile' ? ' rules-lab__bar-btn--on' : ''}`}
            onClick={() => setLayout('mobile')}
          >
            Mobile
          </button>
          <button
            type="button"
            className={`rules-lab__bar-btn${layout === 'pc' ? ' rules-lab__bar-btn--on' : ''}`}
            onClick={() => setLayout('pc')}
          >
            PC
          </button>
        </div>
      </div>
      <div className={`rules-lab__stage rules-lab__stage--${layout}`}>
        <RulesView
          layout={layout}
          detailed={detailed}
          onToggleDetailed={() => setDetailed((v) => !v)}
          showLayoutBadge
        />
      </div>
    </div>
  );
}

export default RulesLabPage;
