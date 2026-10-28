// @ts-check
import { defineConfig } from 'astro/config'

/** cobradia.com: the promotion site, static and apart from the app (doc 01). */
export default defineConfig({
  site: 'https://cobradia.com',
  trailingSlash: 'ignore',
  // Stylesheets as files: the CSP allows no inline styles (decision 102).
  build: { format: 'directory', inlineStylesheets: 'never' },
  vite: { build: { assetsInlineLimit: 0 } },
})
