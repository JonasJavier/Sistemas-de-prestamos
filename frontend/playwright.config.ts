import { defineConfig, devices } from '@playwright/test'

/** End-to-end tours of each phase demo (doc 10 - section 2). They expect the
 * stack running with the demo seed: see backend/DEV.md, «Pruebas de extremo
 * a extremo». */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1, // the tours share one database: keep them in order
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    locale: 'es-DO',
    timezoneId: 'America/Santo_Domingo',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'escritorio',
      testIgnore: /celular\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        // Locally, the Edge that ships with Windows: no browser download.
        channel: process.env.CI ? undefined : 'msedge',
      },
    },
    {
      name: 'celular',
      testMatch: /celular\.spec\.ts/,
      use: { ...devices['Pixel 7'], channel: process.env.CI ? undefined : 'msedge' },
    },
  ],
})
