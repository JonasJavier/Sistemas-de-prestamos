// @ts-check
import { defineConfig } from 'astro/config'

/** cobradia.com: the promotion site, static and apart from the app (doc 01). */
export default defineConfig({
  site: 'https://cobradia.com',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
})
