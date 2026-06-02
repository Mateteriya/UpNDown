import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { TaskList } from '../components/TaskList';
import { ProgressBar } from '../components/ProgressBar';
import { RingProgress } from '../components/RingProgress';
import { StatusBadge } from '../components/StatusBadge';
import { TableShell } from '../components/TableShell';
import { APP_TABS, APP_TRACKS, TASK_GROUPS, progressStats } from '../portal/data';

type Props = {
  checked: Set<string>;
  onToggle: (id: string) => void;
};

function TrackPanel({
  groupIds,
  checked,
  onToggle,
}: {
  groupIds: string[];
  checked: Set<string>;
  onToggle: (id: string) => void;
}) {
  const st = progressStats(groupIds, checked);
  return (
    <>
      <div className="track-header">
        <RingProgress value={st.pct} size={88} tone="cyan" />
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
        return <TaskList key={gid} group={group} checked={checked} onToggle={onToggle} />;
      })}
    </>
  );
}

function OverviewTab({ checked, onToggle }: Props) {
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
              const st = progressStats(r.ids, checked);
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
      <TrackPanel
        groupIds={APP_TRACKS.overview}
        checked={checked}
        onToggle={onToggle}
      />
    </div>
  );
}

export function AppPlanPage({ checked, onToggle }: Props) {
  const allApp = [...APP_TRACKS.ws, ...APP_TRACKS.iap, ...APP_TRACKS.cc, ...APP_TRACKS.overview];
  const total = progressStats(allApp, checked);

  return (
    <div className="page">
      <header className="page-hero split">
        <div>
          <p className="eyebrow">Приложение · репозиторий</p>
          <h1>WS · IAP · CC</h1>
          <p className="lead">Конкретные шаги с владельцем, приоритетом и сроком</p>
        </div>
        <RingProgress value={total.pct} size={100} label="App" tone="green" />
      </header>

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
          <Route index element={<OverviewTab checked={checked} onToggle={onToggle} />} />
          <Route
            path="ws"
            element={
              <TrackPanel groupIds={APP_TRACKS.ws} checked={checked} onToggle={onToggle} />
            }
          />
          <Route
            path="iap"
            element={
              <TrackPanel groupIds={APP_TRACKS.iap} checked={checked} onToggle={onToggle} />
            }
          />
          <Route
            path="cc"
            element={
              <TrackPanel groupIds={APP_TRACKS.cc} checked={checked} onToggle={onToggle} />
            }
          />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </section>
    </div>
  );
}
