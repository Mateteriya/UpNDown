# -*- coding: utf-8 -*-
from pathlib import Path

path = Path(r"d:\Projects\UpNDown\src\ui\AudioSfxLabPage.tsx")
text = path.read_text(encoding="utf-8")

start = text.find('        <aside className="audio-sfx-lab__studio-library">')
end = text.find('        <main className="audio-sfx-lab__studio-arrange">')
if start < 0 or end < 0:
    raise SystemExit(f"markers not found {start=} {end=}")

# Keep slots body from existing (between slots section start and </aside>)
# Extract slots inner content for reuse
old = text[start:end]
slots_marker = '          <div className="audio-sfx-lab__grid audio-sfx-lab__grid--tasks">'
si = old.find(slots_marker)
# old structure ends with </aside>\n\n before main
aside_close = old.rfind('        </aside>')
if si < 0 or aside_close < 0:
    raise SystemExit("slots block not found")
slots_block = old[si:aside_close].rstrip()
# Remove trailing `) : null}` if present from libraryTab conditional
if slots_block.endswith(") : null}"):
    # find matching open of {libraryTab === 'slots' ? (
    pass
# slots_block currently starts with div and may end with `</aside>` removed; check end
# It should be: <div>... </div>\n          ) : null}
# Strip the ternary wrapper end
if "\n          ) : null}" in slots_block:
    slots_block = slots_block.replace("\n          ) : null}", "", 1)

new_lib = r'''        <aside className="audio-sfx-lab__studio-library">
          <div className="audio-sfx-lab__lib-section">
            <div className="audio-sfx-lab__lib-section-head">
              <h2 className="audio-sfx-lab__lib-title">Пресеты</h2>
              <span className="audio-sfx-lab__lib-count">{allPresets.length}</span>
            </div>
            <div className="audio-sfx-lab__lib-tabs" role="tablist" aria-label="Тип пресета">
              <button
                type="button"
                className={
                  presetKindTab === 'all'
                    ? 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-rhythm-on'
                    : 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset'
                }
                onClick={() => setPresetKindTab('all')}
              >
                Все
              </button>
              <button
                type="button"
                className={
                  presetKindTab === 'sfx'
                    ? 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-rhythm-on'
                    : 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset'
                }
                onClick={() => setPresetKindTab('sfx')}
              >
                SFX
              </button>
              <button
                type="button"
                className={
                  presetKindTab === 'music'
                    ? 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-rhythm-on'
                    : 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset'
                }
                onClick={() => setPresetKindTab('music')}
              >
                Музыка
              </button>
            </div>
            <ul className="audio-sfx-lab__preset-list">
              {visiblePresets.length === 0 ? (
                <li className="audio-sfx-lab__hint">
                  Пока пусто — «Сохранить в игру» / «Сохранить трек» добавит сюда.
                </li>
              ) : (
                visiblePresets.map((p) => {
                  const kind = p.kind ?? 'sfx';
                  return (
                    <li key={p.id} className="audio-sfx-lab__preset-item">
                      <button
                        type="button"
                        className={
                          activePresetId === p.id
                            ? 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-rhythm-on'
                            : 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset'
                        }
                        onClick={() => {
                          if (kind === 'music') applyMusicPreset(p);
                          else {
                            setVoice(p.voice);
                            voiceRef.current = p.voice;
                            setPhrase(p.phrase ?? []);
                            if (p.chordMidis?.length) setChordMidis(p.chordMidis);
                            setLabMode('sfx');
                            setActivePresetId(p.id);
                            setStatus(`SFX пресет «${p.name}»`);
                          }
                        }}
                      >
                        <span className="audio-sfx-lab__preset-name">{p.name}</span>
                        <span
                          className={
                            kind === 'music'
                              ? 'audio-sfx-lab__preset-kind audio-sfx-lab__preset-kind--music'
                              : 'audio-sfx-lab__preset-kind'
                          }
                        >
                          {kind === 'music' ? 'муз' : 'sfx'}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset audio-sfx-lab__preset-del"
                        title="Удалить"
                        onClick={() => {
                          deleteLabPreset(p.id);
                          setPresetsTick((x) => x + 1);
                          if (activePresetId === p.id) setActivePresetId(null);
                        }}
                      >
                        ×
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>

          <div className="audio-sfx-lab__lib-section audio-sfx-lab__lib-section--slots">
            <button
              type="button"
              className="audio-sfx-lab__lib-section-toggle"
              onClick={() => setSlotsOpen((v) => !v)}
            >
              <h2 className="audio-sfx-lab__lib-title">{labMode === 'music' ? 'Слоты музыки' : 'Слоты SFX'}</h2>
              <span>{slotsOpen ? '▾' : '▸'}</span>
            </button>
            {slotsOpen ? (
''' + slots_block + '''
            ) : null}
          </div>
        </aside>

'''

path.write_text(text[:start] + new_lib + text[end:], encoding="utf-8")
print("library ok")
