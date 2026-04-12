/**
 * Список уровней сложности одного бота — общий для портала (клик по имени) и панели по аватарке.
 */

import type { AIDifficulty } from '../game/GameEngine';

const ROWS: {
  id: AIDifficulty;
  title: string;
  hint: string;
  ballClass: string;
}[] = [
  {
    id: 'novice',
    title: 'Новичок',
    hint: 'Всегда слабейшая легальная карта',
    ballClass: 'ai-difficulty-ball--novice',
  },
  {
    id: 'amateur',
    title: 'Любитель',
    hint: 'Заказ и взятки, перебор — добирать очки',
    ballClass: 'ai-difficulty-ball--amateur',
  },
  {
    id: 'expert',
    title: 'Эксперт',
    hint: 'Как любитель + темп: не тратить топ на заходе впустую',
    ballClass: 'ai-difficulty-ball--expert',
  },
];

type Props = {
  current: AIDifficulty;
  onSelect: (level: AIDifficulty) => void;
};

export function OfflineAiDifficultyOptionList({ current, onSelect }: Props) {
  return (
    <div className="ai-difficulty-popover-list" role="radiogroup" aria-label="Уровень сложности">
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
              <span className="ai-difficulty-option-title">{row.title}</span>
              <span className="ai-difficulty-option-hint">{row.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
