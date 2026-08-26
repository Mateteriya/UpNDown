import { LAB_SAMPLE_RATE } from './types';

function clampSample(x: number): number {
  return Math.min(1, Math.max(-1, x));
}

/** Mono Float32 → WAV ArrayBuffer (16-bit PCM). */
export function encodeWavMono(samples: Float32Array, sampleRate = LAB_SAMPLE_RATE): ArrayBuffer {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buf);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + n * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, n * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    const v = clampSample(samples[i]!) * 32767;
    view.setInt16(o, v | 0, true);
    o += 2;
  }
  return buf;
}

export function downloadWav(samples: Float32Array, filename: string): void {
  if (samples.length === 0) return;
  const ab = encodeWavMono(samples);
  const blob = new Blob([ab], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.wav') ? filename : `${filename}.wav`;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
