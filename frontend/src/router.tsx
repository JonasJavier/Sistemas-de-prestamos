import { QueryClient } from '@tanstack/react-query'
import type { ComponentType } from 'react'
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Link,
  Outlet,
  redirect,
} from '@tanstack/react-router'

import { getMe, type Me } from './api/accounts'
import { getSession, type SessionUser } from './api/auth'
import { AppShell } from './components/AppShell'
import { buttonClass, PublicPage } from './components/ui'
import { APPLICATION_TABS, type ApplicationsSearch, type ApplicationTab } from './lib/applications'
import { ACCESS, hasRole } from './lib/roles'
import type { NewApplicationSearch } from './pages/ApplicationNew'
import { DashboardPage } from './pages/Dashboard'
import { LoginPage, type LoginSearch } from './pages/Login'

// Every other screen is its own chunk, fetched on first visit and preloaded
// when the pointer rests on a link to it (defaultPreload: 'intent').
const AccountPage = lazyRouteComponent(() => import('./pages/Account'), 'AccountPage')
const AccountsPage = lazyRouteComponent(() => import('./pages/Accounts'), 'AccountsPage')
const ApplicationDetailPage = lazyRouteComponent(() => import('./pages/ApplicationDetail'), 'ApplicationDetailPage')
const ApplicationNewPage = lazyRouteComponent(() => import('./pages/ApplicationNew'), 'ApplicationNewPage')
const ApplicationsPage = lazyRouteComponent(() => import('./pages/Applications'), 'ApplicationsPage')
const BranchesPage = lazyRouteComponent(() => import('./pages/Branches'), 'BranchesPage')
const CustomerDetailPage = lazyRouteComponent(() => import('./pages/CustomerDetail'), 'CustomerDetailPage')
const CustomerNewPage = lazyRouteComponent(() => import('./pages/CustomerNew'), 'CustomerNewPage')
const CustomersPage = lazyRouteComponent(() => import('./pages/Customers'), 'CustomersPage')
const DisbursementDetailPage = lazyRouteComponent(() => import('./pages/DisbursementDetail'), 'DisbursementDetailPage')
const DisbursementsPage = lazyRouteComponent(() => import('./pages/Disbursements'), 'DisbursementsPage')
const HolidaysPage = lazyRouteComponent(() => import('./pages/Holidays'), 'HolidaysPage')
const InvitationAcceptPage = lazyRouteComponent(() => import('./pages/InvitationAccept'), 'InvitationAcceptPage')
const LoanDetailPage = lazyRouteComponent(() => import('./pages/LoanDetail'), 'LoanDetailPage')
const LoansPage = lazyRouteComponent(() => import('./pages/Loans'), 'LoansPage')
const PasswordForgotPage = lazyRouteComponent(() => import('./pages/PasswordForgot'), 'PasswordForgotPage')
const PasswordResetPage = lazyRouteComponent(() => import('./pages/PasswordReset'), 'PasswordResetPage')
const PlatformPage = lazyRouteComponent(() => import('./pages/Platform'), 'PlatformPage')
const ProductsPage = lazyRouteComponent(() => import('./pages/Products'), 'ProductsPage')
const RegisterPage = lazyRouteComponent(() => import('./pages/Register'), 'RegisterPage')
const SequencesPage = lazyRouteComponent(() => import('./pages/Sequences'), 'SequencesPage')
const SimulatorPage = lazyRouteComponent(() => import('./pages/Simulator'), 'SimulatorPage')
const SubscriptionPage = lazyRouteComponent(() => import('./pages/Subscription'), 'SubscriptionPage')
const UsersPage = lazyRouteComponent(() => import('./pages/Users'), 'UsersPage')
const VerifyEmailPage = lazyRouteComponent(() => import('./pages/VerifyEmail'), 'VerifyEmailPage')

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
  notFoundComponent: NotFound,
})

function NotFound() {
  return (
    <PublicPage subtitle="Esta página no existe">
      <p className="text-center text-sm text-muted">
        Puede que el enlace esté incompleto o que la página se haya movido.
      </p>
      <Link to="/" className={buttonClass('primary', 'w-full')}>
        Ir al inicio
      </Link>
    </PublicPage>
  )
}

/** Works inside the shell and outside it: a compact card, no second logo. */
function RouteError({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto my-16 max-w-md space-y-4 rounded-xl border border-edge bg-surface p-6 text-center shadow-sm">
      <h1 className="text-lg font-semibold">Algo salió mal</h1>
      <p className="text-sm text-muted">
        No se pudo mostrar esta pantalla. Vuelve a intentarlo; si sigue pasando, avísanos.
      </p>
      <div className="flex justify-center gap-2">
        <Link to="/" className={buttonClass('secondary')}>
          Ir al inicio
        </Link>
        <button type="button" onClick={reset} className={buttonClass()}>
          Reintentar
        </button>
      </div>
    </div>
  )
}

/** Authenticated area: everything inside renders within the AppShell. */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: async ({ context, location }) => {
    const user = await context.queryClient.ensureQueryData(sessionQuery)
    if (!user) throw redirect({ to: '/entrar' })
    const me = await context.queryClient.ensureQueryData(meQuery)
    // Decision 034: with mandatory 2FA pending, the only destination is Mi cuenta.
    if (me.mfa_required && !me.mfa_enabled && location.pathname !== '/cuenta') {
      throw redirect({ to: '/cuenta' })
    }
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
  component: withMe(DashboardPage),
})

function managerOnly(context: RouterContext) {
  const me = context.queryClient.getQueryData<Me>(['me'])
  if (!me?.is_manager) throw redirect({ to: '/' })
}

/** The screen hides what the role cannot use; the API still decides (doc 06 - 2). */
function rolesOnly(context: RouterContext, roles: readonly string[]) {
  if (!hasRole(context.queryClient.getQueryData<Me>(['me']), roles)) throw redirect({ to: '/' })
}

/** Renders a page that needs the session's Me; keeps a lazy page preloadable. */
function withMe(Page: ComponentType<{ me: Me }> & { preload?: () => Promise<void> | undefined }) {
  function WithMe() {
    const { me } = appRoute.useRouteContext() as { me: Me }
    return <Page me={me} />
  }
  return Object.assign(WithMe, { preload: Page.preload })
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
  component: withMe(UsersPage),
})

const subscriptionRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/ajustes/suscripcion',
  beforeLoad: ({ context }) => managerOnly(context),
  component: SubscriptionPage,
})

const simulatorRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/simulador',
  beforeLoad: ({ context }) => rolesOnly(context, ACCESS.simulate),
  component: withMe(SimulatorPage),
})

const applicationsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/solicitudes',
  validateSearch: (search: Record<string, unknown>): ApplicationsSearch =>
    APPLICATION_TABS.includes(search.bandeja as ApplicationTab)
      ? { bandeja: search.bandeja as ApplicationTab }
      : {},
  beforeLoad: ({ context }) => rolesOnly(context, ACCESS.applications),
  component: withMe(ApplicationsPage),
})

const applicationNewRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/solicitudes/nueva',
  validateSearch: (search: Record<string, unknown>): NewApplicationSearch => {
    const text = (key: string) => (typeof search[key] === 'string' ? (search[key] as string) : undefined)
    return {
      cliente: text('cliente'),
      producto: text('producto'),
      monto: text('monto'),
      cuotas: search.cuotas !== undefined ? String(search.cuotas) : undefined,
      frecuencia: text('frecuencia'),
      tasa: search.tasa !== undefined ? String(search.tasa) : undefined,
    }
  },
  beforeLoad: ({ context }) => rolesOnly(context, ACCESS.originate),
  component: ApplicationNewPage,
})

const applicationDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/solicitudes/$id',
  beforeLoad: ({ context }) => rolesOnly(context, ACCESS.applications),
  component: withMe(ApplicationDetailPage),
})

const disbursementsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/desembolsos',
  beforeLoad: ({ context }) => rolesOnly(context, ACCESS.disburse),
  component: DisbursementsPage,
})

const disbursementDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/desembolsos/$id',
  beforeLoad: ({ context }) => rolesOnly(context, ACCESS.disburse),
  component: DisbursementDetailPage,
})

const loansRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/prestamos',
  beforeLoad: ({ context }) => rolesOnly(context, ACCESS.loans),
  component: LoansPage,
})

const loanDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/prestamos/$numero',
  beforeLoad: ({ context }) => rolesOnly(context, ACCESS.loans),
  component: withMe(LoanDetailPage),
})

const accountsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/cuentas',
  beforeLoad: ({ context }) => rolesOnly(context, ACCESS.finance),
  component: withMe(AccountsPage),
})

const holidaysRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/ajustes/feriados',
  beforeLoad: ({ context }) => managerOnly(context),
  component: HolidaysPage,
})

const sequencesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/ajustes/numeraciones',
  beforeLoad: ({ context }) => managerOnly(context),
  component: SequencesPage,
})

const productsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/ajustes/productos',
  beforeLoad: ({ context }) => managerOnly(context),
  component: ProductsPage,
})

const customersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/clientes',
  component: withMe(CustomersPage),
})

const customerNewRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/clientes/nuevo',
  component: CustomerNewPage,
})

const customerDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/clientes/$id',
  component: withMe(CustomerDetailPage),
})

const accountRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/cuenta',
  component: withMe(AccountPage),
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
  validateSearch: (search: Record<string, unknown>): LoginSearch =>
    search.motivo === 'sesion' ? { motivo: 'sesion' } : {},
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(sessionQuery)
    if (user) throw redirect({ to: '/' })
  },
  component: LoginPage,
})

const passwordForgotRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recuperar',
  component: PasswordForgotPage,
})

const passwordResetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recuperar/$key',
  component: PasswordResetPage,
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
    simulatorRoute,
    applicationsRoute,
    applicationNewRoute,
    applicationDetailRoute,
    disbursementsRoute,
    disbursementDetailRoute,
    loansRoute,
    loanDetailRoute,
    accountsRoute,
    productsRoute,
    holidaysRoute,
    sequencesRoute,
    customersRoute,
    customerNewRoute,
    customerDetailRoute,
    branchesRoute,
    usersRoute,
    subscriptionRoute,
    accountRoute,
    platformRoute,
  ]),
  loginRoute,
  passwordForgotRoute,
  passwordResetRoute,
  registerRoute,
  verifyEmailRoute,
  invitationRoute,
])

export function buildRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    defaultErrorComponent: RouteError,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof buildRouter>
  }
}
