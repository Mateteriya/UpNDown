import { PageHero } from '../components/PageHero';
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
import { progressToAccent } from '../portal/progressAccent';
import type { TaskWorkApi } from '../portal/useTaskWork';

type Props = {
  work: TaskWorkApi;
};

const ROADMAP_SECTIONS = [
  { id: 'platform', title: 'Платформа', groups: ['done-foundation', 'mobile-polish', 'online-now', 'beta-release'] },
  { id: 'marketing', title: 'Маркетинг (г)', groups: ['marketing'] },
  { id: 'offline-ge', title: 'Грузия (а)', groups: ['offline-ge'] },
  { id: 'monetization', title: 'Монетизация (б)', groups: ['iap-infra', 'iap-shop', 'iap-features', 'cc-core', 'cc-tournaments'] },
  { id: 'ws', title: 'WebSocket (в)', groups: ['ws-server', 'ws-client', 'ws-migrate'] },
] as const;

export function RoadmapPage({ work }: Props) {
  const program = progressStats(PHASE1_GROUP_IDS, work.checked);
  const phase1Dirs = DIRECTIONS.filter((d) => d.phase === 1);

  return (
    <div className="page">
      <PageHero
        eyebrow="Roadmap · фаза 1"
        title="Чеклисты и вехи"
        lead={`${program.done} из ${program.total} шагов выполнено · «Взять в работу» — после входа через Google`}
        aside={<RingProgress value={program.pct} size={100} label="Всего" />}
        emblemSize="xl"
      />

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
              <ProgressBar value={progressForGroupIds(d.groupIds, work.checked)} size="sm" />
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Календарь Q2–Q4</h2>
        <div className="quarter-grid compact">
          {QUARTERS.map((q) => {
            const st = progressStats(QUARTER_GROUPS[q.progressKey] ?? [], work.checked);
            return (
              <article key={q.id} className={`quarter-card accent-${progressToAccent(st.pct)}`}>
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
                work={work}
                defaultOpen={gid !== 'done-foundation'}
              />
            );
          })}
        </section>
      ))}
    </div>
  );
}
