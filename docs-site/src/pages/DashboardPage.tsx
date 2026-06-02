import { Link } from 'react-router-dom';
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

const DIRECTION_ACCENTS = ['cyan', 'green', 'gold', 'violet', 'cyan'] as const;
const TRACK_META = [
  { key: 'ws', label: 'WebSocket', to: '/app/ws', accent: 'cyan' as const },
  { key: 'iap', label: 'IAP', to: '/app/iap', accent: 'green' as const },
  { key: 'cc', label: 'Cosmic Credits', to: '/app/cc', accent: 'violet' as const },
  { key: 'overview', label: 'Платформа', to: '/app', accent: 'gold' as const },
];

type Props = {
  checked: Set<string>;
};

export function DashboardPage({ checked }: Props) {
  const phase1 = DIRECTIONS.filter((d) => d.phase === 1);
  const program = progressStats(PHASE1_GROUP_IDS, checked);
  const phase2 = progressStats(PHASE2_GROUP_IDS, checked);

  const milestonesDone = MILESTONES.filter(
    (m) => progressForGroupIds(m.groupIds, checked) >= 100,
  ).length;
  const nextMilestone = MILESTONES.find((m) => progressForGroupIds(m.groupIds, checked) < 100);

  return (
    <div className="page dashboard">
      <header className="dashboard-hero dashboard-hero--neon">
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
        <div className="dashboard-hero-ring">
          <RingProgress value={program.pct} label="Фаза 1" tone="gold" />
        </div>
      </header>

      <KpiSection title="Программа" hint="Общий прогресс фазы 1 и волны 2">
        <div className="stat-row stat-row--neon">
          <StatCard
            label="Фаза 1"
            value={`${program.done}/${program.total}`}
            sub={`${program.remaining} шагов осталось`}
            accent="cyan"
            to="/roadmap"
          />
          <StatCard label="Выполнено" value={`${program.pct}%`} sub="все треки Q2–Q4" accent="green" to="/roadmap" />
          <StatCard label="Фаза 2" value={`${phase2.pct}%`} sub="entity + лицензии" accent="violet" to="/later" />
          <StatCard label="Направлений" value={phase1.length} sub="параллельно а–г + платформа" accent="gold" />
        </div>
      </KpiSection>

      <KpiSection title="Треки в репозитории" hint="WS · IAP · CC · платформа — клик открывает чеклист">
        <div className="stat-row stat-row--neon">
          {TRACK_META.map((t) => {
            const st = progressStats(APP_TRACKS[t.key], checked);
            return (
              <StatCard
                key={t.key}
                label={t.label}
                value={`${st.pct}%`}
                sub={`${st.done}/${st.total} шагов`}
                accent={t.accent}
                to={t.to}
              />
            );
          })}
        </div>
      </KpiSection>

      <KpiSection title="Направления а–г" hint="Прогресс по каждому вектору работ">
        <div className="stat-row stat-row--neon">
          {phase1.map((d, i) => {
            const st = progressStats(d.groupIds, checked);
            const link = d.link?.startsWith('/roadmap') ? '/roadmap' : d.link ?? '/roadmap';
            return (
              <StatCard
                key={d.id}
                label={`${d.code.toUpperCase()} · ${d.title}`}
                value={`${st.pct}%`}
                sub={`${st.done}/${st.total} · ${d.owner}`}
                accent={DIRECTION_ACCENTS[i % DIRECTION_ACCENTS.length]}
                to={link}
              />
            );
          })}
        </div>
      </KpiSection>

      <KpiSection title="Кварталы 2026" hint="Фокус года по кварталам">
        <div className="stat-row stat-row--neon">
          {QUARTERS.map((q, i) => {
            const gids = QUARTER_GROUPS[q.progressKey] ?? [];
            const st = progressStats(gids, checked);
            const accents = ['cyan', 'green', 'gold'] as const;
            return (
              <StatCard
                key={q.id}
                label={q.label}
                value={`${st.pct}%`}
                sub={q.theme}
                accent={accents[i % accents.length]}
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
            accent="green"
            to="/roadmap"
          />
          <StatCard
            label="Следующая веха"
            value={nextMilestone ? nextMilestone.quarter : '—'}
            sub={nextMilestone?.title ?? 'Все вехи закрыты'}
            accent="gold"
            to="/roadmap"
          />
          {MILESTONES.slice(0, 2).map((m, i) => {
            const pct = progressForGroupIds(m.groupIds, checked);
            return (
              <StatCard
                key={m.id}
                label={m.title}
                value={`${pct}%`}
                sub={`Цель · ${m.quarter}`}
                accent={i === 0 ? 'cyan' : 'violet'}
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
        <DirectionGrid directions={phase1} checked={checked} />
      </section>

      <section className="panel">
        <h2>Детали по кварталам</h2>
        <p className="panel-intro">Прогресс-бары по группам задач</p>
        <div className="quarter-grid">
          {QUARTERS.map((q, i) => {
            const gids = QUARTER_GROUPS[q.progressKey] ?? [];
            const st = progressStats(gids, checked);
            const accent = ['cyan', 'green', 'gold', 'violet'][i % 4];
            return (
              <article key={q.id} className={`quarter-card quarter-card--${accent}`}>
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
            const pct = progressForGroupIds(m.groupIds, checked);
            return (
              <li key={m.id} className={pct >= 100 ? 'milestone done' : 'milestone'}>
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
