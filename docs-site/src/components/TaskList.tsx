import { ProgressBar } from './ProgressBar';
import type { TaskGroup } from '../portal/types';
import { OWNER_LABELS, PRIORITY_LABELS } from '../portal/types';

type Props = {
  group: TaskGroup;
  checked: Set<string>;
  onToggle: (id: string) => void;
  defaultOpen?: boolean;
  showSteps?: boolean;
};

export function TaskList({
  group,
  checked,
  onToggle,
  defaultOpen = true,
  showSteps = true,
}: Props) {
  const done = group.tasks.filter((t) => checked.has(t.id)).length;
  const total = group.tasks.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <details className="task-group" open={defaultOpen}>
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
          {group.tasks.map((task, index) => {
            const isDone = checked.has(task.id);
            return (
              <li key={task.id} className={`task-item ${isDone ? 'done' : ''}`}>
                <div className="task-row">
                  {showSteps && <span className="task-step">{index + 1}</span>}
                  <label className="task-check">
                    <input type="checkbox" checked={isDone} onChange={() => onToggle(task.id)} />
                    <span className="task-label">{task.label}</span>
                  </label>
                  <div className="task-badges">
                    {task.priority && (
                      <span className={`priority priority-${task.priority}`}>
                        {PRIORITY_LABELS[task.priority]}
                      </span>
                    )}
                    {task.owner && (
                      <span className="owner-badge">{OWNER_LABELS[task.owner]}</span>
                    )}
                    {task.eta && <span className="eta-badge">{task.eta}</span>}
                  </div>
                </div>
                {task.hint && <p className="task-hint">✓ {task.hint}</p>}
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
