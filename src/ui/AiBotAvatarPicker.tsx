/**
 * Премиум: выбор картинки аватара ИИ из набора уровня (6 вариантов).
 */
import type { AIDifficulty } from '../game/types';
import { listAiBotAvatarUrls } from '../lib/aiBotAvatars';

type Props = {
  difficulty: AIDifficulty;
  currentVariant: number;
  onSelect: (variantIndex: number) => void;
};

export function AiBotAvatarPicker({ difficulty, currentVariant, onSelect }: Props) {
  const urls = listAiBotAvatarUrls(difficulty);

  return (
    <div className="ai-bot-avatar-picker" role="radiogroup" aria-label="Аватар ИИ">
      <div className="ai-bot-avatar-picker__grid">
        {urls.map((url, index) => {
          const selected = currentVariant === index;
          return (
            <button
              key={url}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`Вариант ${index + 1}`}
              className={[
                'ai-bot-avatar-picker__option',
                selected ? 'ai-bot-avatar-picker__option--selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelect(index)}
            >
              <img src={url} alt="" className="ai-bot-avatar-picker__img" draggable={false} />
              {selected ? <span className="ai-bot-avatar-picker__check" aria-hidden>✓</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
