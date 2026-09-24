/**
 * Лаборатория глифов кнопки «Звук» (мобильное меню).
 * URL: /sound-glyph-lab — выбор пишется в localStorage и сразу виден на главной.
 */

import { useEffect, useId, useState } from 'react';
import {
  getMenuSoundGlyphId,
  MENU_SOUND_GLYPH_IDS,
  MENU_SOUND_GLYPH_META,
  setMenuSoundGlyphId,
  subscribeMenuSoundGlyph,
  type MenuSoundGlyphId,
} from '../lib/menuSoundGlyph';
import { MenuSoundGlyph } from './MenuSoundGlyph';
import '../styles/menu-sound-glyph.css';

type Props = { onBack: () => void };

export function SoundGlyphLabPage({ onBack }: Props) {
  const [selected, setSelected] = useState<MenuSoundGlyphId>(() => getMenuSoundGlyphId());
  const baseId = useId().replace(/:/g, '');

  useEffect(() => subscribeMenuSoundGlyph(setSelected), []);

  const pick = (id: MenuSoundGlyphId) => {
    setMenuSoundGlyphId(id);
    setSelected(id);
  };

  return (
    <main className="sound-glyph-lab">
      <div className="sound-glyph-lab__top">
        <button type="button" className="sound-glyph-lab__back" onClick={onBack}>
          ← Меню
        </button>
        <span style={{ fontSize: 11, opacity: 0.7 }}>локальный тест</span>
      </div>
      <h1 className="sound-glyph-lab__title">Sound glyph lab</h1>
      <p className="sound-glyph-lab__lead">
        Выберите глиф для компактной кнопки «Звук» в правом верхнем углу мобильного меню. Выбор
        сохраняется на устройстве и сразу применяется на главной (аватар и ушко языка не двигаются).
      </p>
      <div className="sound-glyph-lab__grid" role="listbox" aria-label="Варианты глифа звука">
        {MENU_SOUND_GLYPH_IDS.map((id) => {
          const meta = MENU_SOUND_GLYPH_META[id];
          const on = id === selected;
          return (
            <button
              key={id}
              type="button"
              role="option"
              aria-selected={on}
              className={['sound-glyph-lab__card', on ? 'sound-glyph-lab__card--on' : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => pick(id)}
            >
              <div className="sound-glyph-lab__stage">
                <span className="menu-sound-btn" aria-hidden>
                  <span className="menu-sound-btn__rim" />
                  <span className="menu-sound-btn__glow" />
                  <MenuSoundGlyph id={id} muted={false} gradId={`${baseId}-${id}`} />
                </span>
              </div>
              <span className="sound-glyph-lab__name">{meta.title}</span>
              <span className="sound-glyph-lab__blurb">{meta.blurb}</span>
              <div className="sound-glyph-lab__muted-row" title="Вид при выключенном звуке">
                <MenuSoundGlyph id={id} muted gradId={`${baseId}-m-${id}`} />
                <span style={{ fontSize: 10, opacity: 0.65 }}>muted</span>
              </div>
            </button>
          );
        })}
      </div>
    </main>
  );
}
