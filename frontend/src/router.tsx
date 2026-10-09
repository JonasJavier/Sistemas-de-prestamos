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
import { PublicPage } from './components/ui'
import { buttonClass } from './components/classes'
import { APPLICATION_TABS, type ApplicationsSearch, type ApplicationTab } from './lib/applications'
import { ACCESS, hasRole } from './lib/roles'
import type { NewApplicationSearch } from './pages/ApplicationNew'
import { DashboardPage } from './pages/Dashboard'
import type { LoansSearch } from './pages/Loans'
import { LoginPage, type LoginSearch } from './pages/Login'

// Every other screen is its own chunk, fetched on first visit and preloaded
// when the pointer rests on a link to it (defaultPreload: 'intent').
const AccountPage = lazyRouteComponent(() => import('./pages/Account'), 'AccountPage')
const AccountsPage = lazyRouteComponent(() => import('./pages/Accounts'), 'AccountsPage')
const AccountingPage = lazyRouteComponent(() => import('./pages/Accounting'), 'AccountingPage')
const ExpensesPage = lazyRouteComponent(() => import('./pages/Expenses'), 'ExpensesPage')
const PayablesPage = lazyRouteComponent(() => import('./pages/Payables'), 'PayablesPage')
const ResultsPage = lazyRouteComponent(() => import('./pages/Results'), 'ResultsPage')
const ReportsPage = lazyRouteComponent(() => import('./pages/Reports'), 'ReportsPage')
const ScoresPage = lazyRouteComponent(() => import('./pages/Scores'), 'ScoresPage')
const PortfolioReportPage = lazyRouteComponent(
  () => import('./pages/PortfolioReport'),
  'PortfolioReportPage',
)
const FiscalDocumentsPage = lazyRouteComponent(
  () => import('./pages/FiscalDocuments'),
  'FiscalDocumentsPage',
)
const ApplicationDetailPage = lazyRouteComponent(
  () => import('./pages/ApplicationDetail'),
  'ApplicationDetailPage',
)
const ApplicationNewPage = lazyRouteComponent(
  () => import('./pages/ApplicationNew'),
  'ApplicationNewPage',
)
const ApplicationsPage = lazyRouteComponent(
  () => import('./pages/Applications'),
  'ApplicationsPage',
)
const BranchesPage = lazyRouteComponent(() => import('./pages/Branches'), 'BranchesPage')
const CashSessionDetailPage = lazyRouteComponent(
  () => import('./pages/CashSessions'),
  'CashSessionDetailPage',
)
const CashSessionsPage = lazyRouteComponent(
  () => import('./pages/CashSessions'),
  'CashSessionsPage',
)
const CollectPage = lazyRouteComponent(() => import('./pages/Collect'), 'CollectPage')
const DelinquencyPage = lazyRouteComponent(() => import('./pages/Delinquency'), 'DelinquencyPage')
const AgendaPage = lazyRouteComponent(() => import('./pages/Agenda'), 'AgendaPage')
const MyCashPage = lazyRouteComponent(() => import('./pages/MyCash'), 'MyCashPage')
const MyRoutePage = lazyRouteComponent(() => import('./pages/MyRoute'), 'MyRoutePage')
const NoticesPage = lazyRouteComponent(() => import('./pages/Notices'), 'NoticesPage')
const PublicReceiptPage = lazyRouteComponent(
  () => import('./pages/PublicReceipt'),
  'PublicReceiptPage',
)
const ReceiptPage = lazyRouteComponent(() => import('./pages/Receipt'), 'ReceiptPage')
const RoutesPage = lazyRouteComponent(() => import('./pages/Routes'), 'RoutesPage')
const CustomerDetailPage = lazyRouteComponent(
  () => import('./pages/CustomerDetail'),
  'CustomerDetailPage',
)
const CustomerNewPage = lazyRouteComponent(() => import('./pages/CustomerNew'), 'CustomerNewPage')
const CustomersPage = lazyRouteComponent(() => import('./pages/Customers'), 'CustomersPage')
const DisbursementDetailPage = lazyRouteComponent(
  () => import('./pages/DisbursementDetail'),
  'DisbursementDetailPage',
)
const DisbursementsPage = lazyRouteComponent(
  () => import('./pages/Disbursements'),
  'DisbursementsPage',
)
const CompanySettingsPage = lazyRouteComponent(
  () => import('./pages/CompanySettings'),
  'CompanySettingsPage',
)
const HolidaysPage = lazyRouteComponent(() => import('./pages/Holidays'), 'HolidaysPage')
const InvitationAcceptPage = lazyRouteComponent(
  () => import('./pages/InvitationAccept'),
  'InvitationAcceptPage',
)
const LoanDetailPage = lazyRouteComponent(() => import('./pages/LoanDetail'), 'LoanDetailPage')
const LoansPage = lazyRouteComponent(() => import('./pages/Loans'), 'LoansPage')
const PasswordForgotPage = lazyRouteComponent(
  () => import('./pages/PasswordForgot'),
  'PasswordForgotPage',
)
const PasswordResetPage = lazyRouteComponent(
  () => import('./pages/PasswordReset'),
  'PasswordResetPage',
)
const PlatformPage = lazyRouteComponent(() => import('./pages/Platform'), 'PlatformPage')
const ProductsPage = lazyRouteComponent(() => import('./pages/Products'), 'ProductsPage')
const RegisterPage = lazyRouteComponent(() => import('./pages/Register'), 'RegisterPage')
const SequencesPage = lazyRouteComponent(() => import('./pages/Sequences'), 'SequencesPage')
const SimulatorPage = lazyRouteComponent(() => import('./pages/Simulator'), 'SimulatorPage')
const SubscriptionPage = lazyRouteComponent(
  () => import('./pages/Subscription'),
  'SubscriptionPage',
)
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
    // Doc 07 - P10: the collector goes straight to «Mi ruta».
    if (me?.roles.length && me.roles.every((role) => role === 'Cobrador')) {
      throw redirect({ to: '/ruta' })
    }
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
    const text = (key: string) =>
      typeof search[key] === 'string' ? (search[key] as string) : undefined
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
  validateSearch: (search: Record<string, unknown>): LoansSearch =>
    typeof search.cobrador === 'string' ? { cobrador: search.cobrador } : {},
  beforeLoad: ({ context }) => rolesOnly(context, ACCESS.loans),
  component: withMe(LoansPage),
})

const collectRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/cobrar/$numero',
  beforeLoad: ({ context }) => rolesOnly(context, ACCESS.collect),
  component: withMe(CollectPage),
})

const receiptRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/recibos/$numero',
  beforeLoad: ({ context }) => rolesOnly(context, ACCESS.receipts),
  component: withMe(ReceiptPage),
})

const myCashRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/caja',
  beforeLoad: ({ context }) => rolesOnly(context, ACCESS.myCash),
  component: withMe(MyCashPage),
})

const cashSessionsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/cajas',
  beforeLoad: ({ context }) => rolesOnly(context, ACCESS.cashSessions),
  component: withMe(CashSessionsPage),
})

const cashSessionDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/cajas/$id',
  beforeLoad: ({ context }) => rolesOnly(context, ACCESS.cashSessions),
  component: CashSessionDetailPage,
})

const myRouteRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/ruta',
  beforeLoad: ({ context }) => rolesOnly(context, ACCESS.myRoute),
  component: MyRoutePage,
})

const routesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/rutas',
  beforeLoad: ({ context }) => rolesOnly(context, ACCESS.routes),
  component: RoutesPage,
})

const agendaRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/cobranza',
  beforeLoad: ({ context }) => rolesOnly(context, ACCESS.manageCollections),
  component: withMe(AgendaPage),
})

const delinquencyRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/atrasos',
  beforeLoad: ({ context }) => rolesOnly(context, ACCESS.delinquency),
  component: withMe(DelinquencyPage),
})

const noticesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/avisos',
  component: withMe(NoticesPage),
})

const loanDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/prestamos/$numero',
  beforeLoad: ({ context }) => rolesOnly(context, ACCESS.loans),
  component: withMe(LoanDetailPage),
})

const resultsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/reportes/resultados',
  beforeLoad: ({ context }) => rolesOnly(context, ACCESS.books),
  component: ResultsPage,
})

const reportsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/reportes',
  beforeLoad: ({ context }) => rolesOnly(context, ACCESS.reports),
  component: ReportsPage,
})

const scoresRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/reportes/clasificacion',
  beforeLoad: ({ context }) => rolesOnly(context, ACCESS.scores),
  component: withMe(ScoresPage),
})

const portfolioReportRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/reportes/cartera',
  beforeLoad: ({ context }) => rolesOnly(context, ACCESS.indicators),
  component: withMe(PortfolioReportPage),
})

const fiscalRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/comprobantes',
  beforeLoad: ({ context }) => rolesOnly(context, ACCESS.books),
  component: FiscalDocumentsPage,
})

const payablesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/cuentas-por-pagar',
  beforeLoad: ({ context }) => rolesOnly(context, ACCESS.payables),
  component: PayablesPage,
})

const expensesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/gastos',
  beforeLoad: ({ context }) => rolesOnly(context, ACCESS.expenses),
  component: withMe(ExpensesPage),
})

const accountingRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/contabilidad',
  beforeLoad: ({ context }) => rolesOnly(context, ACCESS.books),
  component: withMe(AccountingPage),
})

const accountsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/cuentas',
  beforeLoad: ({ context }) => rolesOnly(context, ACCESS.finance),
  component: withMe(AccountsPage),
})

const companySettingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/ajustes/empresa',
  beforeLoad: ({ context }) => managerOnly(context),
  component: CompanySettingsPage,
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
    search.motivo === 'sesion' || search.motivo === 'horario' ? { motivo: search.motivo } : {},
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

/** The receipt shared by WhatsApp: public, outside the app (decision 024). */
const publicReceiptRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/r/$token',
  component: PublicReceiptPage,
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
    collectRoute,
    receiptRoute,
    myCashRoute,
    cashSessionsRoute,
    cashSessionDetailRoute,
    myRouteRoute,
    routesRoute,
    agendaRoute,
    delinquencyRoute,
    noticesRoute,
    accountsRoute,
    accountingRoute,
    expensesRoute,
    payablesRoute,
    resultsRoute,
    portfolioReportRoute,
    reportsRoute,
    scoresRoute,
    fiscalRoute,
    productsRoute,
    companySettingsRoute,
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
  publicReceiptRoute,
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
