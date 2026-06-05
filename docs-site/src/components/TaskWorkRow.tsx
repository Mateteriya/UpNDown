import { Link } from 'react-router-dom';
import type { TaskItem } from '../portal/types';
import type { PortalTaskState, TaskWorkStatus } from '../portal/taskState';
import { OWNER_LABELS, PRIORITY_LABELS } from '../portal/types';
import { EntityBreadcrumb } from './EntityBreadcrumb';

type Props = {
  task: TaskItem;
  groupTitle: string;
  groupId: string;
  status: TaskWorkStatus;
  remote?: PortalTaskState;
  syncEnabled: boolean;
  currentUserId?: string;
  onToggle: () => void;
  onClaim: () => void;
  onRelease: () => void;
  onComplete: () => void;
  showBreadcrumb?: boolean;
  /** В списке Roadmap — <li>; на странице «Работа» — <div> */
  as?: 'li' | 'div';
  /** Текст задачи ведёт в Roadmap, а не переключает галочку */
  titleLinksToRoadmap?: boolean;
};

const STATUS_LABELS: Record<TaskWorkStatus, string> = {
  todo: 'Не начато',
  in_progress: 'В работе',
  done: 'Готово',
};

function scrollToGroup(groupId: string) {
  window.setTimeout(() => {
    document.getElementById(groupId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 50);
}

export function TaskWorkRow({
  task,
  groupTitle,
  groupId,
  status,
  remote,
  syncEnabled,
  currentUserId,
  onToggle,
  onClaim,
  onRelease,
  onComplete,
  showBreadcrumb = false,
  as = 'li',
  titleLinksToRoadmap = false,
}: Props) {
  const Tag = as;
  const isDone = status === 'done';
  const inProgress = status === 'in_progress';
  const isMine =
    !!currentUserId && remote?.assignee_user_id === currentUserId && inProgress;
  const inputId = `task-cb-${task.id}`;

  return (
    <Tag
      className={[
        'task-item',
        'task-item--work',
        isDone ? 'done' : '',
        inProgress ? 'in-progress' : '',
        `task-status-${status}`,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {showBreadcrumb && (
        <EntityBreadcrumb
          crumbs={[
            { label: 'Roadmap', href: '#/roadmap' },
            { label: groupTitle, href: `#/roadmap` },
            { label: task.label.slice(0, 48) + (task.label.length > 48 ? '…' : '') },
          ]}
        />
      )}
      <div className="task-row">
        <div className="task-check">
          <input
            id={inputId}
            type="checkbox"
            checked={isDone}
            onChange={onToggle}
            aria-label={`Готово: ${task.label}`}
          />
          {titleLinksToRoadmap ? (
            <Link
              to="/roadmap"
              className="task-label task-label-link"
              onClick={() => scrollToGroup(groupId)}
            >
              {task.label}
            </Link>
          ) : (
            <label htmlFor={inputId} className="task-label">
              {task.label}
            </label>
          )}
        </div>
        <div className="task-badges">
          <span className={`work-status-badge work-status-${status}`}>{STATUS_LABELS[status]}</span>
          {task.priority && (
            <span className={`priority priority-${task.priority}`}>
              {PRIORITY_LABELS[task.priority]}
            </span>
          )}
          {task.owner && <span className="owner-badge">{OWNER_LABELS[task.owner]}</span>}
          {task.eta && <span className="eta-badge">{task.eta}</span>}
        </div>
      </div>
      {inProgress && remote?.assignee_display && (
        <p className="task-assignee">
          В работе: <strong>{remote.assignee_display}</strong>
          {remote.updated_at && (
            <span className="task-assignee-time">
              {' '}
              · обновлено {new Date(remote.updated_at).toLocaleString('ru-RU')}
            </span>
          )}
        </p>
      )}
      {syncEnabled && !isDone && (
        <div className="task-work-actions">
          {!inProgress && (
            <button type="button" className="btn btn-sm btn-neon-cyan" onClick={onClaim}>
              Взять в работу
            </button>
          )}
          {isMine && (
            <>
              <button type="button" className="btn btn-sm btn-neon-gold" onClick={onComplete}>
                Готово
              </button>
              <button type="button" className="btn btn-sm btn-ghost-neon" onClick={onRelease}>
                Снять
              </button>
            </>
          )}
          {inProgress && !isMine && (
            <span className="task-work-hint muted">Занято другим участником</span>
          )}
        </div>
      )}
      {task.hint && <p className="task-hint">✓ {task.hint}</p>}
    </Tag>
  );
}
