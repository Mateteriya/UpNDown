from pathlib import Path

path = Path(r"d:\Projects\UpNDown\src\ui\AudioSfxLabPage.tsx")
text = path.read_text(encoding="utf-8")

start = text.find("          <h2>Инструмент</h2>")
end = text.find('          <div className="audio-sfx-lab__keys-head">')
if start < 0 or end < 0:
    raise SystemExit(f"markers missing start={start} end={end}")

new_inline = r'''          <details className="audio-sfx-lab__accordion" open>
            <summary>Голос · крутилки</summary>
            <div className="audio-sfx-lab__accordion-body">
          <div className="audio-sfx-lab__inst-grid audio-sfx-lab__inst-grid--row" role="listbox">
            {LAB_INSTRUMENTS.map((inst) => (
              <button
                key={inst.id}
                type="button"
                role="option"
                aria-selected={voice.instrument === inst.id}
                className={
                  voice.instrument === inst.id
                    ? 'audio-sfx-lab__inst audio-sfx-lab__inst--on'
                    : 'audio-sfx-lab__inst'
                }
                onClick={() => patchVoice({ instrument: inst.id })}
              >
                <strong>{inst.label}</strong>
                <span>{inst.hint}</span>
              </button>
            ))}
          </div>
          <div className="audio-sfx-lab__knob-row">
            <LabKnob
              label="Яркость"
              value={voice.brightness}
              onChange={(brightness) => patchVoice({ brightness })}
              format={(n) => `${Math.round(n * 100)}%`}
            />
            <LabKnob
              label={voice.instrument === 'ebass' ? 'Упругость' : 'Глубина'}
              value={voice.depth}
              onChange={(depth) => patchVoice({ depth })}
              format={(n) => `${Math.round(n * 100)}%`}
            />
            <LabKnob
              label="Фильтр"
              value={voice.filter}
              onChange={(filter) => patchVoice({ filter })}
              format={(n) => `${Math.round(n * 100)}%`}
            />
            <LabKnob
              label="Длина"
              value={voice.duration}
              min={0.06}
              max={2.8}
              step={0.01}
              onChange={(duration) => patchVoice({ duration })}
              format={(n) => `${n.toFixed(2)}с`}
            />
            <LabKnob
              label="Громк."
              value={voice.volume}
              min={0.05}
              max={1}
              onChange={(volume) => patchVoice({ volume })}
              format={(n) => `${Math.round(n * 100)}%`}
            />
          </div>
          <details className="audio-sfx-lab__accordion">
            <summary>ADSR / cents</summary>
            <div className="audio-sfx-lab__accordion-body">
          <div className="audio-sfx-lab__sliders audio-sfx-lab__sliders--full">
            <SliderRow
              label="Атака"
              value={voice.attack}
              min={0.001}
              max={0.35}
              step={0.001}
              format={(n) => `${(n * 1000).toFixed(0)} мс`}
              onChange={(attack) => patchVoice({ attack })}
            />
            <SliderRow
              label="Релиз"
              value={voice.release}
              min={0.02}
              max={2.2}
              step={0.01}
              format={(n) => `${n.toFixed(2)} с`}
              onChange={(release) => patchVoice({ release })}
            />
            <SliderRow
              label="Расстройка"
              value={voice.detuneCents}
              min={-50}
              max={50}
              step={1}
              format={(n) => `${n > 0 ? '+' : ''}${n} ¢`}
              onChange={(detuneCents) => patchVoice({ detuneCents })}
            />
            <SliderRow
              label="Октава"
              value={voice.octave}
              min={-2}
              max={2}
              step={1}
              format={(n) => `${n > 0 ? '+' : ''}${n}`}
              onChange={(octave) => patchVoice({ octave })}
            />
          </div>
            </div>
          </details>
            </div>
          </details>

'''

text = text[:start] + new_inline + text[end:]

old_end = """          <div className=\"audio-sfx-lab__hint audio-sfx-lab__hint--path\">
            После скачивания: файл из Downloads положи в{' '}
            <code>public\\audio\\sfx\\{activeTask.id}.wav</code> (замени старый) → в{' '}
            <code>src\\audio\\bus.ts</code> увеличь <code>SAMPLE_VER</code> → жёсткий F5 в игре.
          </div>
        </section>
      </div>
    </div>
  );
}"""

new_end = """          <div className=\"audio-sfx-lab__hint audio-sfx-lab__hint--path\">
            После скачивания: файл из Downloads положи в{' '}
            <code>public\\audio\\sfx\\{activeTask.id}.wav</code> (замени старый) → в{' '}
            <code>src\\audio\\bus.ts</code> увеличь <code>SAMPLE_VER</code> → жёсткий F5 в игре.
          </div>
        </main>

        <aside className=\"audio-sfx-lab__studio-inspector\">
          <details className=\"audio-sfx-lab__accordion\" open>
            <summary>Студия</summary>
            <div className=\"audio-sfx-lab__accordion-body\">
              <p className=\"audio-sfx-lab__hint\" style={{ margin: 0 }}>
                Транспорт сверху · дорожки/стан в центре · пресеты слева.
                «Сохранить трек» пишет WAV и пресет (трек+сессия).
              </p>
              <button
                type=\"button\"
                className=\"audio-sfx-lab__btn\"
                style={{ marginTop: 8 }}
                onClick={() => setKeyboardOpen((v) => !v)}
              >
                {keyboardOpen ? '▾ Скрыть клавиши' : '▸ Клавиши'}
              </button>
            </div>
          </details>
        </aside>
      </div>
    </div>
  );
}"""

if old_end not in text:
    raise SystemExit("end block not found")
text = text.replace(old_end, new_end)

keys_head = text.find('          <div className="audio-sfx-lab__keys-head">')
if keys_head < 0:
    raise SystemExit("keys-head missing")

drawer_open = """          <div className=\"audio-sfx-lab__keyboard-drawer\">
            <button
              type=\"button\"
              className=\"audio-sfx-lab__keyboard-drawer-toggle\"
              onClick={() => setKeyboardOpen((v) => !v)}
            >
              {keyboardOpen ? '▾ Клавиатура' : '▸ Клавиатура (открыть)'}
            </button>
            <div className={keyboardOpen ? 'audio-sfx-lab__keyboard-drawer-body' : 'audio-sfx-lab__keyboard-drawer-body audio-sfx-lab__keyboard-drawer-body--closed'}>
"""

text = text[:keys_head] + drawer_open + text[keys_head:]

hint = text.find('          <div className="audio-sfx-lab__hint audio-sfx-lab__hint--path">')
if hint < 0:
    raise SystemExit("path hint missing")
text = text[:hint] + "            </div>\n          </div>\n\n" + text[hint:]

path.write_text(text, encoding="utf-8")
print("patched ok")
