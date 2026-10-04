import { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router'

import { getMe, type Me } from './api/accounts'
import { getSession, type SessionUser } from './api/auth'
import { AppShell } from './components/AppShell'
import { BranchesPage } from './pages/Branches'
import { DashboardPage } from './pages/Dashboard'
import { InvitationAcceptPage } from './pages/InvitationAccept'
import { LoginPage } from './pages/Login'
import { PlatformPage } from './pages/Platform'
import { RegisterPage } from './pages/Register'
import { SubscriptionPage } from './pages/Subscription'
import { UsersPage } from './pages/Users'
import { VerifyEmailPage } from './pages/VerifyEmail'

export interface RouterContext {
  queryClient: QueryClient
}

const sessionQuery = {
  queryKey: ['session'] as const,
  queryFn: getSession,
  staleTime: 60_000,
}

const meQuery = {
  queryKey: ['me'] as const,
  queryFn: getMe,
  staleTime: 60_000,
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
})

/** Authenticated area: everything inside renders within the AppShell. */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(sessionQuery)
    if (!user) throw redirect({ to: '/entrar' })
    const me = await context.queryClient.ensureQueryData(meQuery)
    return { user, me }
  },
  component: function App() {
    const { user, me } = appRoute.useRouteContext() as { user: SessionUser; me: Me }
    return (
      <AppShell user={user} me={me}>
        <Outlet />
      </AppShell>
    )
  },
})

const indexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  beforeLoad: ({ context }) => {
    const me = context.queryClient.getQueryData<Me>(['me'])
    if (me?.is_platform_admin) throw redirect({ to: '/plataforma' })
  },
  component: DashboardPage,
})

function managerOnly(context: RouterContext) {
  const me = context.queryClient.getQueryData<Me>(['me'])
  if (!me?.is_manager) throw redirect({ to: '/' })
}

const branchesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/ajustes/sucursales',
  beforeLoad: ({ context }) => managerOnly(context),
  component: BranchesPage,
})

const usersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/ajustes/usuarios',
  beforeLoad: ({ context }) => managerOnly(context),
  component: UsersPage,
})

const subscriptionRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/ajustes/suscripcion',
  beforeLoad: ({ context }) => managerOnly(context),
  component: SubscriptionPage,
})

const platformRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/plataforma',
  beforeLoad: ({ context }) => {
    const me = context.queryClient.getQueryData<Me>(['me'])
    if (!me?.is_platform_admin) throw redirect({ to: '/' })
  },
  component: PlatformPage,
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

const invitationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/invitacion/$token',
  component: InvitationAcceptPage,
})

const routeTree = rootRoute.addChildren([
  appRoute.addChildren([
    indexRoute,
    branchesRoute,
    usersRoute,
    subscriptionRoute,
    platformRoute,
  ]),
  loginRoute,
  registerRoute,
  verifyEmailRoute,
  invitationRoute,
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
