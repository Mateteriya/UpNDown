export type RingTone = 'gold' | 'cyan' | 'green' | 'violet';

type Props = {
  value: number;
  size?: number;
  label?: string;
  tone?: RingTone;
};

export function RingProgress({ value, size = 120, label, tone = 'gold' }: Props) {
  const clamped = Math.min(100, Math.max(0, value));
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;

  return (
    <div className={`ring-progress ring-progress--${tone}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          className="ring-bg"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          className="ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-center">
        <span className="ring-pct">{clamped}%</span>
        {label && <span className="ring-label">{label}</span>}
      </div>
    </div>
  );
}
