/**
 * Up&Down — Главный экран (MVP)
 * @see TZ.md раздел 7.2
 */

import { useState, useCallback } from 'react'
import { hasSavedGame, clearGameStateFromStorage } from './game/persistence'
import GameTable from './ui/GameTable'
import MobileOverlapHint from './ui/MobileOverlapHint'

const DEV_MODE_KEY = 'updown-devMode'

function App() {
  const [screen, setScreen] = useState<'menu' | 'game'>(() => (hasSavedGame() ? 'game' : 'menu'))
  const [gameId, setGameId] = useState(1)
  const [devMode, setDevMode] = useState(() => typeof sessionStorage !== 'undefined' && sessionStorage.getItem(DEV_MODE_KEY) === '1')

  const enableDevMode = useCallback(() => {
    sessionStorage.setItem(DEV_MODE_KEY, '1')
    setDevMode(true)
  }, [])

  const startGame = () => {
    setGameId(id => id + 1)
    setScreen('game')
  }

  const handleExit = () => {
    clearGameStateFromStorage()
    setScreen('menu')
  }

  const handleNewGame = () => {
    clearGameStateFromStorage()
    setGameId(id => id + 1)
  }

  return (
    <>
      {screen === 'menu' && (
        <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
          <h1
            style={{ fontSize: '2rem', marginBottom: '0.5rem', userSelect: 'none' }}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => {
              if (e.button !== 0) return
              const target = e.currentTarget
              const t = window.setTimeout?.(() => { enableDevMode() }, 1200)
              const clear = () => { window.clearTimeout?.(t) }
              target.addEventListener('pointerup', clear, { once: true })
              target.addEventListener('pointerleave', clear, { once: true })
            }}
          >
            Up&Down
          </h1>
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
            {devMode && (
              <a href="/demo" style={{ ...buttonStyle, textDecoration: 'none', textAlign: 'center' }}>
                Демо карт (для разработчика)
              </a>
            )}
            <button disabled style={buttonStyle}>
              Турниры (скоро)
            </button>
            <button disabled style={buttonStyle}>
              Обучение (скоро)
            </button>
          </nav>
        </main>
      )}
      {/* key={gameId} — полное пересоздание при новой партии */}
      <div style={{ display: screen === 'game' ? 'block' : 'none', position: 'fixed', inset: 0, overflow: 'hidden' }}>
        {gameId >= 1 && (
          <GameTable
            key={gameId}
            gameId={gameId}
            onExit={handleExit}
            onNewGame={handleNewGame}
          />
        )}
        <MobileOverlapHint />
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
