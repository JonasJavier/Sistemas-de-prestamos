import {
  useIsFetching,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'

import { getMe, type Me } from '../api/accounts'
import { logout, type SessionUser } from '../api/auth'
import { initials } from '../lib/format'
import { ACCESS, hasRole, platformView } from '../lib/roles'
import { useDarkTheme } from '../lib/theme'
import { CommandPalette, type PaletteIntent } from './CommandPalette'
import { Modal } from './Modal'
import {
  AgendaIcon,
  ApplicationIcon,
  ArrowsIcon,
  AwardIcon,
  BankIcon,
  BellIcon,
  BookIcon,
  BriefcaseIcon,
  BuildingIcon,
  CalculatorIcon,
  CardIcon,
  CashIcon,
  ChartIcon,
  ChatIcon,
  ChevronDownIcon,
  ClockAlertIcon,
  CollectIcon,
  DisburseIcon,
  DrawerIcon,
  HashIcon,
  HomeIcon,
  InvoiceIcon,
  LoanIcon,
  LogoutIcon,
  MapIcon,
  MenuIcon,
  MoonIcon,
  PanelFoldIcon,
  PanelUnfoldIcon,
  PeopleIcon,
  PercentIcon,
  PieIcon,
  RouteIcon,
  ScaleIcon,
  SearchIcon,
  ShieldIcon,
  StampIcon,
  StarCalendarIcon,
  StoreIcon,
  SunIcon,
  TagIcon,
  TrendIcon,
  UserCogIcon,
  UserIcon,
  WalletIcon,
} from './icons'
import { Brand, BrandMark, Texture } from './ui'
import { SupportBanner } from './Support'

const iconButton =
  'press press-down relative grid size-10 place-items-center rounded-lg text-muted outline-none hover:bg-brand-50 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent-500 sm:size-9'

function ThemeToggle() {
  const [dark, toggle] = useDarkTheme()
  const label = dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'
  return (
    <button type="button" onClick={toggle} title={label} aria-label={label} className={iconButton}>
      {/* The icon pops in when the theme changes. */}
      <span key={String(dark)} className="grid animate-pop">
        {dark ? <SunIcon /> : <MoonIcon />}
      </span>
    </button>
  )
}

interface NavItem {
  to: string
  label: string
  icon: ReactNode
  badge?: number
}

interface NavGroup {
  title: string | null
  items: NavItem[]
}

const ic = 'size-[18px] shrink-0'

/** Grouped navigation (decision 038): only what the role can use. */
function navFor(me: Me): NavGroup[] {
  if (platformView(me)) {
    return [
      {
        title: null,
        items: [{ to: '/plataforma', label: 'Empresas', icon: <BuildingIcon className={ic} /> }],
      },
    ]
  }
  const item = (to: string, label: string, icon: ReactNode, badge?: number): NavItem => ({
    to,
    label,
    icon,
    badge,
  })
  const operation: NavItem[] = [item('/clientes', 'Clientes', <PeopleIcon className={ic} />)]
  if (hasRole(me, ACCESS.applications))
    operation.push(item('/solicitudes', 'Solicitudes', <ApplicationIcon className={ic} />))
  if (hasRole(me, ACCESS.disburse))
    operation.push(item('/desembolsos', 'Desembolsos', <DisburseIcon className={ic} />))
  if (hasRole(me, ACCESS.loans))
    operation.push(item('/prestamos', 'Préstamos', <LoanIcon className={ic} />))
  if (hasRole(me, ACCESS.simulate))
    operation.push(item('/simulador', 'Simulador', <CalculatorIcon className={ic} />))
  const onlyCollector = me.roles.length > 0 && me.roles.every((role) => role === 'Cobrador')
  const groups: NavGroup[] = [
    { title: null, items: onlyCollector ? [] : [item('/', 'Inicio', <HomeIcon className={ic} />)] },
    { title: 'Operación', items: operation },
  ]
  // Phase 4: collections and cash, by role (doc 06 matrix).
  const collections: NavItem[] = []
  if (hasRole(me, ACCESS.myRoute))
    collections.push(item('/ruta', 'Mi ruta', <RouteIcon className={ic} />))
  if (hasRole(me, ACCESS.myCash))
    collections.push(item('/caja', 'Mi caja', <WalletIcon className={ic} />))
  if (hasRole(me, ACCESS.manageCollections))
    collections.push(item('/cobranza', 'Agenda', <AgendaIcon className={ic} />, me.agenda_today))
  if (hasRole(me, ACCESS.delinquency))
    collections.push(item('/atrasos', 'Atrasos', <ClockAlertIcon className={ic} />))
  if (hasRole(me, ACCESS.routes))
    collections.push(item('/rutas', 'Rutas', <MapIcon className={ic} />))
  if (hasRole(me, ACCESS.cashSessions))
    collections.push(item('/cajas', 'Cajas', <DrawerIcon className={ic} />, me.closings_to_approve))
  if (hasRole(me, ACCESS.legal))
    collections.push(item('/legal', 'Casos legales', <ScaleIcon className={ic} />))
  if (collections.length) groups.push({ title: 'Cobros y caja', items: collections })
  const finance: NavItem[] = []
  if (hasRole(me, ACCESS.finance))
    finance.push(item('/cuentas', 'Cuentas y bancos', <BankIcon className={ic} />))
  if (hasRole(me, ACCESS.expenses))
    finance.push(item('/gastos', 'Gastos e ingresos', <ArrowsIcon className={ic} />))
  if (hasRole(me, ACCESS.payables))
    finance.push(item('/cuentas-por-pagar', 'Cuentas por pagar', <InvoiceIcon className={ic} />))
  if (hasRole(me, ACCESS.books)) {
    finance.push(item('/comprobantes', 'Comprobantes fiscales', <StampIcon className={ic} />))
    finance.push(item('/reportes/resultados', 'Resultados', <TrendIcon className={ic} />))
    finance.push(item('/contabilidad', 'Contabilidad', <BookIcon className={ic} />))
  }
  if (finance.length) groups.push({ title: 'Finanzas', items: finance })
  const reports: NavItem[] = []
  if (hasRole(me, ACCESS.reports))
    reports.push(item('/reportes', 'Centro de reportes', <ChartIcon className={ic} />))
  if (hasRole(me, ACCESS.indicators))
    reports.push(item('/reportes/cartera', 'Cartera', <PieIcon className={ic} />))
  if (hasRole(me, ACCESS.scores))
    reports.push(item('/reportes/clasificacion', 'Clasificación', <AwardIcon className={ic} />))
  if (hasRole(me, ACCESS.commissions))
    reports.push(item('/reportes/comisiones', 'Comisiones', <PercentIcon className={ic} />))
  // P79 lives in Ajustes for the manager; audit reaches it from Reportes.
  if (hasRole(me, ACCESS.fraud) && !me.is_manager)
    reports.push(item('/ajustes/alertas', 'Alertas antifraude', <ShieldIcon className={ic} />))
  if (reports.length) groups.push({ title: 'Reportes', items: reports })
  if (me.is_manager) {
    groups.push({
      title: 'Ajustes',
      items: [
        item('/ajustes/empresa', 'Empresa', <BuildingIcon className={ic} />),
        item('/ajustes/productos', 'Productos', <TagIcon className={ic} />),
        item('/ajustes/feriados', 'Feriados', <StarCalendarIcon className={ic} />),
        item('/ajustes/numeraciones', 'Numeraciones', <HashIcon className={ic} />),
        item('/ajustes/sucursales', 'Sucursales', <StoreIcon className={ic} />),
        item('/ajustes/usuarios', 'Usuarios', <UserCogIcon className={ic} />),
        item('/ajustes/legales', 'Profesionales legales', <BriefcaseIcon className={ic} />),
        item('/ajustes/mensajes', 'Mensajería', <ChatIcon className={ic} />),
        ...(hasRole(me, ACCESS.fraud)
          ? [item('/ajustes/alertas', 'Alertas antifraude', <ShieldIcon className={ic} />)]
          : []),
        item('/ajustes/suscripcion', 'Suscripción', <CardIcon className={ic} />),
      ],
    })
  }
  return groups
}

const linkClasses =
  'group press press-down relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13.5px] font-medium text-brand-200 outline-none hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-gold-500 [&.active]:bg-white/[0.09] [&.active]:text-white'

/** The folded menu (doc 08 - 4): one icon per option, named by a bubble. */
const railClasses =
  'group press press-down relative flex h-10 items-center justify-center rounded-lg text-brand-200 outline-none hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-gold-500 [&.active]:bg-white/[0.09] [&.active]:text-white'

/** Groups folded by default: settings are visited now and then. */
const FOLDED_BY_DEFAULT = ['Ajustes']
const FOLD_KEY = 'nav-folded'
const COLLAPSE_KEY = 'nav-collapsed'

function readFolded(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(FOLD_KEY) ?? '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

function NavLinks({
  groups,
  onNavigate,
  collapsed = false,
}: {
  groups: NavGroup[]
  onNavigate?: () => void
  /** The rail of the folded menu: icons only, every group open. */
  collapsed?: boolean
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const [folded, setFolded] = useState(readFolded)
  // The bubble that names the option under the pointer on the rail. Fixed on
  // the page, so the scrolling menu never clips it.
  const [tip, setTip] = useState<{ label: string; top: number; left: number } | null>(null)
  const toggle = (title: string, open: boolean) => {
    const next = { ...folded, [title]: !open }
    setFolded(next)
    try {
      localStorage.setItem(FOLD_KEY, JSON.stringify(next))
    } catch {
      // storage unavailable: the choice lasts until the page reloads
    }
  }
  const showTip = (target: HTMLElement, label: string) => {
    const rect = target.getBoundingClientRect()
    setTip({ label, top: rect.top + rect.height / 2, left: rect.right + 10 })
  }
  // A long menu keeps the screen in use in sight (Ajustes sits at the bottom).
  const navRef = useRef<HTMLElement>(null)
  useEffect(() => {
    navRef.current?.querySelector('a.active')?.scrollIntoView({ block: 'nearest' })
  }, [pathname])
  return (
    <nav
      ref={navRef}
      aria-label="Menú principal"
      className={`flex flex-col ${collapsed ? 'gap-2' : 'gap-4'}`}
    >
      {groups
        .filter((group) => group.items.length)
        .map((group, index) => {
          const title = group.title
          // The group of the screen in use always shows its items.
          const here = group.items.some(
            (entry) =>
              entry.to !== '/' && (pathname === entry.to || pathname.startsWith(`${entry.to}/`)),
          )
          const open =
            collapsed || !title || here || !(folded[title] ?? FOLDED_BY_DEFAULT.includes(title))
          const listId = `nav-${index}`
          return (
            <div key={title ?? index} className="flex flex-col gap-0.5">
              {title && collapsed ? (
                // A thin line stands for the group's title on the rail.
                <span aria-hidden className="mx-2 mb-1 h-px bg-white/10" />
              ) : title ? (
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={listId}
                  disabled={here}
                  onClick={() => toggle(title, open)}
                  className="group/title mb-1 flex items-center justify-between rounded-md px-2.5 py-0.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.08em] text-brand-200/60 outline-none transition-colors hover:text-brand-200 focus-visible:ring-2 focus-visible:ring-gold-500 disabled:cursor-default disabled:hover:text-brand-200/60"
                >
                  {title}
                  <ChevronDownIcon
                    className={`size-3.5 shrink-0 transition-transform group-disabled/title:hidden ${
                      open ? '' : '-rotate-90'
                    }`}
                  />
                </button>
              ) : null}
              <div id={listId} hidden={!open} className="flex flex-col gap-0.5">
                {group.items.map((entry) => {
                  const name = entry.badge ? `${entry.label} (${entry.badge})` : entry.label
                  return (
                    <Link
                      key={entry.to}
                      to={entry.to}
                      onClick={() => {
                        setTip(null)
                        onNavigate?.()
                      }}
                      className={collapsed ? railClasses : linkClasses}
                      activeOptions={{ exact: entry.to === '/' }}
                      aria-label={collapsed ? name : undefined}
                      onMouseEnter={
                        collapsed ? (event) => showTip(event.currentTarget, name) : undefined
                      }
                      onMouseLeave={collapsed ? () => setTip(null) : undefined}
                      onFocus={
                        collapsed ? (event) => showTip(event.currentTarget, name) : undefined
                      }
                      onBlur={collapsed ? () => setTip(null) : undefined}
                    >
                      {/* The gold marker of the active item (doc 08 - 2). */}
                      <span
                        aria-hidden
                        className={`absolute inset-y-2 w-[3px] rounded-r-full bg-gold-500 opacity-0 transition-opacity group-[.active]:opacity-100 ${
                          collapsed ? '-left-2' : '-left-3'
                        }`}
                      />
                      <span
                        className={`relative text-brand-200/75 transition-[color,transform] duration-150 group-hover:text-white group-[.active]:text-gold-500 ${
                          collapsed ? '' : 'group-hover:translate-x-0.5'
                        }`}
                      >
                        {entry.icon}
                        {collapsed && entry.badge ? (
                          <span
                            aria-hidden
                            className="absolute -right-1.5 -top-1 size-2 rounded-full bg-gold-500 ring-2 ring-brand-950"
                          />
                        ) : null}
                      </span>
                      {collapsed ? null : (
                        <>
                          <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                          {entry.badge ? (
                            <span className="rounded-full bg-gold-500 px-1.5 text-[11px] font-bold leading-[18px] text-brand-950">
                              {entry.badge}
                            </span>
                          ) : null}
                        </>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      {tip ? (
        <div
          role="tooltip"
          style={{ top: tip.top, left: tip.left }}
          className="pointer-events-none fixed z-50 -translate-y-1/2 animate-fade whitespace-nowrap rounded-lg bg-ink px-2.5 py-1 text-[12.5px] font-medium text-canvas shadow-lg"
        >
          {tip.label}
        </div>
      ) : null}
    </nav>
  )
}

/** A thin bar at the top while a screen loads its data or saves: the app
 * never looks frozen. Waits a moment so quick answers don't flash it. */
function TopProgress() {
  const loading = useIsFetching({ predicate: (query) => query.state.data === undefined })
  const saving = useIsMutating()
  const busy = loading + saving > 0
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!busy) return
    const timer = window.setTimeout(() => setShown(true), 180)
    return () => {
      window.clearTimeout(timer)
      setShown(false)
    }
  }, [busy])
  if (!busy || !shown) return null
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-0.5 overflow-hidden bg-brand-700/15"
    >
      <div className="h-full w-1/3 animate-progress rounded-full bg-brand-700" />
    </div>
  )
}

const STATUS_CHIP: Record<string, { label: string; className: string }> = {
  trial: { label: 'En prueba', className: 'bg-gold-500/15 text-gold-500 ring-gold-500/30' },
  suspended: { label: 'Solo lectura', className: 'bg-danger-600/20 text-white ring-danger-600/40' },
}

/** The tenant the user works in, always in sight (doc 07 - section 2). */
function CompanyBadge({ me, compact = false }: { me: Me; compact?: boolean }) {
  if (!me.company_name) return null
  const chip = me.company_status ? STATUS_CHIP[me.company_status] : undefined
  if (compact)
    return (
      <div
        title={me.company_name}
        className="mx-auto grid size-10 place-items-center rounded-xl bg-white/[0.06] ring-1 ring-white/[0.06]"
      >
        <span
          aria-hidden
          className="grid size-8 place-items-center rounded-lg bg-gold-500 font-display text-[12px] font-bold text-brand-950"
        >
          {initials(me.company_name)}
        </span>
        <span className="sr-only">
          {me.company_name}
          {chip ? ` · ${chip.label}` : ''}
        </span>
      </div>
    )
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.06] p-2.5 ring-1 ring-white/[0.06]">
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-lg bg-gold-500 font-display text-[13px] font-bold text-brand-950"
      >
        {initials(me.company_name)}
      </span>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold text-white" title={me.company_name}>
          {me.company_name}
        </div>
        {chip ? (
          <span
            className={`mt-0.5 inline-block rounded-full px-1.5 text-[10.5px] font-semibold leading-4 ring-1 ring-inset ${chip.className}`}
          >
            {chip.label}
          </span>
        ) : (
          <div className="text-[11.5px] text-brand-200/70">Empresa</div>
        )}
      </div>
    </div>
  )
}

/** Avatar, name and role, with «Mi cuenta», the theme and «Cerrar sesión». */
function UserMenu({
  name,
  email,
  roleText,
  onLogout,
  leaving,
}: {
  name: string
  email: string
  roleText: string
  onLogout: () => void
  leaving: boolean
}) {
  const [open, setOpen] = useState(false)
  const [dark, toggleTheme] = useDarkTheme()
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  const row =
    'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-ink outline-none transition-colors hover:bg-brand-50 focus-visible:bg-brand-50'
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`Tu cuenta: ${name}`}
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 items-center gap-2.5 rounded-lg pl-1 pr-1 outline-none transition-colors hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-accent-500 sm:h-9 lg:pr-2"
      >
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-700 text-[12px] font-semibold text-on-brand sm:size-7"
        >
          {initials(name)}
        </span>
        {/* Beside the sidebar a tablet has no room for the name. */}
        <span className="hidden max-w-44 text-left leading-tight lg:block">
          <span className="block truncate text-[13px] font-semibold">{name}</span>
          <span className="block truncate text-[11.5px] text-muted">{roleText}</span>
        </span>
        <span className="hidden text-muted lg:block">
          <ChevronDownIcon />
        </span>
      </button>
      {open ? (
        <div
          id={id}
          className="absolute right-0 z-40 mt-2 w-64 animate-pop rounded-xl border border-edge bg-surface p-1.5 shadow-lg"
        >
          <div className="border-b border-edge px-2.5 pb-2.5 pt-1.5">
            <div className="truncate text-sm font-semibold">{name}</div>
            <div className="truncate text-[12px] text-muted">{email}</div>
            <div className="mt-0.5 truncate text-[12px] text-muted">{roleText}</div>
          </div>
          <div className="pt-1.5">
            <Link to="/cuenta" className={row} onClick={() => setOpen(false)}>
              <UserIcon className="size-[18px] shrink-0 text-muted" />
              Mi cuenta
            </Link>
            <button type="button" className={row} onClick={toggleTheme}>
              {dark ? (
                <SunIcon className="size-[18px] shrink-0 text-muted" />
              ) : (
                <MoonIcon className="size-[18px] shrink-0 text-muted" />
              )}
              {dark ? 'Tema claro' : 'Tema oscuro'}
            </button>
            <button
              type="button"
              className={`${row} text-danger-600`}
              onClick={onLogout}
              disabled={leaving}
            >
              <LogoutIcon className="size-[18px] shrink-0" />
              {leaving ? 'Cerrando sesión…' : 'Cerrar sesión'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

const barBase =
  'press press-down flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium outline-none focus-visible:bg-brand-50'
const barItem = `${barBase} text-muted [&.active]:text-brand-700 [&.active_.pill]:bg-brand-100`

/** Phones get a bottom bar (decision 038, doc 07 - 2): office «Inicio · Buscar ·
 * Cobrar · Más», collector «Mi ruta · Buscar · Cobrar · Más». */
function MobileBar({
  me,
  groups,
  onSearch,
}: {
  me: Me
  groups: NavGroup[]
  onSearch: (intent?: PaletteIntent) => void
}) {
  const [open, setOpen] = useState(false)
  const collects = hasRole(me, ACCESS.collect)
  const quick = platformView(me)
    ? [{ to: '/plataforma', label: 'Empresas', icon: <HomeIcon /> }]
    : hasRole(me, ACCESS.myRoute)
      ? [{ to: '/ruta', label: 'Mi ruta', icon: <RouteIcon /> }]
      : [
          { to: '/', label: 'Inicio', icon: <HomeIcon /> },
          ...(collects
            ? hasRole(me, ACCESS.myCash)
              ? [{ to: '/caja', label: 'Caja', icon: <CashIcon /> }]
              : []
            : [{ to: '/clientes', label: 'Clientes', icon: <PeopleIcon /> }]),
          ...(!collects && hasRole(me, ACCESS.loans)
            ? [{ to: '/prestamos', label: 'Préstamos', icon: <LoanIcon /> }]
            : []),
        ]
  const pill = 'pill grid h-7 w-12 place-items-center rounded-full transition-colors'
  return (
    <>
      {open ? (
        <Modal onClose={() => setOpen(false)} label="Menú" align="bottom">
          <div className="relative max-h-[85vh] w-full animate-sheet overflow-hidden rounded-t-3xl bg-brand-950">
            <Texture tone="forest" />
            <div className="relative max-h-[85vh] space-y-4 overflow-y-auto px-4 pb-8 pt-2.5">
              <span aria-hidden className="mx-auto block h-1 w-10 rounded-full bg-white/20" />
              <CompanyBadge me={me} />
              <div className="pl-3">
                <NavLinks groups={groups} onNavigate={() => setOpen(false)} />
              </div>
              <button
                type="button"
                className="h-11 w-full rounded-xl bg-white/[0.06] px-3 text-sm font-medium text-brand-200 hover:bg-white/10"
                onClick={() => setOpen(false)}
              >
                Cerrar menú
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
      <nav
        aria-label="Accesos rápidos"
        className="fixed inset-x-0 bottom-0 z-50 flex h-16 border-t border-edge bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden"
      >
        {quick.map((entry) => (
          <Link
            key={entry.to}
            to={entry.to}
            onClick={() => setOpen(false)}
            activeOptions={{ exact: entry.to === '/' }}
            className={barItem}
          >
            <span className={pill}>{entry.icon}</span>
            {entry.label}
          </Link>
        ))}
        {!platformView(me) ? (
          <button
            type="button"
            className={barItem}
            onClick={() => {
              setOpen(false)
              onSearch()
            }}
          >
            <span className={pill}>
              <SearchIcon />
            </span>
            Buscar
          </button>
        ) : null}
        {collects ? (
          <button
            type="button"
            className={`${barBase} text-brand-700`}
            onClick={() => {
              setOpen(false)
              onSearch('cobrar')
            }}
          >
            {/* The collector's main action stands out in the bar. */}
            <span className="grid h-7 w-12 place-items-center rounded-full bg-brand-700 text-on-brand shadow-sm">
              <CollectIcon />
            </span>
            Cobrar
          </button>
        ) : null}
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className={barItem}
        >
          <span className={pill}>
            <MenuIcon />
          </span>
          Más
        </button>
      </nav>
    </>
  )
}

/** The bell (doc 07 - 2): unread notices and authorizations to decide. */
function Bell({ me }: { me: Me }) {
  const count = (me.unread_notifications ?? 0) + (me.pending_approvals ?? 0)
  const label = count
    ? `Avisos: ${count} pendiente${count === 1 ? '' : 's'}`
    : 'Avisos y autorizaciones'
  return (
    <Link to="/avisos" title={label} aria-label={label} className={iconButton}>
      <BellIcon />
      {count ? (
        <span className="absolute right-0.5 top-0.5 min-w-[18px] rounded-full bg-danger-600 px-1 text-center text-[10.5px] font-bold leading-[18px] text-on-danger ring-2 ring-surface">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  )
}

export function AppShell({
  user,
  me: initialMe,
  children,
}: {
  user: SessionUser
  me: Me
  children: ReactNode
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // The badges stay fresh: Me is re-read every minute while the app is open.
  const live = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    initialData: initialMe,
    refetchInterval: 60_000,
  })
  const me = live.data ?? initialMe
  const [searching, setSearching] = useState<PaletteIntent | null>(null)
  const closeSearch = useCallback(() => setSearching(null), [])
  const searchable = !platformView(me)
  // The menu folds to a rail of icons (doc 08 - 4); the choice is remembered.
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
    } catch {
      // storage unavailable: the choice lasts until the page reloads
    }
  }

  useEffect(() => {
    if (!searchable) return
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearching((value) => (value ? null : 'buscar'))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [searchable])
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      queryClient.clear()
      navigate({ to: '/entrar' })
    },
  })

  const groups = navFor(me)
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const name = [me.first_name, me.last_name].filter(Boolean).join(' ') || user.email
  const roleText = platformView(me)
    ? 'Dueño de la plataforma'
    : me.support
      ? 'Soporte de Cobradía · solo lectura'
      : me.roles.join(' · ')
  return (
    <div className="flex min-h-screen">
      <a
        href="#contenido"
        className="sr-only z-50 rounded-lg bg-surface px-3 py-2 text-sm font-semibold focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Saltar al contenido
      </a>
      <TopProgress />
      {searchable && searching ? (
        <CommandPalette me={me} intent={searching} onClose={closeSearch} />
      ) : null}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col bg-brand-950 transition-[width] duration-200 sm:flex ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        {/* The texture of the sign-in panel follows the person into the app. */}
        <Texture tone="forest" />
        <div
          className={`scroll-quiet relative flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pb-4 pt-4 ${
            collapsed ? 'px-2' : 'px-3'
          }`}
        >
          <Link
            to="/"
            aria-label={collapsed ? 'Inicio' : undefined}
            className={`rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-gold-500 ${
              collapsed ? 'mx-auto p-1' : 'self-start px-2 py-1'
            }`}
          >
            {collapsed ? (
              <BrandMark tone="light" className="size-8" />
            ) : (
              <Brand className="text-[1.2rem]" tone="light" />
            )}
          </Link>
          <CompanyBadge me={me} compact={collapsed} />
          <NavLinks groups={groups} collapsed={collapsed} />
        </div>
        <div
          className={`relative border-t border-white/[0.08] py-2 ${collapsed ? 'px-2' : 'px-3'}`}
        >
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Desplegar el menú' : 'Plegar el menú'}
            title={collapsed ? 'Desplegar el menú' : undefined}
            className={`flex h-9 w-full items-center gap-3 rounded-lg text-[13px] font-medium text-brand-200/80 outline-none transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-gold-500 ${
              collapsed ? 'justify-center' : 'px-2.5'
            }`}
          >
            {collapsed ? <PanelUnfoldIcon /> : <PanelFoldIcon />}
            {collapsed ? null : 'Plegar el menú'}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <SupportBanner me={me} />
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-edge/80 bg-canvas/80 px-4 backdrop-blur-md sm:px-6">
          <span className="sm:hidden">
            <Brand className="text-lg" />
          </span>
          {!platformView(me) ? (
            <button
              type="button"
              onClick={() => setSearching('buscar')}
              className="hidden h-9 w-full min-w-0 max-w-md items-center gap-2.5 rounded-lg border border-edge bg-surface px-3 text-sm text-muted shadow-xs outline-none transition-colors hover:border-muted/40 focus-visible:ring-2 focus-visible:ring-accent-500 sm:flex"
            >
              <SearchIcon className="size-4 shrink-0" />
              <span className="flex-1 truncate text-left">Buscar cliente, cédula o préstamo…</span>
              <kbd className="rounded-md border border-edge bg-surface-2 px-1.5 font-sans text-[11px] font-medium leading-5">
                Ctrl K
              </kbd>
            </button>
          ) : (
            <span className="hidden sm:block" />
          )}
          <div className="flex items-center gap-1">
            {!platformView(me) ? <Bell me={me} /> : null}
            <span className="hidden sm:block">
              <ThemeToggle />
            </span>
            <span aria-hidden className="mx-1.5 hidden h-6 w-px bg-edge sm:block" />
            <UserMenu
              name={name}
              email={user.email}
              roleText={roleText}
              onLogout={() => logoutMutation.mutate()}
              leaving={logoutMutation.isPending}
            />
          </div>
        </header>
        <main
          id="contenido"
          tabIndex={-1}
          className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 outline-none sm:px-6 sm:pb-10 sm:pt-7"
        >
          {/* Each screen rises into place (decision 112): the key restarts the
              animation when the path changes. */}
          <div key={pathname} className="animate-rise space-y-5">
            {children}
          </div>
        </main>
      </div>
      <MobileBar me={me} groups={groups} onSearch={(intent) => setSearching(intent ?? 'buscar')} />
    </div>
  )
}
