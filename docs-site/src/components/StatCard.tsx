import { Link } from 'react-router-dom';
import { progressToAccent, type ProgressAccent } from '../portal/progressAccent';

export type StatAccent = ProgressAccent;

type Props = {
  label: string;
  value: string | number;
  sub?: string;
  /** Фиксированный цвет (если нет progressPct) */
  accent?: StatAccent;
  /** % → умная подсветка верхней границы */
  progressPct?: number;
  to?: string;
};

export function StatCard({ label, value, sub, accent = 'cyan', progressPct, to }: Props) {
  const resolved = progressPct !== undefined ? progressToAccent(progressPct) : accent;

  const card = (
    <article className={`stat-card stat-card--neon accent-${resolved}`}>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {sub && <p className="stat-sub">{sub}</p>}
    </article>
  );

  if (to) {
    return (
      <Link to={to} className="stat-card-link">
        {card}
      </Link>
    );
  }

  return card;
}
