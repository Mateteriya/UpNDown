import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// StrictMode отключён — двойной вызов эффектов ломал таймеры AI (зависания на 4й, 6й раздаче)
ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
