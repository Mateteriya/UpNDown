type Props = {
  value: number;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  showPct?: boolean;
  variant?: 'default' | 'success' | 'warn';
};

export function ProgressBar({
  value,
  label,
  size = 'md',
  showPct = true,
  variant = 'default',
}: Props) {
  const clamped = Math.min(100, Math.max(0, value));
  const variantClass =
    clamped >= 100 ? 'success' : clamped >= 60 ? 'default' : clamped >= 25 ? 'warn' : 'low';

  return (
    <div className={`progress-wrap progress-${size} progress-variant-${variant === 'default' ? variantClass : variant}`}>
      {(label || showPct) && (
        <div className="progress-header">
          {label && <span className="progress-label">{label}</span>}
          {showPct && <span className="progress-pct">{clamped}%</span>}
        </div>
      )}
      <div
        className="progress-track"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="progress-fill" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
