import { QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
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
import { AccountPage } from './pages/Account'
import { AccountsPage } from './pages/Accounts'
import { ApplicationDetailPage } from './pages/ApplicationDetail'
import { ApplicationNewPage, type NewApplicationSearch } from './pages/ApplicationNew'
import { ApplicationsPage } from './pages/Applications'
import { BranchesPage } from './pages/Branches'
import { CustomerDetailPage } from './pages/CustomerDetail'
import { CustomerNewPage } from './pages/CustomerNew'
import { CustomersPage } from './pages/Customers'
import { DashboardPage } from './pages/Dashboard'
import { DisbursementDetailPage } from './pages/DisbursementDetail'
import { DisbursementsPage } from './pages/Disbursements'
import { InvitationAcceptPage } from './pages/InvitationAccept'
import { LoanDetailPage } from './pages/LoanDetail'
import { LoansPage } from './pages/Loans'
import { LoginPage } from './pages/Login'
import { PlatformPage } from './pages/Platform'
import { ProductsPage } from './pages/Products'
import { RegisterPage } from './pages/Register'
import { SimulatorPage } from './pages/Simulator'
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
function rolesOnly(context: RouterContext, roles: string[]) {
  const me = context.queryClient.getQueryData<Me>(['me'])
  if (!me?.roles?.some((role) => roles.includes(role))) throw redirect({ to: '/' })
}

/** Renders a page that needs the session's Me. */
function withMe(Page: (props: { me: Me }) => ReactNode) {
  return function WithMe() {
    const { me } = appRoute.useRouteContext() as { me: Me }
    return <Page me={me} />
  }
}

const ORIGINATION = ['Gerente', 'Supervisor', 'Oficial de crédito', 'Cajero', 'Contabilidad', 'Auditoría']
const DISBURSERS = ['Gerente', 'Cajero', 'Contabilidad']
const LOAN_READERS = [
  'Gerente',
  'Supervisor',
  'Oficial de crédito',
  'Cajero',
  'Cobrador',
  'Contabilidad',
  'Auditoría',
]

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

const simulatorRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/simulador',
  component: withMe(SimulatorPage),
})

const applicationsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/solicitudes',
  beforeLoad: ({ context }) => rolesOnly(context, ORIGINATION),
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
  beforeLoad: ({ context }) => rolesOnly(context, ['Gerente', 'Supervisor', 'Oficial de crédito']),
  component: ApplicationNewPage,
})

const applicationDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/solicitudes/$id',
  beforeLoad: ({ context }) => rolesOnly(context, ORIGINATION),
  component: withMe(ApplicationDetailPage),
})

const disbursementsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/desembolsos',
  beforeLoad: ({ context }) => rolesOnly(context, DISBURSERS),
  component: DisbursementsPage,
})

const disbursementDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/desembolsos/$id',
  beforeLoad: ({ context }) => rolesOnly(context, DISBURSERS),
  component: DisbursementDetailPage,
})

const loansRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/prestamos',
  beforeLoad: ({ context }) => rolesOnly(context, LOAN_READERS),
  component: LoansPage,
})

const loanDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/prestamos/$numero',
  beforeLoad: ({ context }) => rolesOnly(context, LOAN_READERS),
  component: withMe(LoanDetailPage),
})

const accountsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/cuentas',
  beforeLoad: ({ context }) => rolesOnly(context, ['Gerente', 'Contabilidad', 'Auditoría']),
  component: withMe(AccountsPage),
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
  component: CustomersPage,
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
  component: function Account() {
    const { me } = appRoute.useRouteContext() as { me: Me }
    return <AccountPage me={me} />
  },
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
