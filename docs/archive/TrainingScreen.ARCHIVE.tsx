import { useEffect, useMemo, useRef, useState } from 'react';
import GameTable from './GameTable';
import type { PlayerProfile } from '../game/persistence';
import { loadGameStateFromStorage, saveGameStateToStorage } from '../game/persistence';

export function TrainingScreen({ onBack, profile }: { onBack: () => void; profile: PlayerProfile }) {
  const [gameId, setGameId] = useState(1000);
  const [view, setView] = useState<'hub' | 'lesson'>('hub');
  const [lesson, setLesson] = useState<'lesson1' | 'lesson2' | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [step, setStep] = useState(0);
  const progressKey = 'updown_training_progress';
  const [progress, setProgress] = useState<{ [k: string]: boolean }>(() => {
    try {
      const raw = localStorage.getItem(progressKey);
      return raw ? (JSON.parse(raw) as any) : {};
    } catch {
      return {};
    }
  });
  const backupRef = useRef<any | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [targetBid, setTargetBid] = useState<number | null>(null);
  const steps = useMemo(() => {
    if (lesson === 'lesson2') {
      return [
        { title: 'Урок 2: заказы и очки', text: 'Когда появится панель заказов — выберите число взяток.' },
        { title: 'Выбор заказа', text: 'Для примера выберите 2 взятки. Это не влияет на рейтинг.' },
        { title: 'Розыгрыш', text: 'После выбора заказа посмотрите, как начисляются очки.' },
      ];
    }
    // lesson1 или дефолт
    return [
      { title: 'Урок 1: основы интерфейса', text: 'Познакомимся с элементами стола и панелью хода.' },
      { title: 'Заказы', text: 'Когда откроется панель заказов — выберите число взяток.' },
      { title: 'Розыгрыш', text: 'Играйте масть с руки. Следуйте правилам по масти и козырю.' },
    ];
  }, [lesson]);

  // Бэкап офлайн-партии и восстановление после обучения
  useEffect(() => {
    backupRef.current = loadGameStateFromStorage();
    return () => {
      if (backupRef.current) {
        try { saveGameStateToStorage(backupRef.current); } catch { /* ignore */ }
      }
    };
  }, []);

  // Мягкая проверка для урока 2: следим за выбранным заказом
  useEffect(() => {
    if (lesson !== 'lesson2') return;
    setTargetBid(2);
    const timer = setInterval(() => {
      try {
        const s = loadGameStateFromStorage();
        if (!s) return;
        const phase = (s as any).phase;
        const myTurn = (s as any).currentPlayerIndex === 0;
        const myBid = Array.isArray((s as any).bids) ? (s as any).bids[0] : null;
        if ((phase === 'bidding' || phase === 'dark-bidding') && myTurn) {
          if (myBid == null) {
            setHint('Сейчас ваш заказ. Для примера выберите число 2.');
          } else if (myBid !== 2) {
            setHint('Для примера выберите 2 — попробуйте ещё раз. Это обучение.');
          } else {
            setHint('Отлично! Заказ выбран. Продолжаем.');
            setStep(2);
          }
        } else {
          // Не этап заказа — уберём подсказку
          setHint(null);
        }
      } catch {
        /* ignore */
      }
    }, 500);
    return () => clearInterval(timer);
  }, [lesson]);

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

  const startLesson = (id: 'lesson1' | 'lesson2') => {
    setLesson(id);
    setView('lesson');
    setShowOverlay(true);
    setStep(0);
    setGameId(id2 => id2 + 1);
  };

  const completeLesson = (id: 'lesson1' | 'lesson2') => {
    const next = { ...progress, [id]: true };
    setProgress(next);
    try { localStorage.setItem(progressKey, JSON.stringify(next)); } catch { /* ignore */ }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0f172a' }}>
      {view === 'hub' ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
          <h1 style={{ margin: 0, fontSize: 22, color: '#f1f5f9' }}>Обучение</h1>
          <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button type="button" onClick={() => startLesson('lesson1')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderRadius: 10, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', cursor: 'pointer' }}>
              <span>Урок 1: основы интерфейса</span>
              <span style={{ fontSize: 12, color: progress.lesson1 ? '#22d3ee' : '#94a3b8' }}>{progress.lesson1 ? '✓ пройден' : 'не пройден'}</span>
            </button>
            <button type="button" onClick={() => startLesson('lesson2')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderRadius: 10, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', cursor: 'pointer' }}>
              <span>Урок 2: заказы и очки</span>
              <span style={{ fontSize: 12, color: progress.lesson2 ? '#22d3ee' : '#94a3b8' }}>{progress.lesson2 ? '✓ пройден' : 'не пройден'}</span>
            </button>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button type="button" onClick={onBack} style={{ padding: '10px 16px', fontSize: 14, borderRadius: 8, border: '1px solid #475569', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>
              В меню
            </button>
          </div>
        </div>
      ) : (
        <>
          <GameTable
            gameId={gameId}
            playerDisplayName={profile.displayName}
            playerAvatarDataUrl={profile.avatarDataUrl ?? null}
            onExit={onBack}
            onNewGame={() => setGameId(id => id + 1)}
          />
          {hint && (
            <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', padding: '10px 14px', borderRadius: 10, background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(148,163,184,0.35)', color: '#e2e8f0', fontSize: 13, zIndex: 9999 }}>
              {hint}
              {targetBid != null && <span style={{ marginLeft: 6, color: '#94a3b8' }}>(рекомендуем: {targetBid})</span>}
            </div>
          )}
        </>
      )}
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
                  if (step >= steps.length - 1) {
                    setShowOverlay(false);
                    if (lesson) completeLesson(lesson);
                  } else {
                    setStep(s => s + 1);
                  }
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
                {step >= steps.length - 1 ? (view === 'hub' ? 'Ок' : 'Начать') : 'Далее'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (view === 'lesson') {
                    setView('hub');
                    setShowOverlay(true);
                    setStep(0);
                    setHint(null);
                  } else {
                    onBack();
                  }
                }}
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
                {view === 'lesson' ? 'К урокам' : 'В меню'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TrainingScreen;
