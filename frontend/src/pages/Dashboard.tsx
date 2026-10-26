import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Children, type ReactNode, useState } from 'react'

import { listBranches, type Me } from '../api/accounts'
import { getMyCash } from '../api/cash'
import { listApplications, listLoans } from '../api/origination'
import { getMyCompany } from '../api/platform'
import { type Dashboard, getDashboard } from '../api/reports'
import {
  AgendaIcon,
  ApplicationIcon,
  ArrowRightIcon,
  CalculatorIcon,
  CheckCircleIcon,
  ClockAlertIcon,
  DisburseIcon,
  DrawerIcon,
  LoanIcon,
  PencilIcon,
  PlusIcon,
  RouteIcon,
  ShieldIcon,
  WalletIcon,
} from '../components/icons'
import { FirstStepsCard } from '../components/FirstSteps'
import { Kpi } from '../components/Kpi'
import { Alert, Figure, LoadError, Section, Texture } from '../components/ui'
import { buttonClass } from '../components/classes'
import { pct, plural, rd, short, whole } from '../lib/format'
import { useCountUp } from '../lib/hooks'
import { ACCESS, hasRole } from '../lib/roles'
import { useBranchScope } from '../lib/scope'

type Tone = 'go' | 'warn' | 'bad'

const WELL: Record<Tone, string> = {
  go: 'bg-brand-50 text-brand-700',
  warn: 'bg-warning-100 text-warning-700',
  bad: 'bg-danger-100 text-danger-600',
}

/** One queue of «Tu trabajo de hoy» (decision 115): icon, label, the count in
 * Sora 28 and what it means. An empty queue stays quiet. */
function Tile({
  to,
  search,
  label,
  value,
  hint,
  icon,
  tone = 'go',
}: {
  to: string
  search?: Record<string, string>
  label: string
  value?: string | number
  hint: string
  icon: ReactNode
  tone?: Tone
}) {
  const waiting = typeof value === 'string' || (typeof value === 'number' && value > 0)
  return (
    <Link
      to={to}
      search={search}
      className="group lift @container flex h-full min-w-0 flex-col rounded-xl border border-edge bg-surface px-4 pb-4 pt-3.5 shadow-sm outline-none hover:border-brand-700/35 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-accent-500"
    >
      {/* A narrow card (two per row on a phone) puts the icon above the label. */}
      <div className="flex flex-col items-start gap-2.5 @min-[11rem]:flex-row @min-[11rem]:items-center">
        <span
          aria-hidden
          className={`grid size-[30px] shrink-0 place-items-center rounded-lg transition-colors ${
            waiting ? WELL[tone] : 'bg-surface-2 text-muted'
          }`}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1 text-[12.5px] font-medium leading-tight text-muted">
          {label}
        </span>
        <span
          aria-hidden
          className="hidden text-muted opacity-0 transition-opacity group-hover:opacity-100 @min-[13rem]:block"
        >
          <ArrowRightIcon />
        </span>
      </div>
      <div
        className={`mt-2 whitespace-nowrap font-display font-semibold leading-none tracking-[-0.02em] tabular-nums @min-[11rem]:mt-3.5 ${
          waiting ? (tone === 'warn' ? 'text-warning-700' : 'text-ink') : 'text-muted'
        } ${
          typeof value === 'string' && value.includes('RD$')
            ? 'text-base @min-[11rem]:text-xl'
            : 'text-2xl @min-[11rem]:text-[28px]'
        }`}
      >
        <Figure value={value ?? '…'} />
      </div>
      <div className="mt-1.5 hidden text-[12px] leading-snug text-muted sm:block">{hint}</div>
    </Link>
  )
}

const tileIcon = 'size-[18px] shrink-0'

/** The cards reveal one after another (decision 112); the columns follow
 * how many there are so the rows come out even. */
function Grid({
  label,
  children,
  row = false,
}: {
  label?: string
  children: ReactNode
  /** Six in one row on a wide screen (the work queue of decision 115). */
  row?: boolean
}) {
  const items = Children.toArray(children)
  const count = items.length
  const columns =
    count >= 6
      ? `md:grid-cols-3 ${row ? 'min-[83.75rem]:grid-cols-6' : ''}`
      : count === 5
        ? 'md:grid-cols-3 xl:grid-cols-5'
        : count === 4
          ? 'lg:grid-cols-4'
          : count === 3
            ? 'md:grid-cols-3'
            : 'sm:grid-cols-2'
  return (
    <div aria-label={label} className={`grid grid-cols-2 gap-2.5 sm:gap-3 ${columns}`}>
      {items.map((child, index) => (
        <div
          key={index}
          className="flex min-w-0 animate-reveal [&>*]:min-w-0 [&>*]:flex-1"
          style={{ animationDelay: `${140 + index * 45}ms` }}
        >
          {child}
        </div>
      ))}
    </div>
  )
}

/** P10, the work queue: what is waiting for this role today. */
function Today({ me }: { me: Me }) {
  const decider = hasRole(me, ACCESS.decide)
  const originator = hasRole(me, ACCESS.originate)
  const disburser = hasRole(me, ACCESS.disburse)
  const reader = hasRole(me, ACCESS.loans)
  const pending = useQuery({
    queryKey: ['applications', 'por_aprobar', '', 1],
    queryFn: () => listApplications({ bandeja: 'por_aprobar' }),
    enabled: decider,
  })
  // Who decides has few drafts of his own; the officer lives on them.
  const ownDrafts = originator && !decider
  const drafts = useQuery({
    queryKey: ['applications', 'mias', '', 1],
    queryFn: () => listApplications({ bandeja: 'mias' }),
    enabled: ownDrafts,
  })
  const toDisburse = useQuery({
    queryKey: ['applications', 'por_desembolsar', '', 1],
    queryFn: () => listApplications({ bandeja: 'por_desembolsar' }),
    enabled: disburser,
  })
  // Who sees the indicators below gets the portfolio there, not twice.
  const board = hasRole(me, ACCESS.indicators)
  const loans = useQuery({
    queryKey: ['loans', 'active', '', 1],
    queryFn: () => listLoans({ status: 'active' }),
    enabled: reader && !board,
  })
  const cashier = hasRole(me, ACCESS.myCash)
  const supervisor = hasRole(me, ACCESS.supervise)
  const watchesArrears = hasRole(me, ACCESS.delinquency)
  const cash = useQuery({ queryKey: ['my-cash'], queryFn: getMyCash, enabled: cashier })
  const arrears = useQuery({
    queryKey: ['loans', 'active', 'atraso'],
    queryFn: () => listLoans({ status: 'active', tramo: 'atraso' }),
    enabled: watchesArrears,
  })
  if (!reader) return null
  return (
    <Section title="Tu trabajo de hoy" aside="Lo que espera por ti">
      <Grid label="Tu trabajo de hoy" row>
        {decider ? (
          <Tile
            to="/solicitudes"
            search={{ bandeja: 'por_aprobar' }}
            label="Por aprobar"
            icon={<ApplicationIcon className={tileIcon} />}
            value={pending.data?.count}
            hint="Solicitudes que puedes decidir"
          />
        ) : null}
        {ownDrafts ? (
          <Tile
            to="/solicitudes"
            search={{ bandeja: 'mias' }}
            label="Mis borradores"
            icon={<PencilIcon className={tileIcon} />}
            value={drafts.data?.count}
            hint="Borradores y devueltas"
          />
        ) : null}
        {disburser ? (
          <Tile
            to="/desembolsos"
            label="Por desembolsar"
            icon={<DisburseIcon className={tileIcon} />}
            value={toDisburse.data?.count}
            hint="Aprobadas y vigentes"
          />
        ) : null}
        {cashier ? (
          <Tile
            to="/caja"
            label="Mi caja"
            icon={<WalletIcon className={tileIcon} />}
            value={
              cash.data
                ? cash.data.session
                  ? rd(cash.data.session.expected)
                  : 'Cerrada'
                : undefined
            }
            hint={
              cash.data?.session
                ? `${cash.data.session.number} · ${
                    cash.data.routes_to_settle.length
                      ? `${plural(cash.data.routes_to_settle.length, 'rendición', 'rendiciones')} por recibir`
                      : 'ninguna rendición por recibir'
                  }`
                : 'Ábrela para cobrar y desembolsar en efectivo'
            }
          />
        ) : null}
        {supervisor ? (
          <Tile
            to="/avisos"
            label="Por autorizar"
            icon={<ShieldIcon className={tileIcon} />}
            value={me.pending_approvals ?? 0}
            hint="Reversos, condonaciones y descuentos"
          />
        ) : null}
        {hasRole(me, ACCESS.cashSessions) && supervisor ? (
          <Tile
            to="/cajas"
            label="Cierres por aprobar"
            icon={<DrawerIcon className={tileIcon} />}
            value={me.closings_to_approve ?? 0}
            hint="Cajas que esperan tu visto bueno"
          />
        ) : null}
        {hasRole(me, ACCESS.manageCollections) ? (
          <Tile
            to="/cobranza"
            label="Agenda de hoy"
            icon={<AgendaIcon className={tileIcon} />}
            value={me.agenda_today ?? 0}
            hint="Promesas que vencen y seguimientos"
          />
        ) : null}
        {watchesArrears ? (
          <Tile
            to="/atrasos"
            icon={<ClockAlertIcon className={tileIcon} />}
            label="En atraso"
            value={arrears.data?.count}
            tone="warn"
            hint={
              arrears.data
                ? `${short(arrears.data.totals.principal_outstanding)} de capital en riesgo`
                : 'Préstamos con cuotas vencidas'
            }
          />
        ) : null}
        {board ? null : (
          <Tile
            to="/prestamos"
            label="Préstamos activos"
            icon={<LoanIcon className={tileIcon} />}
            value={loans.data?.count}
            hint={
              loans.data
                ? `${short(loans.data.totals.principal_outstanding)} de capital`
                : 'Cartera de tu alcance'
            }
          />
        )}
      </Grid>
    </Section>
  )
}

const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

/** The colors of the aging, from emerald to danger through the warning. */
const BUCKET_COLOR = [
  'bg-brand-700',
  'bg-warning-700/35',
  'bg-warning-700/60',
  'bg-warning-700/85',
  'bg-warning-700',
  'bg-danger-600',
]

/** «Mora por tramos» (decision 115): one bar at 100 % split by bucket and the
 * table under it, with the count, the capital and its share. */
function Buckets({ data }: { data: Dashboard }) {
  const p = data.indicators!.portfolio
  const total = p.buckets.reduce((sum, b) => sum + Number(b.principal), 0)
  const share = (b: { principal: string }) => (total > 0 ? Number(b.principal) / total : 0)
  return (
    <Section title="Mora por tramos" aside="Capital pendiente">
      <div className="flex flex-1 flex-col gap-3.5 rounded-xl border border-edge bg-surface px-5 py-[18px] shadow-sm">
        <div
          role="img"
          aria-label="Reparto de la cartera por tramo de atraso"
          className="flex h-3 origin-left animate-grow-x gap-0.5 overflow-hidden rounded-md bg-surface-2"
        >
          {p.buckets.map((b, index) =>
            share(b) > 0 ? (
              <span
                key={b.key}
                className={BUCKET_COLOR[index] ?? 'bg-danger-600'}
                style={{ width: `${share(b) * 100}%` }}
              />
            ) : null,
          )}
        </div>
        <table className="w-full text-[13px]">
          <caption className="sr-only">{data.definitions.buckets}</caption>
          <tbody>
            {p.buckets.map((b, index) => (
              <tr key={b.key} className="border-t border-edge">
                <td className="w-5 py-1.5">
                  <span
                    aria-hidden
                    className={`block size-2 rounded-[2px] ${BUCKET_COLOR[index] ?? 'bg-danger-600'}`}
                  />
                </td>
                <td className="py-1.5 whitespace-nowrap">{b.label}</td>
                <td className="py-1.5 text-right text-muted">{b.count.toLocaleString('es-DO')}</td>
                <td className="py-1.5 text-right font-medium whitespace-nowrap">
                  {rd(b.principal)}
                </td>
                <td className="py-1.5 text-right text-muted whitespace-nowrap">
                  {pct(share(b), 1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

/** P10 · indicators (decision 086): the same figures as the reports. The
 * day's collection lives in the welcome card above, not here twice. */
function Indicators({ data, scope }: { data: Dashboard; scope?: string }) {
  const ind = data.indicators
  if (!ind) return null
  const defs = data.definitions
  const p = ind.portfolio
  const promises = ind.promises_month
  const resolved = promises.kept + promises.broken
  const diffs = ind.cash_differences_month
  const month = MONTHS[Number(data.date.slice(5, 7)) - 1]
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
      <Section title="Cartera y cobros" aside={`${month} · ${(scope ?? data.scope).toLowerCase()}`}>
        <Grid>
          <Kpi
            label="Cartera activa"
            value={rd(p.principal)}
            hint={plural(p.count, 'préstamo')}
            help={defs.portfolio}
            to="/reportes/cartera"
          />
          <Kpi
            label="Cartera en riesgo (PAR30)"
            value={pct(p.par30, 1)}
            hint={`PAR7 ${pct(p.par7, 1)} · PAR90 ${pct(p.par90, 1)}`}
            help={defs.par30}
            tone={Number(p.par30 ?? 0) > 0.1 ? 'bad' : undefined}
          />
          <Kpi
            label="Desembolsado del mes"
            value={rd(ind.disbursed_month.total)}
            hint={plural(ind.disbursed_month.count, 'desembolso')}
            help={defs.disbursed}
          />
          {ind.profit_month ? (
            // Same words as «Resultados»: a loss reads as «Pérdida», by its size.
            <Kpi
              label={
                Number(ind.profit_month.result) < 0 ? 'Pérdida del mes' : 'Ganancia cobrada del mes'
              }
              value={rd(Math.abs(Number(ind.profit_month.result)))}
              hint={`${rd(ind.profit_month.income)} cobrado − ${rd(ind.profit_month.expenses)} de gastos`}
              help={defs.profit}
              to="/reportes/resultados"
              tone={Number(ind.profit_month.result) < 0 ? 'bad' : undefined}
            />
          ) : null}
          <Kpi
            label="Promesas cumplidas"
            value={pct(promises.rate, 0)}
            hint={resolved ? `${promises.kept} de ${resolved} resueltas` : 'Ninguna resuelta aún'}
            help={defs.promises}
            to="/cobranza"
          />
          <Kpi
            label="Diferencias de caja"
            value={rd(diffs.total)}
            hint={
              diffs.count
                ? `Faltantes ${rd(diffs.shortage)} · sobrantes ${rd(diffs.overage)}`
                : 'Ninguna: la meta es cero'
            }
            help={defs.cash_differences}
            tone={Number(diffs.total) ? 'bad' : 'good'}
          />
        </Grid>
      </Section>
      <Buckets data={data} />
    </div>
  )
}

/** «Operación de hoy» (decision 115): one card split in four. */
function Operations({ data }: { data: Dashboard }) {
  const ops = data.operations
  if (!ops) return null
  const cells: {
    to: string
    label: string
    value: string
    hint: string
    icon: ReactNode
    bad?: boolean
  }[] = [
    {
      to: '/rutas',
      label: 'Rutas en la calle',
      value: `${ops.routes_open} de ${ops.routes_total}`,
      hint: ops.routes_total
        ? plural(ops.routes_total - ops.routes_open, 'ya rendida', 'ya rendidas')
        : 'Ninguna ruta abierta hoy',
      icon: <RouteIcon />,
    },
    {
      to: '/rutas',
      label: 'Visitas de las rutas',
      value: `${ops.stops.visited} de ${ops.stops.total}`,
      hint: `${ops.stops.paid} con pago`,
      icon: <CheckCircleIcon className="size-5 shrink-0" />,
    },
    {
      to: '/cajas',
      label: 'Cajas abiertas',
      value: String(ops.open_cash_sessions),
      hint: ops.open_cash_sessions ? 'Cobrando y desembolsando' : 'Ninguna abierta',
      icon: <DrawerIcon />,
    },
  ]
  if (ops.fraud_alerts_open !== null)
    cells.push({
      to: '/ajustes/alertas',
      label: 'Alertas antifraude',
      value: String(ops.fraud_alerts_open),
      hint: ops.fraud_alerts_open ? 'Por revisar' : 'Nada por revisar',
      icon: <ShieldIcon />,
      bad: ops.fraud_alerts_open > 0,
    })
  return (
    <Section title="Operación de hoy">
      <div
        className={`grid grid-cols-2 overflow-hidden rounded-xl border border-edge bg-surface shadow-sm ${
          cells.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
        }`}
      >
        {cells.map((cell, index) => (
          <Link
            key={cell.label}
            to={cell.to}
            className={`flex min-w-0 items-center gap-3.5 px-4 py-4 outline-none transition-colors hover:bg-brand-50/60 focus-visible:bg-brand-50 sm:px-5 ${
              index % 2 ? 'border-l border-edge' : ''
            } ${index > 1 ? 'border-t border-edge lg:border-t-0' : ''} ${
              index === 2 ? 'lg:border-l' : ''
            }`}
          >
            <span
              aria-hidden
              className={`hidden size-9 shrink-0 place-items-center rounded-[10px] sm:grid ${
                cell.bad ? WELL.bad : WELL.go
              }`}
            >
              {cell.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] text-muted">{cell.label}</span>
              <span className="block font-display text-[19px] font-semibold tracking-[-0.015em]">
                {cell.value}
              </span>
              <span className="block truncate text-[12px] text-muted">{cell.hint}</span>
            </span>
          </Link>
        ))}
      </div>
    </Section>
  )
}

function Books({ data }: { data: Dashboard }) {
  const books = data.books
  if (!books) return null
  const pending = books.reconciliations_pending
  return (
    <Section title="Dinero y obligaciones">
      <Grid>
        {books.accounts.map((account) => (
          <Kpi
            key={account.id}
            label={account.name}
            value={rd(account.balance)}
            hint={account.kind === 'bank' ? 'Banco' : 'Caja'}
            to="/cuentas"
          />
        ))}
        <Kpi
          label="Cuentas por pagar (7 días)"
          value={rd(books.payables_due.total)}
          hint={`${books.payables_due.count} por pagar · ${plural(books.payables_due.overdue, 'vencida')}`}
          to="/cuentas-por-pagar"
          tone={books.payables_due.overdue ? 'bad' : undefined}
        />
        <Kpi
          label={`Conciliaciones de ${pending.month.slice(5)}/${pending.month.slice(0, 4)}`}
          value={pending.accounts.length ? plural(pending.accounts.length, 'pendiente') : 'Al día'}
          hint={pending.accounts.join(', ') || 'Todos los bancos conciliados'}
          to="/contabilidad"
          tone={pending.accounts.length ? 'bad' : 'good'}
        />
      </Grid>
    </Section>
  )
}

function Officer({ data }: { data: Dashboard }) {
  const officer = data.officer
  if (!officer) return null
  return (
    <Section title="Mi cartera">
      <Grid>
        {officer.applications.map((row) => (
          <Kpi
            key={row.status}
            label={`Solicitudes: ${row.label.toLowerCase()}`}
            value={String(row.count)}
            to="/solicitudes"
          />
        ))}
        <Kpi
          label="Vencen en 3 días"
          value={String(officer.due_soon)}
          hint="Préstamos que originaste"
          to="/prestamos"
        />
        <Kpi
          label="En atraso"
          value={String(officer.in_arrears)}
          hint="Préstamos que originaste"
          to="/atrasos"
          tone={officer.in_arrears ? 'bad' : undefined}
        />
      </Grid>
    </Section>
  )
}

/** The board's data, shared by the welcome card and the sections below so
 * both read the same figures. The branch comes from the top bar (decision 115). */
function useBoard(me: Me) {
  const [scope] = useBranchScope()
  const wide = hasRole(me, ACCESS.allBranches)
  const branches = useQuery({ queryKey: ['branches'], queryFn: listBranches, enabled: wide })
  const list = branches.data?.results ?? []
  // A branch kept from another session that no longer exists reads as «all».
  const branch = list.some((b) => b.id === scope) ? scope : ''
  const board = useQuery({
    queryKey: ['dashboard', branch],
    queryFn: () => getDashboard(branch || undefined),
    refetchInterval: 60_000,
    // Wait for the list before narrowing, so a stale branch never asks.
    enabled: !wide || !scope || branches.isFetched,
  })
  const several = wide && list.length > 1
  return { board, several }
}

function Board({ state }: { state: ReturnType<typeof useBoard> }) {
  const { board, several } = state
  const data = board.data
  if (board.isError && !data) return <LoadError error={board.error} />
  if (!data || !(data.indicators || data.operations || data.books || data.officer)) return null
  return (
    <>
      <Indicators data={data} scope={several ? undefined : data.scope} />
      <Operations data={data} />
      <Books data={data} />
      <Officer data={data} />
    </>
  )
}

function greeting(hour: number) {
  if (hour < 12) return 'Buenos días'
  if (hour < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

type Origin = NonNullable<Dashboard['indicators']>['origins'][number]

const ORIGIN_STATUS: Record<string, { label: string; className: string }> = {
  'route-open': { label: 'En la calle', className: 'bg-info-100 text-info-700' },
  'route-settled': { label: 'Rendida', className: 'bg-brand-100 text-brand-800' },
  'route-closed': { label: 'Sin abrir', className: 'bg-surface-2 text-muted' },
  'office-open': { label: 'Abierta', className: 'bg-surface-2 text-muted' },
  'office-closed': { label: 'Cerrada', className: 'bg-surface-2 text-muted' },
}

/** «Por origen» (decision 115): each route and the office, with a short bar
 * and «cobrado / esperado». */
function Origins({ origins }: { origins: Origin[] }) {
  const routes = origins.filter((o) => o.kind === 'route')
  const office = origins.filter((o) => o.kind === 'office')
  const shown = [...routes.slice(0, 5), ...office]
  const more = routes.length - 5
  return (
    <div className="flex min-w-0 flex-col gap-1 px-5 pb-5 pt-4 sm:px-7 sm:pb-[22px] sm:pt-5">
      <div className="eyebrow mb-1.5">Por origen</div>
      <ul className="flex flex-col">
        {shown.map((o, index) => {
          const chip = ORIGIN_STATUS[`${o.kind}-${o.status}`]
          const expected = Number(o.expected)
          const ratio = expected > 0 ? Math.min(Number(o.collected) / expected, 1) : 0
          return (
            <li
              key={o.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1.5 py-[7px] sm:grid-cols-[minmax(0,1fr)_96px_auto]"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="truncate text-[13.5px] font-semibold">{o.name}</span>
                {chip ? (
                  <span
                    className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip.className}`}
                  >
                    {chip.label}
                  </span>
                ) : null}
              </span>
              <span
                aria-hidden
                className="order-last col-span-2 h-[5px] overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-edge sm:order-none sm:col-span-1"
              >
                <span
                  className="block h-full origin-left animate-grow-x rounded-full bg-brand-700"
                  style={{ width: `${ratio * 100}%`, animationDelay: `${350 + index * 60}ms` }}
                />
              </span>
              <span className="text-right text-[13px] whitespace-nowrap">
                <strong className="font-semibold">{whole(o.collected)}</strong>{' '}
                <span className="text-muted">/ {whole(o.expected)}</span>
              </span>
            </li>
          )
        })}
      </ul>
      {more > 0 ? (
        <Link
          to="/rutas"
          className="mt-1 self-start text-[12.5px] font-semibold text-brand-700 hover:underline"
        >
          Ver las otras {more} rutas →
        </Link>
      ) : null}
    </div>
  )
}

/** «Cobrado hoy · en vivo»: the figure of the day in Sora 60, counting up to
 * its value, with the bar against what fell due (decision 115). */
function DayFigure({
  today,
  definitions,
}: {
  today: { collected: string; expected: string; recovery: string | null }
  definitions?: Dashboard['definitions']
}) {
  const expected = Number(today.expected)
  const collected = Number(today.collected)
  const counted = useCountUp(collected)
  const ratio = expected > 0 ? Math.min(collected / expected, 1) : collected > 0 ? 1 : 0
  const [units, cents = '00'] = rd(counted).replace('RD$ ', '').split('.')
  const missing = Math.max(expected - collected, 0)
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-2 text-[13px] font-medium text-muted">
        <span aria-hidden className="size-[7px] shrink-0 animate-live rounded-full bg-brand-700" />
        <span>
          Cobrado hoy<span className="hidden sm:inline"> · en vivo</span>
        </span>
      </div>
      <div
        className="flex items-baseline gap-1.5 font-display tracking-[-0.035em] sm:gap-2"
        title={
          definitions ? `${definitions.collected} Esperado: ${definitions.expected}` : undefined
        }
      >
        <span className="sr-only">{rd(collected)}</span>
        <span aria-hidden className="text-[17px] font-semibold text-muted sm:text-[22px]">
          RD$
        </span>
        <span
          aria-hidden
          className="text-[42px] leading-[1.05] font-bold tabular-nums sm:text-[52px] xl:text-[60px]"
        >
          {units}
        </span>
        <span aria-hidden className="text-lg font-semibold text-muted sm:text-2xl">
          .{cents}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Cobrado hoy frente a lo esperado"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        className="mt-2 h-[7px] overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-edge sm:mt-3 sm:h-2"
      >
        <div
          className="h-full origin-left animate-grow-x rounded-full bg-brand-700"
          style={{ width: `${ratio * 100}%`, animationDelay: '200ms' }}
        />
      </div>
      <div className="mt-1 flex flex-wrap justify-between gap-x-4 text-[12px] text-muted sm:text-[13px]">
        {expected > 0 ? (
          <>
            <span>
              de <strong className="font-semibold text-ink">{rd(today.expected)}</strong> esperado ·{' '}
              {pct(today.recovery, 0)}
            </span>
            <span>{missing > 0 ? `Faltan ${rd(missing)}` : 'Meta del día cumplida'}</span>
          </>
        ) : (
          <span>Hoy no vencía ninguna cuota</span>
        )}
      </div>
    </div>
  )
}

/** The welcome card (decisions 111 and 114): the brand texture, the date, a
 * greeting with presence, the trial as a gold chip, the actions and, for who
 * reads the indicators, the figure of the day beside where it came from. On a
 * phone the greeting stands on the sand and the figure gets its own card. */
function Welcome({
  me,
  now,
  indicators,
  definitions,
  trialDaysLeft,
}: {
  me: Me
  now: Date
  indicators?: Dashboard['indicators']
  definitions?: Dashboard['definitions']
  trialDaysLeft?: number
}) {
  const date = now.toLocaleDateString('es-DO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const originator = hasRole(me, ACCESS.originate)
  const simulates = hasRole(me, ACCESS.simulate)
  const today = indicators?.today
  const actions = (phone: boolean) =>
    originator || simulates ? (
      <div
        className={
          phone
            ? 'grid grid-cols-2 gap-2 sm:hidden [&>a]:h-[46px] [&>a]:rounded-xl'
            : 'hidden shrink-0 gap-2 sm:flex'
        }
      >
        {phone && originator ? (
          <Link to="/solicitudes/nueva" className={buttonClass()}>
            <PlusIcon />
            Nueva solicitud
          </Link>
        ) : null}
        {simulates ? (
          <Link to="/simulador" className={buttonClass('secondary')}>
            <CalculatorIcon className="size-[18px] shrink-0" />
            Simular
          </Link>
        ) : null}
        {!phone && originator ? (
          <Link to="/solicitudes/nueva" className={buttonClass()}>
            <PlusIcon />
            Nueva solicitud
          </Link>
        ) : null}
      </div>
    ) : null
  return (
    <>
      <section
        aria-label="Hoy"
        className="relative flex flex-col gap-4 sm:gap-0 sm:overflow-hidden sm:rounded-[18px] sm:border sm:border-edge sm:bg-surface sm:shadow-sm"
      >
        <div aria-hidden className="absolute inset-0 hidden sm:block">
          <Texture tone="sand" />
        </div>
        <div className="relative flex flex-wrap items-end justify-between gap-x-6 gap-y-4 sm:px-8 sm:pb-[26px] sm:pt-7">
          <div className="flex min-w-0 flex-col gap-2 sm:gap-2.5">
            <p className="eyebrow flex items-center gap-2">
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-gold-500" />
              <span className="first-letter:uppercase">{date}</span>
            </p>
            <h1 className="text-[25px] leading-[1.1] sm:text-[34px]">
              {greeting(now.getHours())}
              {me.first_name ? `, ${me.first_name}` : ''}
            </h1>
            {trialDaysLeft !== undefined ? (
              <p
                role="status"
                className="inline-flex flex-wrap items-center gap-x-2.5 self-start rounded-full bg-gold-100 py-[5px] pl-3 pr-3.5 text-[12px] font-medium text-gold-800 ring-1 ring-inset ring-gold-500/30 sm:text-[12.5px]"
              >
                <span>
                  Te quedan <strong>{plural(trialDaysLeft, 'día')}</strong> de prueba
                  <span className="hidden sm:inline"> gratis</span>.
                </span>
                {me.is_manager ? (
                  <Link
                    to="/ajustes/suscripcion"
                    className="font-semibold underline-offset-2 hover:underline"
                  >
                    <span className="sm:hidden">Ver →</span>
                    <span className="hidden sm:inline">Ver la suscripción →</span>
                  </Link>
                ) : null}
              </p>
            ) : null}
          </div>
          {actions(false)}
        </div>
        {today ? (
          <div className="relative grid overflow-hidden rounded-[18px] border border-edge bg-surface shadow-sm sm:rounded-none sm:border-0 sm:border-t sm:shadow-none md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <div aria-hidden className="absolute inset-0 sm:hidden">
              <Texture tone="sand" />
            </div>
            <div className="relative px-[18px] pb-4 pt-[18px] sm:px-8 sm:pb-7 sm:pt-6 md:border-r md:border-edge">
              <DayFigure today={today} definitions={definitions} />
            </div>
            {indicators?.origins?.length ? (
              <div className="relative border-t border-edge md:border-t-0">
                <Origins origins={indicators.origins} />
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
      {actions(true)}
    </>
  )
}

export function DashboardPage({ me }: { me: Me }) {
  const company = useQuery({ queryKey: ['my-company'], queryFn: getMyCompany })
  const data = company.data
  const [now] = useState(() => new Date())
  const state = useBoard(me)

  return (
    <div className="flex flex-col gap-6 sm:gap-7">
      <Welcome
        me={me}
        now={now}
        indicators={state.board.data?.indicators}
        definitions={state.board.data?.definitions}
        trialDaysLeft={
          data?.status === 'trial' && typeof data.trial_days_left === 'number'
            ? data.trial_days_left
            : undefined
        }
      />
      {data?.status === 'suspended' ? (
        <Alert tone="warning">
          {data.status_reason || 'La empresa está suspendida: puedes consultar, pero no registrar.'}
        </Alert>
      ) : null}
      {/* D2 (decision 129): the guide of a new company, for its managers, until done. */}
      {me.is_manager && me.company_id ? <FirstStepsCard companyId={me.company_id} /> : null}

      <Today me={me} />
      <Board state={state} />
    </div>
  )
}
