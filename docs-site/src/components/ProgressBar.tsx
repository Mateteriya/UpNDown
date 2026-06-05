import { progressToAccent } from '../portal/progressAccent';

type Props = {
  value: number;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  showPct?: boolean;
};

export function ProgressBar({ value, label, size = 'md', showPct = true }: Props) {
  const clamped = Math.min(100, Math.max(0, value));
  const accent = progressToAccent(clamped);

  return (
    <div className={`progress-wrap progress-${size} progress-accent-${accent}`}>
      {(label || showPct) && (
        <div className="progress-header">
          {label && <span className="progress-label">{label}</span>}
          {showPct && <span className={`progress-pct progress-pct--${accent}`}>{Math.round(clamped)}%</span>}
        </div>
      )}
      <div
        className="progress-track"
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="progress-fill" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
