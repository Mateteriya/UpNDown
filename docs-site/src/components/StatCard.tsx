import { Link } from 'react-router-dom';

export type StatAccent = 'cyan' | 'green' | 'gold' | 'violet';

type Props = {
  label: string;
  value: string | number;
  sub?: string;
  accent?: StatAccent;
  /** Кликабельная карточка → раздел портала */
  to?: string;
};

export function StatCard({ label, value, sub, accent = 'cyan', to }: Props) {
  const card = (
    <article className={`stat-card stat-card--neon accent-${accent}`}>
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
