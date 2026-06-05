import { Link } from 'react-router-dom';
import { BrandEmblem } from '../components/BrandEmblem';
import { DirectionGrid } from '../components/DirectionGrid';
import { KpiSection } from '../components/KpiSection';
import { ProgressBar } from '../components/ProgressBar';
import { ResourceHub } from '../components/ResourceHub';
import { RingProgress } from '../components/RingProgress';
import { PortalUrlCopy } from '../components/PortalUrlCopy';
import { StatCard } from '../components/StatCard';
import {
  APP_TRACKS,
  CONCEPT_TAGLINE,
  DIRECTIONS,
  MILESTONES,
  PHASE1_GROUP_IDS,
  PHASE2_GROUP_IDS,
  QUARTERS,
  QUARTER_GROUPS,
  progressForGroupIds,
  progressStats,
} from '../portal/data';
import { progressToAccent } from '../portal/progressAccent';
import { taskCatalogById } from '../portal/taskCatalog';
import type { TaskWorkApi } from '../portal/useTaskWork';

const TRACK_META = [
  { key: 'ws' as const, label: 'WebSocket', to: '/app/ws' },
  { key: 'iap' as const, label: 'IAP', to: '/app/iap' },
  { key: 'cc' as const, label: 'Cosmic Credits', to: '/app/cc' },
  { key: 'overview' as const, label: 'Платформа', to: '/app' },
];

type Props = {
  work: TaskWorkApi;
};

export function DashboardPage({ work }: Props) {
  const phase1 = DIRECTIONS.filter((d) => d.phase === 1);
  const program = progressStats(PHASE1_GROUP_IDS, work.checked);
  const phase2 = progressStats(PHASE2_GROUP_IDS, work.checked);

  const milestonesDone = MILESTONES.filter(
    (m) => progressForGroupIds(m.groupIds, work.checked) >= 100,
  ).length;
  const nextMilestone = MILESTONES.find((m) => progressForGroupIds(m.groupIds, work.checked) < 100);
  const milestonesPct = MILESTONES.length
    ? Math.round((milestonesDone / MILESTONES.length) * 100)
    : 0;
  const nextMilestonePct = nextMilestone ? progressForGroupIds(nextMilestone.groupIds, work.checked) : 100;
  const dirsAvg =
    phase1.length > 0
      ? phase1.reduce((s, d) => s + progressForGroupIds(d.groupIds, work.checked), 0) / phase1.length
      : 0;
  const inProgress = work.inProgressTasks;
  const catalog = taskCatalogById();

  return (
    <div className="page dashboard">
      <header className="dashboard-hero dashboard-hero--neon page-hero--branded">
        <div className="page-hero-main">
          <BrandEmblem size="hero" embossed glow />
          <div className="dashboard-hero-text">
          <p className="eyebrow eyebrow--neon">Program overview</p>
          <h1>Up&Down — дорожная карта</h1>
          <p className="lead">{CONCEPT_TAGLINE}</p>
          <div className="hero-actions">
            <Link to="/roadmap" className="btn primary btn-neon-gold">
              Все чеклисты
            </Link>
            <Link to="/app/ws" className="btn btn-neon-cyan">
              План WS →
            </Link>
            <Link to="/resources" className="btn btn-neon-violet">
              Ресурсы
            </Link>
            <Link to="/concept" className="btn btn-ghost-neon">
              Концепция
            </Link>
          </div>
          </div>
        </div>
        <div className="dashboard-hero-ring">
          <RingProgress value={program.pct} label="Фаза 1" />
        </div>
      </header>

      <KpiSection
        title="Программа"
        hint="Общий прогресс фазы 1 и волны 2 · подсветка: ≥76% зелёный · 51–75% циан · 26–50% золото · ≤25% сирень"
      >
        <div className="stat-row stat-row--neon">
          <StatCard
            label="Фаза 1"
            value={`${program.done}/${program.total}`}
            sub={`${program.remaining} шагов осталось`}
            progressPct={program.pct}
            to="/roadmap"
          />
          <StatCard
            label="Выполнено"
            value={`${program.pct}%`}
            sub="все треки Q2–Q4"
            progressPct={program.pct}
            to="/roadmap"
          />
          <StatCard
            label="Фаза 2"
            value={`${phase2.pct}%`}
            sub="entity + лицензии"
            progressPct={phase2.pct}
            to="/later"
          />
          <StatCard
            label="Направлений"
            value={phase1.length}
            sub="параллельно а–г + платформа"
            progressPct={dirsAvg}
          />
        </div>
      </KpiSection>

      {inProgress.length > 0 && (
        <KpiSection title="Сейчас в работе" hint="Видно всей команде после входа через Google">
          <div className="in-progress-list">
            {inProgress.map((row) => (
              <Link key={row.task_id} to="/work" className="in-progress-item">
                <span className="in-progress-label">
                  {catalog.get(row.task_id)?.task.label ?? row.task_id}
                </span>
                <span className="in-progress-who">{row.assignee_display ?? 'Участник'}</span>
              </Link>
            ))}
          </div>
          <p className="panel-intro">
            <Link to="/work">Открыть раздел «Работа» →</Link>
          </p>
        </KpiSection>
      )}

      <KpiSection title="Треки в репозитории" hint="WS · IAP · CC · платформа — клик открывает чеклист">
        <div className="stat-row stat-row--neon">
          {TRACK_META.map((t) => {
            const st = progressStats(APP_TRACKS[t.key], work.checked);
            return (
              <StatCard
                key={t.key}
                label={t.label}
                value={`${st.pct}%`}
                sub={`${st.done}/${st.total} шагов`}
                progressPct={st.pct}
                to={t.to}
              />
            );
          })}
        </div>
      </KpiSection>

      <KpiSection title="Направления а–г" hint="Прогресс по каждому вектору работ">
        <div className="stat-row stat-row--neon">
          {phase1.map((d) => {
            const st = progressStats(d.groupIds, work.checked);
            const link = d.link?.startsWith('/roadmap') ? '/roadmap' : d.link ?? '/roadmap';
            return (
              <StatCard
                key={d.id}
                label={`${d.code.toUpperCase()} · ${d.title}`}
                value={`${st.pct}%`}
                sub={`${st.done}/${st.total} · ${d.owner}`}
                progressPct={st.pct}
                to={link}
              />
            );
          })}
        </div>
      </KpiSection>

      <KpiSection title="Кварталы 2026" hint="Фокус года по кварталам">
        <div className="stat-row stat-row--neon">
          {QUARTERS.map((q) => {
            const gids = QUARTER_GROUPS[q.progressKey] ?? [];
            const st = progressStats(gids, work.checked);
            return (
              <StatCard
                key={q.id}
                label={q.label}
                value={`${st.pct}%`}
                sub={q.theme}
                progressPct={st.pct}
                to="/roadmap"
              />
            );
          })}
        </div>
      </KpiSection>

      <KpiSection title="Вехи" hint="Крупные результаты программы">
        <div className="stat-row stat-row--neon">
          <StatCard
            label="Вех закрыто"
            value={`${milestonesDone}/${MILESTONES.length}`}
            sub="все шаги вехи отмечены"
            progressPct={milestonesPct}
            to="/roadmap"
          />
          <StatCard
            label="Следующая веха"
            value={nextMilestone ? nextMilestone.quarter : '—'}
            sub={nextMilestone?.title ?? 'Все вехи закрыты'}
            progressPct={nextMilestonePct}
            to="/roadmap"
          />
          {MILESTONES.slice(0, 2).map((m) => {
            const pct = progressForGroupIds(m.groupIds, work.checked);
            return (
              <StatCard
                key={m.id}
                label={m.title}
                value={`${pct}%`}
                sub={`Цель · ${m.quarter}`}
                progressPct={pct}
                to="/roadmap"
              />
            );
          })}
        </div>
      </KpiSection>

      <PortalUrlCopy />

      <section className="panel panel--resources">
        <ResourceHub variant="dashboard" />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Направления — карточки</h2>
          <span className="muted">Кратко + ссылка на план</span>
        </div>
        <DirectionGrid directions={phase1} work={work} />
      </section>

      <section className="panel">
        <h2>Детали по кварталам</h2>
        <p className="panel-intro">Прогресс-бары по группам задач</p>
        <div className="quarter-grid">
          {QUARTERS.map((q) => {
            const gids = QUARTER_GROUPS[q.progressKey] ?? [];
            const st = progressStats(gids, work.checked);
            const accent = progressToAccent(st.pct);
            return (
              <article key={q.id} className={`quarter-card accent-${accent}`}>
                <header>
                  <h3>{q.label}</h3>
                  <span className="quarter-pct">{st.pct}%</span>
                </header>
                <p className="quarter-theme">{q.theme}</p>
                <ProgressBar value={st.pct} size="sm" showPct={false} />
                <p className="quarter-meta">
                  {st.done}/{st.total} шагов
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <h2>Ключевые вехи — прогресс</h2>
        <ul className="milestone-list">
          {MILESTONES.map((m) => {
            const pct = progressForGroupIds(m.groupIds, work.checked);
            const accent = progressToAccent(pct);
            return (
              <li
                key={m.id}
                className={`milestone accent-${accent}${pct >= 100 ? ' done' : ''}`}
              >
                <span className="milestone-q">{m.quarter}</span>
                <div className="milestone-body">
                  <strong>{m.title}</strong>
                  <ProgressBar value={pct} size="sm" label="Готовность" />
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
