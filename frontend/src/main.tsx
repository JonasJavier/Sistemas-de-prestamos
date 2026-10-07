import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { ApiError } from './api/client'
import './index.css'
import { buildRouter } from './router'

// Light by default; dark only if the user chose it (owner feedback 05/10/2026).
try {
  if (localStorage.getItem('theme') === 'dark') {
    document.documentElement.classList.add('dark')
  }
} catch {
  // storage unavailable (private mode): stay light
}

/** Screens reachable without a session: a 401 there is part of their flow. */
const PUBLIC_PATHS = ['/entrar', '/registro', '/recuperar', '/verificar-correo', '/invitacion']

/** 401 inside the app = the session closed (30 min idle or 12 h, doc 06 - 6). */
function onApiError(error: unknown) {
  if (!(error instanceof ApiError) || error.status !== 401) return
  const path = window.location.pathname
  if (PUBLIC_PATHS.some((prefix) => path.startsWith(prefix))) return
  queryClient.clear()
  void router.navigate({ to: '/entrar', search: { motivo: 'sesion' } })
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onApiError }),
  mutationCache: new MutationCache({ onError: onApiError }),
  defaultOptions: {
    queries: {
      // A 4xx will not fix itself on retry; only network/server hiccups do.
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 1,
      refetchOnWindowFocus: false,
    },
  },
})

const router = buildRouter(queryClient)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
