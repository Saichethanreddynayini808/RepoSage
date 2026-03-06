import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/analyze': 'http://localhost:8000',
      '/chat': 'http://localhost:8000',
      '/ollama': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
    },
  },
})
