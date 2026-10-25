/**
 * Список уровней сложности одного бота — общий для портала (клик по имени) и панели по аватарке.
 */

import type { AIDifficulty } from '../game/GameEngine';
import { useT } from '../i18n';

const ROWS: {
  id: AIDifficulty;
  titleKey: 'ai.novice' | 'ai.amateur' | 'ai.expert';
  hintKey: 'ai.noviceHint' | 'ai.amateurHint' | 'ai.expertHint';
  ballClass: string;
}[] = [
  {
    id: 'novice',
    titleKey: 'ai.novice',
    hintKey: 'ai.noviceHint',
    ballClass: 'ai-difficulty-ball--novice',
  },
  {
    id: 'amateur',
    titleKey: 'ai.amateur',
    hintKey: 'ai.amateurHint',
    ballClass: 'ai-difficulty-ball--amateur',
  },
  {
    id: 'expert',
    titleKey: 'ai.expert',
    hintKey: 'ai.expertHint',
    ballClass: 'ai-difficulty-ball--expert',
  },
];

type Props = {
  current: AIDifficulty;
  onSelect: (level: AIDifficulty) => void;
};

export function OfflineAiDifficultyOptionList({ current, onSelect }: Props) {
  const t = useT();

  return (
    <div className="ai-difficulty-popover-list" role="radiogroup" aria-label={t('ai.levelGroup')}>
      {ROWS.map((row) => {
        const selected = current === row.id;
        return (
          <button
            key={row.id}
            type="button"
            role="radio"
            aria-checked={selected}
            className={['ai-difficulty-option', selected ? 'ai-difficulty-option--selected' : ''].join(' ')}
            onClick={() => onSelect(row.id)}
          >
            <span className="ai-difficulty-option-ball-wrap" aria-hidden>
              <span
                className={['ai-difficulty-ball', row.ballClass, selected ? 'ai-difficulty-ball--checked' : ''].join(' ')}
              >
                {selected ? <span className="ai-difficulty-ball-check">✓</span> : null}
              </span>
            </span>
            <span className="ai-difficulty-option-text">
              <span className="ai-difficulty-option-title">{t(row.titleKey)}</span>
              <span className="ai-difficulty-option-hint">{t(row.hintKey)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
