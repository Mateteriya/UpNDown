# -*- coding: utf-8 -*-
from pathlib import Path

path = Path(r"d:\Projects\UpNDown\src\ui\AudioSfxLabPage.tsx")
text = path.read_text(encoding="utf-8")

voice_start = text.find(
    '          <details className="audio-sfx-lab__accordion" open>\n            <summary>Голос · крутилки</summary>'
)
if voice_start < 0:
    raise SystemExit("voice start not found")

marker_after_voice = '\n          <div className="audio-sfx-lab__keyboard-drawer">'
voice_end = text.find(marker_after_voice, voice_start)
if voice_end < 0:
    raise SystemExit("voice end not found")
voice_block = text[voice_start:voice_end]

beat_start = text.find('          <div className="audio-sfx-lab__beat-panel">')
if beat_start < 0:
    raise SystemExit("beat panel not found")

melody_box_start = text.find(
    '                  <div className="audio-sfx-lab__melody-box">', beat_start
)
if melody_box_start < 0:
    raise SystemExit("melody box not found")

atm_marker = '                  <SliderRow\n                    label="Атмосфера"'
atm_pos = text.find(atm_marker, beat_start)
if atm_pos < 0:
    raise SystemExit("atmosphere not found")

music_frag = text.rfind("{labMode === 'music' ? (", beat_start, atm_pos)
if music_frag < 0:
    raise SystemExit("music frag not found")

beat_pre = text[beat_start:music_frag]

melody_close_pat = "                  </div>\n                </>\n              ) : null}\n"
melody_close = text.find(melody_close_pat, melody_box_start)
if melody_close < 0:
    raise SystemExit("melody close not found")
melody_close_end = melody_close + len(melody_close_pat)

melody_inner_start = text.find(">", melody_box_start) + 1
melody_inner = text[melody_inner_start:melody_close].rstrip()

kbd_ref = text.find("\n          <div\n            ref={keyboardRef}", melody_close_end)
if kbd_ref < 0:
    raise SystemExit("keyboardRef not found")
beat_post = text[melody_close_end:kbd_ref]

atm_block = text[atm_pos:melody_box_start]

arrange_music = f"""
          {{labMode === 'music' ? (
            <div className="audio-sfx-lab__arrange-music">
{melody_inner}
            </div>
          ) : null}}
"""

beat_pre_inner = beat_pre[len('          <div className="audio-sfx-lab__beat-panel">') :]

bp = beat_post.rstrip()
for _ in range(2):
    idx = bp.rfind("</div>")
    if idx < 0:
        raise SystemExit("could not strip beat closes")
    bp = bp[:idx].rstrip()

inspector = f"""        <aside className="audio-sfx-lab__studio-inspector">
{voice_block}
          <details className="audio-sfx-lab__accordion" open={{labMode === 'music' || beatParams.rhythm === 'custom'}}>
            <summary>Бит · ритм</summary>
            <div className="audio-sfx-lab__accordion-body">
              <div className="audio-sfx-lab__beat-panel audio-sfx-lab__beat-panel--inspect">
{beat_pre_inner}{bp}
              </div>
            </div>
          </details>
          {{labMode === 'music' ? (
            <details className="audio-sfx-lab__accordion" open>
              <summary>Атмосфера</summary>
              <div className="audio-sfx-lab__accordion-body">
{atm_block}
              </div>
            </details>
          ) : null}}
          <details className="audio-sfx-lab__accordion">
            <summary>Справка</summary>
            <div className="audio-sfx-lab__accordion-body">
              <p className="audio-sfx-lab__hint" style={{{{ margin: 0 }}}}>
                Транспорт сверху · дорожки/стан в центре · пресеты слева.
                «Сохранить трек» пишет WAV и пресет (трек+сессия). Focus скрывает боковые панели.
              </p>
              <button
                type="button"
                className="audio-sfx-lab__btn"
                style={{{{ marginTop: 8 }}}}
                onClick={{() => setKeyboardOpen((v) => !v)}}
              >
                {{keyboardOpen ? '▾ Скрыть клавиши' : '▸ Клавиши'}}
              </button>
            </div>
          </details>
        </aside>
"""

before = text[:voice_start]
kbd_start = text.find(marker_after_voice)
old_insp = text.find('        <aside className="audio-sfx-lab__studio-inspector">')
if old_insp < 0:
    raise SystemExit("old inspector not found")

after_marker = "      </div>\n    </div>\n  );"
after_pos = text.find(after_marker, old_insp)
if after_pos < 0:
    raise SystemExit("after inspector not found")
after_insp = text[after_pos:]

kbd_chunk = text[kbd_start:old_insp]
b0 = kbd_chunk.find('          <div className="audio-sfx-lab__beat-panel">')
b1 = kbd_chunk.find("          <div\n            ref={keyboardRef}")
if b0 < 0 or b1 < 0:
    raise SystemExit(f"beat in kbd not found {b0=} {b1=}")
kbd_without_beat = kbd_chunk[:b0] + kbd_chunk[b1:]

main_close = kbd_without_beat.rfind("        </main>")
if main_close < 0:
    raise SystemExit("main close missing")

head = kbd_without_beat[:main_close]
tail = kbd_without_beat[main_close:]
hint_idx = head.find(
    '          <div className="audio-sfx-lab__hint audio-sfx-lab__hint--path">'
)
if hint_idx > 0:
    before_hint = head[:hint_idx].rstrip()
    after_hint = head[hint_idx:]
    if "keyboard-drawer" in before_hint and before_hint.count("</div>") >= 2:
        # close drawer body + drawer before path hint if not already present
        if not before_hint.endswith("</div>"):
            before_hint = before_hint + "\n            </div>\n          </div>"
        else:
            # check last two non-empty lines
            lines = [ln for ln in before_hint.splitlines() if ln.strip()]
            last2 = "\n".join(lines[-2:]) if len(lines) >= 2 else ""
            if "keyboard-drawer" in before_hint and "</div>\n          </div>" not in before_hint[-80:]:
                before_hint = before_hint + "\n            </div>\n          </div>"
    else:
        before_hint = before_hint + "\n            </div>\n          </div>"
    head = before_hint + "\n\n" + after_hint
else:
    head = head.rstrip() + "\n            </div>\n          </div>\n\n"

kbd_fixed = head + tail

new_text = before + arrange_music + "\n" + kbd_fixed + "\n" + inspector + after_insp
path.write_text(new_text, encoding="utf-8")
print("restructure ok", len(new_text))
