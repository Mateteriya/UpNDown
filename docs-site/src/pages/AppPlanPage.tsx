import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { PageHero } from '../components/PageHero';
import { TaskList } from '../components/TaskList';
import { ProgressBar } from '../components/ProgressBar';
import { RingProgress } from '../components/RingProgress';
import { StatusBadge } from '../components/StatusBadge';
import { TableShell } from '../components/TableShell';
import { APP_TABS, APP_TRACKS, TASK_GROUPS, progressStats } from '../portal/data';
import type { TaskWorkApi } from '../portal/useTaskWork';

type Props = {
  work: TaskWorkApi;
};

function TrackPanel({ groupIds, work }: { groupIds: string[]; work: TaskWorkApi }) {
  const st = progressStats(groupIds, work.checked);
  return (
    <>
      <div className="track-header">
        <RingProgress value={st.pct} size={88} />
        <div>
          <p className="track-stat">
            <strong>{st.done}</strong> / {st.total} шагов
          </p>
          <ProgressBar value={st.pct} label="Трек" />
        </div>
      </div>
      {groupIds.map((gid) => {
        const group = TASK_GROUPS[gid];
        if (!group) return null;
        return <TaskList key={gid} group={group} work={work} />;
      })}
    </>
  );
}

function OverviewTab({ work }: Props) {
  const rows: { label: string; ids: string[]; status: string; tone: 'ok' | 'warn' | 'todo' }[] = [
    { label: 'Онлайн Supabase', ids: ['done-foundation'], status: 'Работает', tone: 'ok' },
    { label: 'WebSocket', ids: ['ws-server', 'ws-client'], status: 'В разработке', tone: 'todo' },
    { label: 'IAP / магазин', ids: ['iap-infra'], status: 'Не начато', tone: 'todo' },
    { label: 'CC ledger UI', ids: ['cc-core'], status: 'БД есть, UI нет', tone: 'warn' },
    { label: 'Beta gate', ids: ['beta-release'], status: 'Критерии ниже', tone: 'warn' },
  ];

  return (
    <div className="tab-panel">
      <TableShell
        caption="Сводка треков"
        hint="Статус словами + прогресс по чеклистам в репозитории"
      >
        <table className="data-table status-table">
          <thead>
            <tr>
              <th scope="col">Трек</th>
              <th scope="col">Статус</th>
              <th scope="col">Прогресс</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const st = progressStats(r.ids, work.checked);
              return (
                <tr key={r.label}>
                  <th scope="row">{r.label}</th>
                  <td>
                    <StatusBadge tone={r.tone}>{r.status}</StatusBadge>
                  </td>
                  <td className="data-table-progress">
                    <ProgressBar value={st.pct} size="sm" showPct />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableShell>
      <h2>Платформа и beta-gate</h2>
      <TrackPanel groupIds={APP_TRACKS.overview} work={work} />
    </div>
  );
}

export function AppPlanPage({ work }: Props) {
  const allApp = [...APP_TRACKS.ws, ...APP_TRACKS.iap, ...APP_TRACKS.cc, ...APP_TRACKS.overview];
  const total = progressStats(allApp, work.checked);

  return (
    <div className="page">
      <PageHero
        eyebrow="Приложение · репозиторий"
        title="WS · IAP · CC"
        lead="Конкретные шаги с владельцем, приоритетом и сроком"
        aside={<RingProgress value={total.pct} size={100} label="App" />}
        neon
        emblemSize="xl"
      />

      <div className="subtabs">
        {APP_TABS.map((tab) => (
          <NavLink
            key={tab.id}
            to={tab.path}
            end={tab.id === 'overview'}
            className={({ isActive }) => (isActive ? 'subtab active' : 'subtab')}
          >
            {tab.label}
          </NavLink>
        ))}
      </div>

      <section className="panel panel-flush">
        <Routes>
          <Route index element={<OverviewTab work={work} />} />
          <Route path="ws" element={<TrackPanel groupIds={APP_TRACKS.ws} work={work} />} />
          <Route path="iap" element={<TrackPanel groupIds={APP_TRACKS.iap} work={work} />} />
          <Route path="cc" element={<TrackPanel groupIds={APP_TRACKS.cc} work={work} />} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </section>
    </div>
  );
}
