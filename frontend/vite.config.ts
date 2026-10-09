import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// The Django API during development; same-origin in production (Caddy).
// Port 8800: another local project already owns the classic 8000.
const API_PROXY = { '/api': 'http://127.0.0.1:8800' }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    include: ['src/**/*.test.ts'],
    // Same zone as the business (doc 03): dates must not depend on the machine.
    env: { TZ: 'America/Santo_Domingo' },
  },
  // PORT lets a launcher move Vite off 5173 when another project holds it.
  server: { proxy: API_PROXY, port: Number(process.env.PORT) || 5173 },
  // `vite preview` serves the production build for the end-to-end tests in CI.
  preview: { proxy: API_PROXY },
})
