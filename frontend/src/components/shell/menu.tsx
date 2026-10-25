import type { ReactNode } from 'react'

import type { Me } from '../../api/accounts'
import { missingFeature } from '../../lib/plan'
import { ACCESS, hasRole, platformView } from '../../lib/roles'
import {
  AgendaIcon,
  ApplicationIcon,
  ArrowsIcon,
  AwardIcon,
  BankIcon,
  BookIcon,
  BriefcaseIcon,
  BuildingIcon,
  CalculatorIcon,
  CardIcon,
  ChartIcon,
  ChatIcon,
  ClockAlertIcon,
  CoinsIcon,
  CollectIcon,
  DisburseIcon,
  DrawerIcon,
  HashIcon,
  HomeIcon,
  InvoiceIcon,
  LoanIcon,
  MapIcon,
  PeopleIcon,
  PercentIcon,
  PieIcon,
  RouteIcon,
  ScaleIcon,
  SettingsIcon,
  ShieldIcon,
  StampIcon,
  StarCalendarIcon,
  StoreIcon,
  TagIcon,
  TrendIcon,
  UserCogIcon,
  WalletIcon,
} from '../icons'

/** One screen of the menu. */
export interface NavLeaf {
  to: string
  label: string
  icon: ReactNode
  badge?: number
}

/** An entry of the menu: a screen, or a section whose screens live in a
 * sub-menu beside the content (Reportes, Finanzas, Ajustes; decision 114). */
export interface NavEntry extends NavLeaf {
  children?: NavLeaf[]
}

export interface NavGroup {
  title: string | null
  items: NavEntry[]
}

const ic = 'size-5 shrink-0'
const sub = 'size-[18px] shrink-0'

const leaf = (to: string, label: string, icon: ReactNode, badge?: number): NavLeaf => ({
  to,
  label,
  icon,
  badge,
})

/** A section shows as one entry: with a single screen it is that screen. */
function section(label: string, icon: ReactNode, children: NavLeaf[]): NavEntry | null {
  if (!children.length) return null
  if (children.length === 1) return { ...children[0], icon }
  const badge = children.reduce((sum, child) => sum + (child.badge ?? 0), 0)
  return { to: children[0].to, label, icon, badge: badge || undefined, children }
}

const present = (entries: (NavEntry | null)[]) =>
  entries.filter((entry): entry is NavEntry => entry !== null)

/** The menu of «Bosque y Arena» (decision 114): Operación, Cobro and Gestión,
 * only with what the role can use (decision 038). */
export function navFor(me: Me): NavGroup[] {
  if (platformView(me)) {
    return [
      {
        title: null,
        items: [
          leaf('/plataforma', 'Empresas', <BuildingIcon className={ic} />),
          leaf('/plataforma/planes', 'Planes', <TagIcon className={ic} />),
        ],
      },
    ]
  }
  const onlyCollector = me.roles.length > 0 && me.roles.every((role) => role === 'Cobrador')

  const operation = present([
    onlyCollector ? null : leaf('/', 'Inicio', <HomeIcon className={ic} />),
    leaf('/clientes', 'Clientes', <PeopleIcon className={ic} />),
    hasRole(me, ACCESS.applications)
      ? leaf('/solicitudes', 'Solicitudes', <ApplicationIcon className={ic} />)
      : null,
    hasRole(me, ACCESS.loans) ? leaf('/prestamos', 'Préstamos', <LoanIcon className={ic} />) : null,
    hasRole(me, ACCESS.disburse)
      ? leaf('/desembolsos', 'Desembolsos', <DisburseIcon className={ic} />)
      : null,
    hasRole(me, ACCESS.simulate)
      ? leaf('/simulador', 'Simulador', <CalculatorIcon className={ic} />)
      : null,
  ])

  const collection = present([
    hasRole(me, ACCESS.myRoute) ? leaf('/ruta', 'Mi ruta', <RouteIcon className={ic} />) : null,
    hasRole(me, ACCESS.routes)
      ? leaf('/rutas', 'Rutas de cobro', <MapIcon className={ic} />)
      : null,
    hasRole(me, ACCESS.manageCollections)
      ? leaf('/cobranza', 'Cobranza', <AgendaIcon className={ic} />, me.agenda_today)
      : null,
    hasRole(me, ACCESS.myCash) ? leaf('/caja', 'Mi caja', <WalletIcon className={ic} />) : null,
    hasRole(me, ACCESS.cashSessions)
      ? leaf('/cajas', 'Cajas', <DrawerIcon className={ic} />, me.closings_to_approve)
      : null,
    hasRole(me, ACCESS.delinquency)
      ? leaf('/atrasos', 'Atrasos', <ClockAlertIcon className={ic} />)
      : null,
    hasRole(me, ACCESS.legal)
      ? leaf('/legal', 'Casos legales', <ScaleIcon className={ic} />)
      : null,
  ])

  const reports: NavLeaf[] = []
  if (hasRole(me, ACCESS.reports))
    reports.push(leaf('/reportes', 'Centro de reportes', <ChartIcon className={sub} />))
  if (hasRole(me, ACCESS.indicators)) {
    reports.push(leaf('/reportes/cartera', 'Cartera', <PieIcon className={sub} />))
    reports.push(leaf('/reportes/cobros', 'Cobros', <CollectIcon className={sub} />))
  }
  if (hasRole(me, ACCESS.scores))
    reports.push(leaf('/reportes/clasificacion', 'Clasificación', <AwardIcon className={sub} />))
  if (hasRole(me, ACCESS.commissions))
    reports.push(leaf('/reportes/comisiones', 'Comisiones', <PercentIcon className={sub} />))
  if (hasRole(me, ACCESS.books))
    reports.push(leaf('/reportes/resultados', 'Resultados', <TrendIcon className={sub} />))
  // P79 lives in Ajustes for the manager; audit reaches it from Reportes.
  if (hasRole(me, ACCESS.fraud) && !me.is_manager)
    reports.push(leaf('/ajustes/alertas', 'Alertas antifraude', <ShieldIcon className={sub} />))

  const finance: NavLeaf[] = []
  if (hasRole(me, ACCESS.finance))
    finance.push(leaf('/cuentas', 'Cuentas y bancos', <BankIcon className={sub} />))
  if (hasRole(me, ACCESS.expenses))
    finance.push(leaf('/gastos', 'Gastos e ingresos', <ArrowsIcon className={sub} />))
  if (hasRole(me, ACCESS.payables))
    finance.push(leaf('/cuentas-por-pagar', 'Cuentas por pagar', <InvoiceIcon className={sub} />))
  if (hasRole(me, ACCESS.books)) {
    finance.push(leaf('/comprobantes', 'Comprobantes fiscales', <StampIcon className={sub} />))
    finance.push(leaf('/contabilidad', 'Contabilidad', <BookIcon className={sub} />))
  }

  const settings: NavLeaf[] = me.is_manager
    ? [
        leaf('/ajustes/empresa', 'Empresa', <BuildingIcon className={sub} />),
        leaf('/ajustes/productos', 'Productos', <TagIcon className={sub} />),
        leaf('/ajustes/sucursales', 'Sucursales', <StoreIcon className={sub} />),
        leaf('/ajustes/usuarios', 'Usuarios', <UserCogIcon className={sub} />),
        leaf('/ajustes/feriados', 'Feriados', <StarCalendarIcon className={sub} />),
        leaf('/ajustes/numeraciones', 'Numeraciones', <HashIcon className={sub} />),
        leaf('/ajustes/legales', 'Profesionales legales', <BriefcaseIcon className={sub} />),
        leaf('/ajustes/mensajes', 'Mensajería', <ChatIcon className={sub} />),
        ...(hasRole(me, ACCESS.fraud)
          ? [leaf('/ajustes/alertas', 'Alertas antifraude', <ShieldIcon className={sub} />)]
          : []),
        leaf('/ajustes/suscripcion', 'Suscripción', <CardIcon className={sub} />),
      ]
    : []

  const management = present([
    section('Reportes', <ChartIcon className={ic} />, reports),
    section('Finanzas', <CoinsIcon className={ic} />, finance),
    section('Ajustes', <SettingsIcon className={ic} />, settings),
  ])

  const groups: NavGroup[] = [
    { title: 'Operación', items: operation },
    { title: 'Cobro', items: collection },
    { title: 'Gestión', items: management },
  ]
  // The collector lives on the street: his route comes first.
  if (onlyCollector) groups.unshift(groups.splice(1, 1)[0])
  return groups
    .map((group) => ({ ...group, items: inPlan(me, group.items) }))
    .filter((group) => group.items.length)
}

/** Decision 124: the screens the company's plan does not include leave the
 * menu; a section left with one screen becomes that screen. */
function inPlan(me: Me, entries: NavEntry[]): NavEntry[] {
  const kept: NavEntry[] = []
  for (const entry of entries) {
    if (!entry.children) {
      if (!missingFeature(me, entry.to)) kept.push(entry)
      continue
    }
    const children = entry.children.filter((child) => !missingFeature(me, child.to))
    if (!children.length) continue
    if (children.length === 1) kept.push({ ...children[0], icon: entry.icon })
    else kept.push({ ...entry, to: children[0].to, children })
  }
  return kept
}

/** «/prestamos» owns «/prestamos/01-000010», never «/prestamosX»; «/» is only home. */
export function owns(to: string, pathname: string) {
  if (to === '/') return pathname === '/'
  return pathname === to || pathname.startsWith(`${to}/`)
}

export interface Here {
  /** The screen of the menu in use: the longest one that owns the path. */
  leaf: NavLeaf
  /** Its section when it lives in a sub-menu. */
  section: NavEntry | null
}

/** Where the person is in the menu, or null outside it (Avisos, Mi cuenta). */
export function locate(pathname: string, groups: NavGroup[]): Here | null {
  let best: Here | null = null
  for (const group of groups) {
    for (const entry of group.items) {
      const candidates = entry.children
        ? entry.children.map((child) => ({ leaf: child, section: entry }))
        : [{ leaf: entry as NavLeaf, section: null }]
      for (const candidate of candidates) {
        if (!owns(candidate.leaf.to, pathname)) continue
        if (!best || candidate.leaf.to.length > best.leaf.to.length) best = candidate
      }
    }
  }
  return best
}

export interface Crumb {
  label: string
  to?: string
}

/** Screens outside the menu that belong to one inside it. */
const PARENT: Record<string, string> = { '/cobrar': '/prestamos', '/recibos': '/prestamos' }

/** The last crumb of a screen deeper than its menu entry. */
const DETAILS: [RegExp, (match: RegExpMatchArray) => string][] = [
  [/^\/clientes\/nuevo$/, () => 'Nuevo cliente'],
  [/^\/clientes\/[^/]+$/, () => 'Ficha del cliente'],
  [/^\/solicitudes\/nueva$/, () => 'Nueva solicitud'],
  [/^\/solicitudes\/[^/]+$/, () => 'Solicitud'],
  [/^\/desembolsos\/[^/]+$/, () => 'Desembolso'],
  [/^\/prestamos\/([^/]+)$/, (m) => `Préstamo ${m[1]}`],
  [/^\/cobrar\/([^/]+)$/, (m) => `Cobrar ${m[1]}`],
  [/^\/recibos\/([^/]+)$/, (m) => `Recibo ${m[1]}`],
  [/^\/cajas\/[^/]+$/, () => 'Cierre de caja'],
  [/^\/legal\/[^/]+$/, () => 'Caso legal'],
]

/** Screens of the bar that have no entry in the menu. */
const OUTSIDE: Record<string, string> = { '/avisos': 'Avisos', '/cuenta': 'Mi cuenta' }

/** The pages of Mi cuenta (decision 117): «Mi cuenta › Contraseña». */
const ACCOUNT_PAGES: Record<string, string> = {
  '/cuenta/contrasena': 'Contraseña',
  '/cuenta/dos-pasos': 'Verificación en dos pasos',
  '/cuenta/sesiones': 'Sesiones abiertas',
}

function decode(text: string) {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

/** The breadcrumbs of the top bar: section › screen › detail. Every crumb
 * but the last one links back. */
export function crumbsFor(pathname: string, groups: NavGroup[]): Crumb[] {
  if (OUTSIDE[pathname]) return [{ label: OUTSIDE[pathname] }]
  if (ACCOUNT_PAGES[pathname]) {
    return [{ label: OUTSIDE['/cuenta'], to: '/cuenta' }, { label: ACCOUNT_PAGES[pathname] }]
  }
  const top = `/${pathname.split('/')[1] ?? ''}`
  const here = locate(pathname, groups) ?? (PARENT[top] ? locate(PARENT[top], groups) : null)
  const crumbs: Crumb[] = []
  if (here?.section) crumbs.push({ label: here.section.label, to: here.section.to })
  if (here) crumbs.push({ label: here.leaf.label, to: here.leaf.to })
  if (!here || here.leaf.to !== pathname) {
    const detail = DETAILS.find(([pattern]) => pattern.test(pathname))
    const match = detail ? pathname.match(detail[0]) : null
    if (detail && match) crumbs.push({ label: decode(detail[1](match)) })
  }
  const last = crumbs.at(-1)
  if (last) delete last.to
  return crumbs
}
