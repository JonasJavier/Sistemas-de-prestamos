import { z } from 'zod'

// Production forbids eval (CSP, decision 101): Zod validates without
// compiling. Imported first by main.tsx, before any schema is built.
z.config({ jitless: true })
