import { ResourceHub } from '../components/ResourceHub';
import { TaskList } from '../components/TaskList';
import { ProgressBar } from '../components/ProgressBar';
import { RingProgress } from '../components/RingProgress';
import {
  DIRECTIONS,
  PHASE1_GROUP_IDS,
  QUARTERS,
  QUARTER_GROUPS,
  TASK_GROUPS,
  progressForGroupIds,
  progressStats,
} from '../portal/data';

type Props = {
  checked: Set<string>;
  onToggle: (id: string) => void;
};

const ROADMAP_SECTIONS = [
  { id: 'platform', title: 'Платформа', groups: ['done-foundation', 'mobile-polish', 'online-now', 'beta-release'] },
  { id: 'marketing', title: 'Маркетинг (г)', groups: ['marketing'] },
  { id: 'offline-ge', title: 'Грузия (а)', groups: ['offline-ge'] },
  { id: 'monetization', title: 'Монетизация (б)', groups: ['iap-infra', 'iap-shop', 'iap-features', 'cc-core', 'cc-tournaments'] },
  { id: 'ws', title: 'WebSocket (в)', groups: ['ws-server', 'ws-client', 'ws-migrate'] },
] as const;

export function RoadmapPage({ checked, onToggle }: Props) {
  const program = progressStats(PHASE1_GROUP_IDS, checked);
  const phase1Dirs = DIRECTIONS.filter((d) => d.phase === 1);

  return (
    <div className="page">
      <header className="page-hero split">
        <div>
          <p className="eyebrow">Roadmap · фаза 1</p>
          <h1>Чеклисты и вехи</h1>
          <p className="lead">
            {program.done} из {program.total} шагов выполнено · отмечайте по мере готовности
          </p>
        </div>
        <RingProgress value={program.pct} size={100} label="Всего" />
      </header>

      <section className="panel panel--resources">
        <ResourceHub variant="compact" />
      </section>

      <section className="panel">
        <h2>Прогресс по направлениям</h2>
        <div className="progress-list">
          {phase1Dirs.map((d) => (
            <div key={d.id} className="progress-row">
              <a href={`#${d.id}`} className="progress-row-label">
                <strong>{d.code}</strong> {d.title}
              </a>
              <ProgressBar value={progressForGroupIds(d.groupIds, checked)} size="sm" />
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Календарь Q2–Q4</h2>
        <div className="quarter-grid compact">
          {QUARTERS.map((q) => {
            const st = progressStats(QUARTER_GROUPS[q.progressKey] ?? [], checked);
            return (
              <article key={q.id} className="quarter-card">
                <h3>{q.label}</h3>
                <p className="quarter-theme">{q.theme}</p>
                <ProgressBar value={st.pct} label={`${st.done}/${st.total} шагов`} size="sm" />
              </article>
            );
          })}
        </div>
      </section>

      {ROADMAP_SECTIONS.map((section) => (
        <section key={section.id} id={section.id} className="panel panel-anchor">
          <h2>{section.title}</h2>
          {section.groups.map((gid) => {
            const group = TASK_GROUPS[gid];
            if (!group) return null;
            return (
              <TaskList
                key={gid}
                group={group}
                checked={checked}
                onToggle={onToggle}
                defaultOpen={gid !== 'done-foundation'}
              />
            );
          })}
        </section>
      ))}
    </div>
  );
}
