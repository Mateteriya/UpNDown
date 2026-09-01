# -*- coding: utf-8 -*-
from pathlib import Path

path = Path(r"d:\Projects\UpNDown\src\ui\AudioSfxLabPage.tsx")
text = path.read_text(encoding="utf-8")

old_start = "          {labMode === 'music' ? (\n            <div className=\"audio-sfx-lab__arrange-music\">"
# find staff IIFE start
staff_mark = "                        {(() => {\n                          const staffLayer ="
actions_end = "                    )}\n            </div>\n          ) : null}"

a = text.find(old_start)
b = text.find(staff_mark, a)
c = text.find(actions_end, b)
if a < 0 or b < 0 or c < 0:
    raise SystemExit(f"markers {a=} {b=} {c=}")

# content before staff: from after opening arrange-music div to before staff IIFE
# We need to close tracks pane before staff, and move master/actions with tracks
# Currently structure: timeline, layers branch with staff+master+actions inside
# New: tracks pane has timeline + layers list + master+actions; staff pane has staff only

before_staff = text[a:b]  # includes arrange-music open through layers ul end area

# The before_staff ends just before staff IIFE, which is inside `<>` of melodyLayers branch
# After staff comes SliderRow master and actions, then `</>` `)}` close

staff_and_rest = text[b : c + len(actions_end)]

# Extract staff IIFE only
staff_end = staff_and_rest.find("                        })()}")
if staff_end < 0:
    raise SystemExit("staff end not found")
staff_block = staff_and_rest[: staff_end + len("                        })()}")]
after_staff = staff_and_rest[staff_end + len("                        })()}") :]
# after_staff is SliderRow... through `)}` `</div>` `) : null}`

# Rebuild: rearrange so master/actions stay in tracks pane, staff in staff pane
# before_staff currently has open `<>` after melodyLayers.length check and ul
# We need to close tracks content after ul, put master/actions, close tracks pane,
# then handle, then staff pane with staff, then close arrange-music

# Simpler approach: wrap existing content with split structure via markers

new_block = f'''          {{labMode === 'music' ? (
            <div className="audio-sfx-lab__arrange-music audio-sfx-lab__arrange-music--split">
              <div
                className="audio-sfx-lab__arrange-pane audio-sfx-lab__arrange-pane--tracks"
                style={{{{ height: panelLayout.tracksPx, flex: '0 0 auto' }}}}
              >
                    <p className="audio-sfx-lab__melody-title">Мелодии (слои)</p>
                    <p className="audio-sfx-lab__beat-hint" style={{{{ margin: '0 0 8px' }}}}>
                      Включи <strong>Петля</strong> → ● Запись — время нот = фаза бита (не «с первой клавиши»).
                      Дорожки ниже показывают бочку/снейр/хеты и мелодии на одной шкале.
                      Границы панелей можно тянуть.
                    </p>
                    <LabTracksTimeline
                      beat={{beatParams}}
                      layers={{melodyLayers}}
                      liveNotes={{recording || phrase.length > 0 ? phrase : []}}
                      recording={{recording}}
                      activeLayerId={{staffLayerId}}
                      onSelectLayer={{(id) => {{
                        setStaffLayerId(id);
                        setStatus(`Нотный стан: слой`);
                      }}}}
                    />
                    {{melodyLayers.length === 0 ? (
                      <p className="audio-sfx-lab__beat-hint" style={{{{ margin: 0 }}}}>
                        Пока пусто. Включи «Петля», нажми ● Запись, сыграй, ■ Стоп — слой появится здесь.
                      </p>
                    ) : (
                      <>
                        <ul className="audio-sfx-lab__melody-layers">
                          {{melodyLayers.map((layer) => (
                            <li key={{layer.id}} className="audio-sfx-lab__melody-layer">
                              <button
                                type="button"
                                className={{
                                  staffLayerId === layer.id
                                    ? 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset audio-sfx-lab__btn--beat-rhythm-on'
                                    : 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset'
                                }}
                                title="Открыть на нотном стане"
                                onClick={{() => {{
                                  setStaffLayerId(layer.id);
                                  setStatus(`Нотный стан: «${{layer.name}}»`);
                                }}}}
                              >
                                {{staffLayerId === layer.id ? '🎼' : '♪'}} {{layer.name}}
                              </button>
                              <button
                                type="button"
                                className={{
                                  layer.enabled
                                    ? 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset audio-sfx-lab__btn--beat-rhythm-on'
                                    : 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset'
                                }}
                                title={{layer.enabled ? 'Выключить слой в петле' : 'Включить слой в петле'}}
                                onClick={{() => {{
                                  const next = melodyLayersRef.current.map((l) =>
                                    l.id === layer.id ? {{ ...l, enabled: !l.enabled }} : l,
                                  );
                                  melodyLayersRef.current = next;
                                  setMelodyLayers(next);
                                  restartMusicLoop(next);
                                  setStatus(
                                    next.find((l) => l.id === layer.id)?.enabled
                                      ? `«${{layer.name}}» вкл`
                                      : `«${{layer.name}}» выкл`,
                                  );
                                }}}}
                              >
                                {{layer.enabled ? '● звук' : '○ звук'}}
                              </button>
                              <span className="audio-sfx-lab__melody-meta">{{layer.notes.length}} нот</span>
                              <label className="audio-sfx-lab__melody-gain">
                                <span>ур.</span>
                                <input
                                  type="range"
                                  min={{0}}
                                  max={{1}}
                                  step={{0.01}}
                                  value={{layer.gain}}
                                  onChange={{(e) => {{
                                    const gain = Number(e.target.value);
                                    const next = melodyLayersRef.current.map((l) =>
                                      l.id === layer.id ? {{ ...l, gain }} : l,
                                    );
                                    melodyLayersRef.current = next;
                                    setMelodyLayers(next);
                                    restartMusicLoop(next);
                                  }}}}
                                />
                              </label>
                              <button
                                type="button"
                                className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset"
                                title="Удалить слой"
                                onClick={{() => {{
                                  const next = melodyLayersRef.current.filter((l) => l.id !== layer.id);
                                  melodyLayersRef.current = next;
                                  setMelodyLayers(next);
                                  if (staffLayerId === layer.id) setStaffLayerId(next[0]?.id ?? null);
                                  restartMusicLoop(next);
                                  setStatus(`Удалён «${{layer.name}}»`);
                                }}}}
                              >
                                ×
                              </button>
                            </li>
                          ))}}
                        </ul>
{after_staff.replace("                    )}\n            </div>\n          ) : null}", "                      </>\\n                    )}")}
              </div>

              <LabResizeHandle
                axis="y"
                label="Высота дорожек"
                onDrag={{(dy) => patchPanelLayout({{ tracksPx: panelLayoutRef.current.tracksPx + dy }})}}
                onDragEnd={{persistPanelLayout}}
                onReset={{() => resetPanelKey('tracksPx')}}
              />

              <div className="audio-sfx-lab__arrange-pane audio-sfx-lab__arrange-pane--staff">
{staff_block}
                {{melodyLayers.length === 0 ? (
                  <p className="audio-sfx-lab__beat-hint" style={{{{ margin: '12px 0 0' }}}}>
                    Нотный стан появится после первой записи слоя.
                  </p>
                ) : null}}
              </div>
            </div>
          ) : null}}
'''

# The after_staff rewrite is fragile. Do a cleaner surgical edit instead.
print("aborting complex rewrite; use surgical")
raise SystemExit(0)
