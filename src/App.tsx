/**
 * Up&Down — Главный экран (MVP)
 * @see TZ.md раздел 7.2
 */

import { useState } from 'react'
import GameTable from './ui/GameTable'

function App() {
  const [screen, setScreen] = useState<'menu' | 'game'>('menu')
  const [gameId, setGameId] = useState(0)

  const startGame = () => {
    setGameId(id => id + 1)
    setScreen('game')
  }

  return (
    <>
      {screen === 'menu' && (
        <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Up&Down</h1>
          <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>
            Карточная игра на взятки
          </p>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <button disabled style={buttonStyle}>
              Онлайн (скоро)
            </button>
            <button style={buttonStyle} onClick={startGame}>
              Офлайн против ИИ
            </button>
            <button disabled style={buttonStyle}>
              Турниры (скоро)
            </button>
            <button disabled style={buttonStyle}>
              Обучение (скоро)
            </button>
          </nav>
        </main>
      )}
      {/* key={gameId} — полное пересоздание при новой партии, чтобы сбросить все refs и эффекты */}
      <div style={{ display: screen === 'game' ? 'block' : 'none', position: 'fixed', inset: 0, overflow: 'hidden' }}>
        {gameId > 0 && <GameTable key={gameId} gameId={gameId} onExit={() => setScreen('menu')} />}
      </div>
    </>
  )
}

const buttonStyle: React.CSSProperties = {
  padding: '1rem 1.5rem',
  fontSize: '1rem',
  borderRadius: '8px',
  border: '1px solid #334155',
  background: '#1e293b',
  color: '#f8fafc',
  cursor: 'pointer',
  transition: 'background 0.2s',
}

export default App
