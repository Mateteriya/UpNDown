/**
 * Мультитрек: бочка/снейр/хеты + слои мелодии на общей шкале времени с петлёй.
 */

import { useEffect, useMemo, useState } from 'react';
import type { LabBeatParams, LabMelodyLayer, LabPhraseNote } from '../../audio/lab';
import { getLabBeatLoopPhaseSec, resolveDisplayPattern } from '../../audio/lab';

const PAD_L = 108;
const PX_PER_BEAT = 48;
const ROW_H = 32;

type Props = {
  beat: LabBeatParams;
  layers: LabMelodyLayer[];
  /** Черновик текущей записи (ещё не слой). */
  liveNotes?: LabPhraseNote[];
  recording?: boolean;
  activeLayerId?: string | null;
  playingLayerId?: string | null;
  onSelectLayer?: (id: string) => void;
  onPlayLayer?: (id: string) => void;
};

function midiHue(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const h = (pc / 12) * 300 + 160;
  return `hsl(${h} 70% 48%)`;
}

export function LabTracksTimeline({
  beat,
  layers,
  liveNotes = [],
  recording = false,
  activeLayerId,
  playingLayerId,
  onSelectLayer,
  onPlayLayer,
}: Props) {
  const [phase, setPhase] = useState(0);

  const bpm = beat.bpm;
  const bars = beat.bars === 8 || beat.bars === 16 ? beat.bars : 4;
  const beatSec = 60 / Math.min(190, Math.max(80, bpm));
  const loopSec = bars * 4 * beatSec;
  const width = PAD_L + (loopSec / beatSec) * PX_PER_BEAT + 16;

  const pattern = useMemo(() => resolveDisplayPattern(beat), [beat]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const p = getLabBeatLoopPhaseSec();
      if (p != null) setPhase(p % loopSec);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [loopSec]);

  const xAt = (at: number) => PAD_L + (at / beatSec) * PX_PER_BEAT;
  const playX = xAt(phase);

  const drumRows: { id: string; label: string; steps: boolean[]; color: string }[] = [
    { id: 'kick', label: 'Бочка', steps: pattern.kick, color: '#0ea5e9' },
    { id: 'snare', label: 'Снейр', steps: pattern.snare, color: '#ea580c' },
    { id: 'hats', label: 'Хеты', steps: pattern.hats, color: '#16a34a' },
  ];

  const rows =
    3 + layers.length + (liveNotes.length > 0 || recording ? 1 : 0);
  const height = 28 + rows * ROW_H + 8;

  return (
    <div className="lab-tracks">
      <div className="lab-tracks__head">
        <span className="lab-tracks__title">Дорожки</span>
        <span className="lab-tracks__meta">
          {bars} такта · {Math.round(bpm)} BPM · {loopSec.toFixed(2)}с
        </span>
      </div>
      <div className="lab-tracks__scroll">
        <div className="lab-tracks__side" style={{ height }}>
          {drumRows.map((row, ri) => (
            <div
              key={row.id}
              className="lab-tracks__side-row"
              style={{ top: 24 + ri * ROW_H, height: ROW_H }}
            >
              <span className="lab-tracks__side-name" style={{ color: row.color }}>
                {row.label}
              </span>
            </div>
          ))}
          {layers.map((layer, li) => {
            const top = 24 + (3 + li) * ROW_H;
            const active = layer.id === activeLayerId;
            const playing = layer.id === playingLayerId;
            return (
              <div
                key={layer.id}
                className={[
                  'lab-tracks__side-row',
                  'lab-tracks__side-row--mel',
                  active ? 'lab-tracks__side-row--on' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ top, height: ROW_H }}
              >
                <button
                  type="button"
                  className={playing ? 'lab-tracks__play lab-tracks__play--on' : 'lab-tracks__play'}
                  title={`Сыграть «${layer.name}»`}
                  disabled={layer.notes.length === 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlayLayer?.(layer.id);
                  }}
                >
                  {playing ? '■' : '▶'}
                </button>
                <button
                  type="button"
                  className="lab-tracks__side-pick"
                  title="Открыть на стане"
                  onClick={() => onSelectLayer?.(layer.id)}
                >
                  <span className="lab-tracks__side-dot">{layer.enabled ? '●' : '○'}</span>
                  <span className="lab-tracks__side-name">{layer.name}</span>
                </button>
              </div>
            );
          })}
          {(liveNotes.length > 0 || recording) && (
            <div
              className="lab-tracks__side-row lab-tracks__side-row--live"
              style={{ top: 24 + (3 + layers.length) * ROW_H, height: ROW_H }}
            >
              <span className="lab-tracks__side-name">{recording ? '● REC' : 'буфер'}</span>
            </div>
          )}
        </div>
        <svg className="lab-tracks__svg" width={width} height={height}>
          {Array.from({ length: bars * 4 + 1 }, (_, i) => {
            const x = xAt(i * beatSec);
            const bar = i % 4 === 0;
            return (
              <line
                key={`g-${i}`}
                x1={x}
                x2={x}
                y1={20}
                y2={height - 4}
                className={bar ? 'lab-tracks__bar' : 'lab-tracks__beat'}
              />
            );
          })}
          {Array.from({ length: bars }, (_, b) => (
            <text key={`bn-${b}`} x={xAt(b * 4 * beatSec) + 4} y={14} className="lab-tracks__barnum">
              {b + 1}
            </text>
          ))}

          {drumRows.map((row, ri) => {
            const y = 24 + ri * ROW_H;
            return (
              <g key={row.id}>
                <rect
                  x={PAD_L}
                  y={y + 4}
                  width={width - PAD_L - 12}
                  height={ROW_H - 8}
                  className="lab-tracks__lane"
                />
                {row.steps.map((on, step) => {
                  if (!on) return null;
                  const hits: number[] = [];
                  for (let bar = 0; bar < bars; bar++) hits.push(bar * 16 + step);
                  return hits.map((s) => {
                    const at = (s / 4) * beatSec;
                    return (
                      <rect
                        key={`${row.id}-${s}`}
                        x={xAt(at)}
                        y={y + 7}
                        width={Math.max(4, PX_PER_BEAT / 4 - 1)}
                        height={ROW_H - 14}
                        rx={2}
                        fill={row.color}
                        opacity={0.9}
                      />
                    );
                  });
                })}
              </g>
            );
          })}

          {layers.map((layer, li) => {
            const y = 24 + (3 + li) * ROW_H;
            const active = layer.id === activeLayerId;
            return (
              <g
                key={layer.id}
                className={active ? 'lab-tracks__mel-row lab-tracks__mel-row--on' : 'lab-tracks__mel-row'}
                onClick={() => onSelectLayer?.(layer.id)}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  x={PAD_L}
                  y={y + 4}
                  width={width - PAD_L - 12}
                  height={ROW_H - 8}
                  className={active ? 'lab-tracks__lane lab-tracks__lane--active' : 'lab-tracks__lane'}
                />
                {layer.notes.map((n, i) => {
                  const dur = n.dur ?? 0.25;
                  return (
                    <rect
                      key={`${layer.id}-${i}`}
                      x={xAt(n.at % loopSec)}
                      y={y + 7}
                      width={Math.max(4, (dur / beatSec) * PX_PER_BEAT)}
                      height={ROW_H - 14}
                      rx={2}
                      fill={midiHue(n.midi)}
                      opacity={layer.enabled ? 0.92 : 0.35}
                    />
                  );
                })}
              </g>
            );
          })}

          {(liveNotes.length > 0 || recording) && (
            <g>
              {(() => {
                const y = 24 + (3 + layers.length) * ROW_H;
                return (
                  <>
                    <rect
                      x={PAD_L}
                      y={y + 4}
                      width={width - PAD_L - 12}
                      height={ROW_H - 8}
                      className="lab-tracks__lane lab-tracks__lane--rec"
                    />
                    {liveNotes.map((n, i) => {
                      const dur = n.dur ?? 0.25;
                      return (
                        <rect
                          key={`live-${i}`}
                          x={xAt(n.at % loopSec)}
                          y={y + 7}
                          width={Math.max(4, (dur / beatSec) * PX_PER_BEAT)}
                          height={ROW_H - 14}
                          rx={2}
                          fill="#f472b6"
                          opacity={0.95}
                        />
                      );
                    })}
                  </>
                );
              })()}
            </g>
          )}

          <line x1={playX} x2={playX} y1={18} y2={height - 4} className="lab-tracks__playhead" />
        </svg>
      </div>
      <p className="lab-tracks__hint">
        ▶ у слоя — только этот слой. Клик по полосе — стан. Ручку клавиатуры тяни вверх.
      </p>
    </div>
  );
}
