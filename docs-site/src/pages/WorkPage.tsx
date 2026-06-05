import { useMemo, useState } from 'react';
import { PageHero } from '../components/PageHero';
import { TaskWorkRow } from '../components/TaskWorkRow';
import { buildTaskCatalog } from '../portal/taskCatalog';
import { useMemberRole } from '../portal/useMemberRole';
import { progressToAccent } from '../portal/progressAccent';
import { OWNER_LABELS } from '../portal/types';
import type { TaskWorkApi } from '../portal/useTaskWork';
import { usePortalAuth } from '../contexts/PortalAuthContext';

type Tab = 'all' | 'in_progress' | 'mine' | 'recommended';

type Props = {
  work: TaskWorkApi;
};

export function WorkPage({ work }: Props) {
  const { user } = usePortalAuth();
  const { role: memberRole } = useMemberRole();
  const [tab, setTab] = useState<Tab>('all');

  const catalog = useMemo(() => buildTaskCatalog(), []);

  const filtered = useMemo(() => {
    return catalog.filter(({ task }) => {
      const status = work.getStatus(task.id);
      const remote = work.remoteStates.get(task.id);
      if (tab === 'in_progress') return status === 'in_progress';
      if (tab === 'mine') {
        return (
          status === 'in_progress' &&
          !!user?.id &&
          remote?.assignee_user_id === user.id
        );
      }
      if (tab === 'recommended') {
        if (!memberRole) return false;
        if (status === 'done') return false;
        return task.owner === memberRole || task.owner === 'all';
      }
      return status !== 'done';
    });
  }, [catalog, tab, work, user, memberRole]);

  const inProgressCount = work.inProgressTasks.length;

  return (
    <div className="page work-page">
      <PageHero
        eyebrow="Команда"
        title="Работа"
        lead={`${inProgressCount} задач сейчас в работе · статусы общие после входа через Google`}
        neon
        emblemSize="lg"
      />

      <p className="panel-intro work-usage-hint">
        <strong>Текст задачи</strong> — переход в Roadmap к блоку.{' '}
        <strong>Галочка</strong> — «Готово» (задача уйдёт из «Все открытые»).{' '}
        <strong>Взять в работу</strong> — отдельная кнопка.
      </p>

      <div className="work-tabs subtabs" role="tablist">
        {(
          [
            ['all', 'Все открытые'],
            ['in_progress', `В работе (${inProgressCount})`],
            ['mine', 'Мои'],
            ['recommended', 'Рекомендовано мне'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'subtab active' : 'subtab'}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'recommended' && !memberRole && (
        <p className="panel-intro work-role-hint">
          Выберите роль в шапке (выпадающий список «Роль…»), затем снова откройте вкладку «Рекомендовано
          мне».
        </p>
      )}

      {tab === 'recommended' && memberRole && (
        <p className="panel-intro work-role-hint work-role-hint--active">
          Роль: <strong>{OWNER_LABELS[memberRole]}</strong> · показано {filtered.length} открытых
          задач
        </p>
      )}

      <section className="panel work-task-panel">
        {filtered.length === 0 ? (
          <p className="muted work-empty">Нет задач в этом фильтре.</p>
        ) : (
          <div className="task-list task-list--work-page" role="list">
            {filtered.map(({ task, groupId, groupTitle }) => {
              const status = work.getStatus(task.id);
              const accent = progressToAccent(
                status === 'done' ? 100 : status === 'in_progress' ? 60 : 10,
              );
              return (
                <div
                  key={task.id}
                  role="listitem"
                  className={`work-card-wrap accent-${accent}`}
                >
                  <TaskWorkRow
                    task={task}
                    groupTitle={groupTitle}
                    groupId={groupId}
                    status={status}
                    remote={work.remoteStates.get(task.id)}
                    syncEnabled={work.syncEnabled}
                    currentUserId={user?.id}
                    onToggle={() => work.toggle(task.id)}
                    onClaim={() => work.claimTask(task.id)}
                    onRelease={() => work.releaseTask(task.id)}
                    onComplete={() => work.completeTask(task.id)}
                    showBreadcrumb
                    as="div"
                    titleLinksToRoadmap
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
