import { useEffect, useMemo, useState } from 'react';
import GameTable from './GameTable';
import type { PlayerProfile } from '../game/persistence';

export function TrainingScreen({ onBack, profile }: { onBack: () => void; profile: PlayerProfile }) {
  const [gameId, setGameId] = useState(1000);
  const [showOverlay, setShowOverlay] = useState(true);
  const [step, setStep] = useState(0);
  const steps = useMemo(
    () => [
      { title: 'Урок 1: основы интерфейса', text: 'Познакомимся с элементами стола и панелью хода.' },
      { title: 'Заказы', text: 'Когда откроется панель заказов — выберите число взяток.' },
      { title: 'Розыгрыш', text: 'Играйте масть с руки. Следуйте правилам по масти и козырю.' },
    ],
    []
  );

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!showOverlay) return;
      if (e.key === 'Escape') setShowOverlay(false);
      if (e.key === 'Enter') {
        setStep(s => {
          if (s >= steps.length - 1) {
            setShowOverlay(false);
            return s;
          }
          return s + 1;
        });
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [showOverlay, steps.length]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0f172a' }}>
      <GameTable
        gameId={gameId}
        playerDisplayName={profile.displayName}
        playerAvatarDataUrl={profile.avatarDataUrl ?? null}
        onExit={onBack}
        onNewGame={() => setGameId(id => id + 1)}
      />
      {showOverlay && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: 20,
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="training-title"
        >
          <div
            style={{
              background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
              borderRadius: 16,
              border: '1px solid rgba(148, 163, 184, 0.35)',
              width: '100%',
              maxWidth: 420,
              padding: 24,
              boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
              textAlign: 'center',
            }}
          >
            <h2 id="training-title" style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>
              {steps[step].title}
            </h2>
            <p style={{ margin: '0 8px 16px', fontSize: 14, color: '#94a3b8' }}>{steps[step].text}</p>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: '#64748b' }}>
              Enter — далее • Esc — скрыть подсказки
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
              <button
                type="button"
                onClick={() => setShowOverlay(false)}
                style={{
                  padding: '10px 16px',
                  fontSize: 14,
                  borderRadius: 8,
                  border: '1px solid rgba(34, 211, 238, 0.5)',
                  background: 'linear-gradient(180deg, #0e7490 0%, #155e75 100%)',
                  color: '#f8fafc',
                  cursor: 'pointer',
                }}
              >
                Скрыть подсказки
              </button>
              <button
                type="button"
                onClick={() => {
                  if (step >= steps.length - 1) setShowOverlay(false);
                  else setStep(s => s + 1);
                }}
                style={{
                  padding: '10px 16px',
                  fontSize: 14,
                  borderRadius: 8,
                  border: '1px solid #334155',
                  background: '#334155',
                  color: '#f8fafc',
                  cursor: 'pointer',
                }}
              >
                {step >= steps.length - 1 ? 'Начать' : 'Далее'}
              </button>
              <button
                type="button"
                onClick={onBack}
                style={{
                  padding: '10px 16px',
                  fontSize: 14,
                  borderRadius: 8,
                  border: '1px solid #475569',
                  background: 'transparent',
                  color: '#94a3b8',
                  cursor: 'pointer',
                }}
              >
                В меню
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TrainingScreen;
