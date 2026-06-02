import { Link } from 'react-router-dom';
import { ProgressBar } from './ProgressBar';
import type { Direction } from '../portal/types';
import { progressForGroupIds } from '../portal/data';

type Props = {
  directions: Direction[];
  checked: Set<string>;
};

export function DirectionGrid({ directions, checked }: Props) {
  return (
    <div className="direction-grid">
      {directions.map((d) => {
        const pct = progressForGroupIds(d.groupIds, checked);
        const to = d.link?.startsWith('/') ? d.link : '/roadmap';
        return (
          <Link key={d.id} to={to} className="direction-card-link">
            <article className="direction-card">
              <header>
                <span className="direction-code">{d.code}</span>
                <h3>{d.title}</h3>
                <span className={`direction-pct ${pct >= 100 ? 'done' : ''}`}>{pct}%</span>
              </header>
              <p>{d.summary}</p>
              <footer>
                <span className="owner-line">{d.owner}</span>
                <ProgressBar value={pct} size="sm" showPct={false} />
              </footer>
            </article>
          </Link>
        );
      })}
    </div>
  );
}
