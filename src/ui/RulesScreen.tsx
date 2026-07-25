import { useEffect, useState } from 'react';
import { RulesView, type RulesLayoutMode } from './rules/RulesView';
import '../styles/rules-view.css';

function readLayout(): RulesLayoutMode {
  if (typeof window === 'undefined') return 'mobile';
  return window.matchMedia('(min-width: 1025px)').matches ? 'pc' : 'mobile';
}

/** Прод-экран «Правила игры» (#rules). */
export function RulesScreen({ onBack }: { onBack: () => void }) {
  const [layout, setLayout] = useState<RulesLayoutMode>(readLayout);
  const [detailed, setDetailed] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1025px)');
    const sync = () => setLayout(mq.matches ? 'pc' : 'mobile');
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return (
    <div className="rules-screen">
      <RulesView
        layout={layout}
        detailed={detailed}
        onToggleDetailed={() => setDetailed((v) => !v)}
        onBack={onBack}
      />
    </div>
  );
}

export default RulesScreen;
