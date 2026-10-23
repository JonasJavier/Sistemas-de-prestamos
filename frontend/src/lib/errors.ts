import * as Sentry from '@sentry/react'

import { ApiError } from '../api/client'

/**
 * Error reporting (decision 123): with VITE_SENTRY_DSN set at build time the
 * browser sends unhandled errors to Sentry, without personal data (no IP,
 * no e-mail, no request bodies: doc 06 §7). Without it, nothing leaves.
 */
export function startErrorReporting() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return
  Sentry.init({
    dsn,
    release: import.meta.env.VITE_APP_VERSION || undefined,
    environment: 'production',
    tracesSampleRate: 0,
  })
}

/** A screen that could not render: the server never sees it otherwise. */
export function reportError(error: unknown) {
  if (error instanceof ApiError) return
  Sentry.captureException(error)
}
