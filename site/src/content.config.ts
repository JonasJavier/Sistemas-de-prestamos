import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'

/** The help centre (C1, decision 133) reads the manuals straight from
 * docs/manual: one source, the same text the team trains with. */
const manual = defineCollection({
  loader: glob({ pattern: ['*.md', '!README.md'], base: '../docs/manual' }),
})

export const collections = { manual }
