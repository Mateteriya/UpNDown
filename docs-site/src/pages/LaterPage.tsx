import { PageHero } from '../components/PageHero';
import { TaskList } from '../components/TaskList';
import { DIRECTIONS, TASK_GROUPS } from '../portal/data';
import type { TaskWorkApi } from '../portal/useTaskWork';

type Props = {
  work: TaskWorkApi;
};

export function LaterPage({ work }: Props) {
  const phase2 = DIRECTIONS.filter((d) => d.phase === 2);

  return (
    <div className="page">
      <PageHero
        eyebrow="Вторая очередь"
        title="Online-деньги и лицензии"
        lead="Только после стабильных слоёв 1–3, метрик и офлайн-кейса. Не смешивать с CC и IAP."
        emblemSize="lg"
      />

      {phase2.map((d) => (
        <section key={d.id} className="panel">
          <h2>
            <span className="direction-code">{d.code}</span> {d.title}
          </h2>
          <p>{d.summary}</p>
          <p className="owner">
            <strong>{d.owner}</strong>
          </p>
          {d.groupIds.map((gid) => {
            const group = TASK_GROUPS[gid];
            if (!group) return null;
            return <TaskList key={gid} group={group} work={work} />;
          })}
        </section>
      ))}
    </div>
  );
}
