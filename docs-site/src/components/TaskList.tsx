import { ProgressBar } from './ProgressBar';
import { TaskWorkRow } from './TaskWorkRow';
import type { TaskGroup } from '../portal/types';
import type { TaskWorkApi } from '../portal/useTaskWork';
import { usePortalAuth } from '../contexts/PortalAuthContext';

type Props = {
  group: TaskGroup;
  work: TaskWorkApi;
  defaultOpen?: boolean;
  showSteps?: boolean;
};

export function TaskList({
  group,
  work,
  defaultOpen = true,
  showSteps = true,
}: Props) {
  const { user } = usePortalAuth();
  const done = group.tasks.filter((t) => work.checked.has(t.id)).length;
  const total = group.tasks.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <details className="task-group" open={defaultOpen} id={group.id}>
      <summary className="task-group-summary">
        <div className="task-group-summary-text">
          <h3>{group.title}</h3>
          {group.subtitle && <p className="task-group-sub">{group.subtitle}</p>}
        </div>
        <div className="task-group-summary-meta">
          <span className="task-count">
            {done}/{total}
          </span>
          <span className={`task-pct-badge ${pct >= 100 ? 'complete' : ''}`}>{pct}%</span>
        </div>
      </summary>
      <div className="task-group-body">
        <ProgressBar value={pct} size="sm" showPct={false} />
        <ul className="task-list">
          {group.tasks.map((task) => (
            <TaskWorkRow
              key={task.id}
              task={task}
              groupTitle={group.title}
              groupId={group.id}
              status={work.getStatus(task.id)}
              remote={work.remoteStates.get(task.id)}
              syncEnabled={work.syncEnabled}
              currentUserId={user?.id}
              onToggle={() => work.toggle(task.id)}
              onClaim={() => work.claimTask(task.id)}
              onRelease={() => work.releaseTask(task.id)}
              onComplete={() => work.completeTask(task.id)}
            />
          ))}
        </ul>
      </div>
    </details>
  );
}
