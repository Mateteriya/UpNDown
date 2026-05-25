/**
 * Демо: как из очков раздач получаются «фишки» и победитель.
 */

import { useCallback, useState } from 'react';
import {
  PARTY_MONEY_VARIANTS,
  SCORING_DEMO_PARTY,
  computePartyMoney,
  type PartyMoneyVariantId,
} from '../game/partyMoneyScoring';

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: 'linear-gradient(165deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
  color: '#f8fafc',
  padding: '20px 16px 32px',
  boxSizing: 'border-box',
  maxWidth: 720,
  margin: '0 auto',
};

const cardStyle: React.CSSProperties = {
  borderRadius: 14,
  border: '1px solid rgba(148, 163, 184, 0.35)',
  background: 'rgba(15, 23, 42, 0.75)',
  padding: '16px 18px',
  marginBottom: 16,
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  fontSize: 12,
  color: '#94a3b8',
  fontWeight: 600,
  borderBottom: '1px solid rgba(71, 85, 105, 0.6)',
};

const tdStyle: React.CSSProperties = {
  padding: '10px',
  fontSize: 15,
  borderBottom: '1px solid rgba(51, 65, 85, 0.4)',
};

const navBtnStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 10,
  border: '1px solid rgba(148,163,184,0.5)',
  background: 'rgba(30,41,59,0.8)',
  color: '#f8fafc',
  fontSize: 24,
  cursor: 'pointer',
  lineHeight: 1,
};

const HIGHLIGHT_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  memory: { label: 'Похоже на память', color: '#fde68a', bg: 'rgba(251,191,36,0.2)' },
  interesting: { label: 'Интересный вариант', color: '#a5f3fc', bg: 'rgba(34,211,238,0.15)' },
  favorite: { label: 'Вам понравился', color: '#fbcfe8', bg: 'rgba(236,72,153,0.2)' },
  tournament: { label: 'Турнир / деньги', color: '#86efac', bg: 'rgba(34,197,94,0.18)' },
};

const INITIAL_INDEX = PARTY_MONEY_VARIANTS.findIndex((v) => v.id === 'accuracy_bonus');

interface ScoringDemoPageProps {
  onBack: () => void;
}

export function ScoringDemoPage({ onBack }: ScoringDemoPageProps) {
  const [index, setIndex] = useState(INITIAL_INDEX >= 0 ? INITIAL_INDEX : 0);
  const variant = PARTY_MONEY_VARIANTS[index] ?? PARTY_MONEY_VARIANTS[0];
  const result = computePartyMoney(SCORING_DEMO_PARTY, variant.id);

  const go = useCallback((delta: number) => {
    setIndex((i) => {
      const n = PARTY_MONEY_VARIANTS.length;
      return (i + delta + n) % n;
    });
  }, []);

  const jumpTo = useCallback((id: PartyMoneyVariantId) => {
    const i = PARTY_MONEY_VARIANTS.findIndex((v) => v.id === id);
    if (i >= 0) setIndex(i);
  }, []);

  const badge = variant.highlight ? HIGHLIGHT_BADGE[variant.highlight] : null;

  return (
    <div style={pageStyle}>
      <header style={{ marginBottom: 20 }}>
        <button
          type="button"
          onClick={onBack}
          style={{ ...navBtnStyle, width: 'auto', fontSize: 14, padding: '8px 14px' }}
        >
          ← Меню
        </button>
        <h1 style={{ fontSize: 22, margin: '12px 0 8px', lineHeight: 1.3 }}>Демо: очки и фишки</h1>
        <p style={{ margin: 0, fontSize: 15, color: '#cbd5e1', lineHeight: 1.5 }}>
          Одна партия (3 раздачи). Листайте ‹ › или точки — цифры пересчитаются.
        </p>
      </header>

      <div style={{ ...cardStyle, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 13, color: '#94a3b8', width: '100%' }}>Быстрый переход:</span>
        <QuickChip label="Середина" onClick={() => jumpTo('vs_average')} active={variant.id === 'vs_average'} />
        <QuickChip label="Точный заказ ★" onClick={() => jumpTo('accuracy_bonus')} active={variant.id === 'accuracy_bonus'} />
        <QuickChip label="Банк (турнир)" onClick={() => jumpTo('prize_pool')} active={variant.id === 'prize_pool'} />
      </div>

      <div style={cardStyle}>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#94a3b8' }}>
          {index + 1} / {PARTY_MONEY_VARIANTS.length}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" onClick={() => go(-1)} style={navBtnStyle} aria-label="Назад">
            ‹
          </button>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>{variant.shortTitle}</h2>
            {badge && (
              <span
                style={{
                  display: 'inline-block',
                  marginTop: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: 8,
                  color: badge.color,
                  background: badge.bg,
                }}
              >
                {badge.label}
              </span>
            )}
          </div>
          <button type="button" onClick={() => go(1)} style={navBtnStyle} aria-label="Вперёд">
            ›
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 14 }}>
          {PARTY_MONEY_VARIANTS.map((v, i) => (
            <button
              key={v.id}
              type="button"
              aria-label={v.shortTitle}
              onClick={() => setIndex(i)}
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                background: i === index ? '#a78bfa' : 'rgba(148,163,184,0.4)',
              }}
            />
          ))}
        </div>
      </div>

      <div style={{ ...cardStyle, borderColor: 'rgba(167, 139, 250, 0.45)' }}>
        <p style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 600, color: '#e9d5ff' }}>{variant.oneLine}</p>
        <ol style={{ margin: 0, paddingLeft: 20, color: '#cbd5e1', fontSize: 14, lineHeight: 1.55 }}>
          {variant.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        {variant.note && <p style={{ margin: '12px 0 0', fontSize: 13, color: '#94a3b8' }}>{variant.note}</p>}
        {variant.demoExplain && (
          <p
            style={{
              margin: '14px 0 0',
              fontSize: 14,
              color: '#e2e8f0',
              lineHeight: 1.55,
              padding: '12px 14px',
              borderRadius: 10,
              background: 'rgba(51, 65, 85, 0.35)',
              borderLeft: '3px solid #a78bfa',
            }}
          >
            {variant.demoExplain}
          </p>
        )}
      </div>

      <DealPointsTable />

      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16, color: '#94a3b8' }}>Итог</h3>
        {result.middleLine && <p style={{ margin: '0 0 12px', fontSize: 14, color: '#cbd5e1' }}>{result.middleLine}</p>}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Игрок</th>
              <th style={thStyle}>Очки</th>
              <th style={thStyle}>Фишки</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => {
              const isWinner = result.winners.includes(row.name);
              const chipColor = row.chips > 0 ? '#4ade80' : row.chips < 0 ? '#f87171' : '#e2e8f0';
              return (
                <tr key={row.name}>
                  <td style={tdStyle}>
                    {row.name}
                    {isWinner && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: '#fbbf24', fontWeight: 700 }}>★</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {row.rawPoints >= 0 ? '+' : ''}
                    {row.rawPoints}
                  </td>
                  <td style={{ ...tdStyle, color: chipColor, fontWeight: 700 }}>
                    {row.chips >= 0 ? '+' : ''}
                    {row.chips}
                    {row.extra && (
                      <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: '#94a3b8' }}>{row.extra}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p style={{ margin: '14px 0 0', fontSize: 15, fontWeight: 600, color: '#fbbf24' }}>
          {result.winners.length === 1
            ? `Победитель по фишкам: ${result.winners[0]}`
            : `Победители (ничья): ${result.winners.join(' и ')}`}
        </p>
        {variant.id === 'vs_average' && result.sumCheck === 0 && (
          <p style={{ margin: '8px 0 0', fontSize: 13, color: '#86efac', lineHeight: 1.5 }}>
            ✓ Сумма фишек = 0: вы поняли верно — это только переклад между игроками, без «лишнего» банка.
          </p>
        )}
        {variant.id === 'accuracy_bonus' && (
          <p style={{ margin: '8px 0 0', fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>
            Сумма фишек может быть ≠ 0 — за точные заказы добавляется «бонус сверху».
          </p>
        )}
        {variant.id === 'prize_pool' && (
          <p style={{ margin: '8px 0 0', fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>
            Приз из общего котла — удобная модель для турниров и платного входа в онлайне.
          </p>
        )}
      </div>
    </div>
  );
}

function QuickChip({
  label,
  onClick,
  active,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 13,
        padding: '8px 12px',
        borderRadius: 8,
        border: active ? '1px solid #22d3ee' : '1px solid rgba(148,163,184,0.45)',
        background: active ? 'rgba(34,211,238,0.2)' : 'rgba(30,41,59,0.6)',
        color: '#e2e8f0',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function DealPointsTable() {
  const party = SCORING_DEMO_PARTY;
  return (
    <div style={cardStyle}>
      <h3 style={{ margin: '0 0 12px', fontSize: 16, color: '#94a3b8' }}>Очки за раздачи (везде одинаково)</h3>
      {party.deals.map((d) => (
        <div key={d.label} style={{ marginBottom: 14 }}>
          <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600 }}>{d.label}</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle} />
                {party.players.map((p) => (
                  <th key={p} style={thStyle}>
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={tdStyle}>Заказ</td>
                {d.bids.map((b, i) => (
                  <td key={i} style={tdStyle}>
                    {b}
                  </td>
                ))}
              </tr>
              <tr>
                <td style={tdStyle}>Взял</td>
                {d.takens.map((t, i) => (
                  <td key={i} style={tdStyle}>
                    {t}
                  </td>
                ))}
              </tr>
              <tr>
                <td style={tdStyle}>Очки</td>
                {d.points.map((pt, i) => (
                  <td
                    key={i}
                    style={{
                      ...tdStyle,
                      color: pt > 0 ? '#4ade80' : pt < 0 ? '#f87171' : '#e2e8f0',
                      fontWeight: 600,
                    }}
                  >
                    {pt >= 0 ? '+' : ''}
                    {pt}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ))}
      <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>
        Итого очков: Аня 80, Боря 34, Вера −2, Гена 40.
      </p>
    </div>
  );
}
