import { TaskList } from '../components/TaskList';
import { DIRECTIONS, TASK_GROUPS } from '../portal/data';

type Props = {
  checked: Set<string>;
  onToggle: (id: string) => void;
};

export function LaterPage({ checked, onToggle }: Props) {
  const phase2 = DIRECTIONS.filter((d) => d.phase === 2);

  return (
    <div className="page">
      <header className="page-hero">
        <p className="eyebrow">Вторая очередь</p>
        <h1>Online-деньги и лицензии</h1>
        <p className="lead">
          Только после стабильных слоёв 1–3, метрик и офлайн-кейса. Не смешивать с CC и IAP.
        </p>
      </header>

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
            return (
              <TaskList key={gid} group={group} checked={checked} onToggle={onToggle} />
            );
          })}
        </section>
      ))}
    </div>
  );
}
