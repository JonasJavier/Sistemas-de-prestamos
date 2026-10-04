import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // The Django API during development; same-origin in production (Caddy).
      // Port 8800: another local project already owns the classic 8000.
      '/api': 'http://127.0.0.1:8800',
    },
  },
})
