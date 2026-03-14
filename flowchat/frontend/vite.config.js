import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/flows': 'http://localhost:8000',
      '/chat': 'http://localhost:8000',
      '/generate': 'http://localhost:8000',
      '/rag': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
      '/rasa': 'http://localhost:8000',
    },
  },
})
