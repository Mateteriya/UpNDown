import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // слушать на всех интерфейсах — доступ с других устройств по IP ноутбука
  },
})
