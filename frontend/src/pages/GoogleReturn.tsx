import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouter, useSearch } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'

import { getAuthStatus, readGoogleIntent } from '../api/auth'
import { PublicPage, Spinner } from '../components/ui'
import { safeReturn } from '../lib/navigation'
import { notify } from '../lib/toast'

export interface GoogleReturnSearch {
  /** allauth's error code when Google did not let the person in. */
  error?: string
}

/** Decision 118: Google sends the person back here; this page takes them on
 * to wherever the sign-in now stands (the app, the 2FA code, or joining). */
export function GoogleReturnPage() {
  const { error } = useSearch({ from: '/entrar/google' })
  const navigate = useNavigate()
  const router = useRouter()
  const queryClient = useQueryClient()
  const done = useRef(false)

  useEffect(() => {
    if (done.current) return
    done.current = true
    const intent = readGoogleIntent() ?? { kind: 'login' as const }
    const desde = intent.kind === 'login' ? safeReturn(intent.desde) : null

    const go = async () => {
      if (error) {
        if (intent.kind === 'connect') {
          notify('No se pudo conectar tu cuenta de Google. Intenta de nuevo.')
          return navigate({ to: '/cuenta' })
        }
        if (intent.kind === 'invitation') {
          return navigate({
            to: '/invitacion/$token',
            params: { token: intent.token },
            search: { google: error },
          })
        }
        return navigate({ to: '/entrar', search: { google: error } })
      }
      const status = await getAuthStatus()
      // The cached «no session» of the public pages must not bounce the app.
      queryClient.clear()
      if (status.user) {
        if (intent.kind === 'connect') {
          notify('Tu cuenta de Google quedó conectada.', 'success')
          return navigate({ to: '/cuenta' })
        }
        if (desde) return router.history.push(desde)
        return navigate({ to: '/' })
      }
      if (status.pendingFlow === 'mfa_authenticate') {
        return navigate({ to: '/entrar', search: { paso: 'codigo', desde: desde ?? undefined } })
      }
      if (status.pendingFlow === 'provider_signup') {
        if (intent.kind === 'invitation') {
          return navigate({
            to: '/invitacion/$token',
            params: { token: intent.token },
            search: { google: 'ok' },
          })
        }
        return navigate({
          to: '/registro/google',
          search: intent.kind === 'login' ? { sin_cuenta: true } : {},
        })
      }
      return navigate({ to: '/entrar', search: { google: 'unknown' } })
    }
    go().catch(() => navigate({ to: '/entrar', search: { google: 'unknown' } }))
  }, [error, navigate, queryClient, router])

  return (
    <PublicPage subtitle="Entrando con Google">
      <Spinner label="Un momento…" />
    </PublicPage>
  )
}
