import { Link } from 'react-router-dom';
import { ProgressBar } from './ProgressBar';
import type { Direction } from '../portal/types';
import { progressForGroupIds } from '../portal/data';
import { progressToAccent } from '../portal/progressAccent';

import type { TaskWorkApi } from '../portal/useTaskWork';

type Props = {
  directions: Direction[];
  work: TaskWorkApi;
};

export function DirectionGrid({ directions, work }: Props) {
  return (
    <div className="direction-grid">
      {directions.map((d) => {
        const pct = progressForGroupIds(d.groupIds, work.checked);
        const accent = progressToAccent(pct);
        const to = d.link?.startsWith('/') ? d.link : '/roadmap';
        return (
          <Link key={d.id} to={to} className="stat-card-link">
            <article className={`direction-card accent-${accent}`}>
              <header>
                <span className="direction-code">{d.code}</span>
                <h3>{d.title}</h3>
                <span className={`direction-pct direction-pct--${accent} ${pct >= 100 ? 'done' : ''}`}>
                  {pct}%
                </span>
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
