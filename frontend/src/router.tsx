import { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router'

import { getSession, type SessionUser } from './api/auth'
import { DashboardPage } from './pages/Dashboard'
import { LoginPage } from './pages/Login'
import { RegisterPage } from './pages/Register'
import { VerifyEmailPage } from './pages/VerifyEmail'

export interface RouterContext {
  queryClient: QueryClient
}

const sessionQuery = {
  queryKey: ['session'] as const,
  queryFn: getSession,
  staleTime: 60_000,
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(sessionQuery)
    if (!user) throw redirect({ to: '/entrar' })
    return { user }
  },
  component: function Index() {
    const { user } = indexRoute.useRouteContext() as { user: SessionUser }
    return <DashboardPage user={user} />
  },
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/entrar',
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(sessionQuery)
    if (user) throw redirect({ to: '/' })
  },
  component: LoginPage,
})

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/registro',
  component: RegisterPage,
})

const verifyEmailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/verificar-correo/$key',
  component: VerifyEmailPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  registerRoute,
  verifyEmailRoute,
])

export function buildRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof buildRouter>
  }
}
