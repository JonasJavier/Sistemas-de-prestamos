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
  ClockAlertIcon,
  DisburseIcon,
  DrawerIcon,
  LoanIcon,
  ShieldIcon,
  PencilIcon,
  WalletIcon,
} from '../components/icons'
import { Kpi } from '../components/Kpi'
import { Alert, Field, Figure, LoadError, Select } from '../components/ui'
import { buttonClass } from '../components/classes'
import { pct, plural, rd } from '../lib/format'
import { ACCESS, hasRole } from '../lib/roles'

function Tile({
  to,
  search,
  label,
  value,
  hint,
  icon,
}: {
  to: string
  search?: Record<string, string>
  label: string
  value?: string | number
  hint: string
  icon: ReactNode
}) {
  // Something waiting reads in green; an empty queue stays quiet.
  const waiting = typeof value === 'string' || (typeof value === 'number' && value > 0)
  return (
    <Link
      to={to}
      search={search}
      className="group @container flex min-w-0 flex-col rounded-xl border border-edge bg-surface p-4 shadow-sm outline-none transition-[border-color,box-shadow] hover:border-brand-700/35 hover:shadow-md focus-visible:ring-2 focus-visible:ring-accent-500"
    >
      {/* A narrow card (two per row on a phone) puts the icon above the label. */}
      <div className="flex flex-col items-start gap-2 @min-[12rem]:flex-row @min-[12rem]:items-center @min-[12rem]:gap-2.5">
        <span
          aria-hidden
          className={`grid size-8 shrink-0 place-items-center rounded-lg transition-colors ${
            waiting ? 'bg-brand-50 text-brand-700' : 'bg-surface-2 text-muted'
          }`}
        >
          {icon}
        </span>
        <span className="min-w-0 text-[13px] font-medium text-muted">{label}</span>
        <span
          aria-hidden
          className="ml-auto hidden text-muted opacity-0 transition-opacity group-hover:opacity-100 @min-[12rem]:block"
        >
          <ArrowRightIcon />
        </span>
      </div>
      {/* An amount keeps one line and follows the card's width, as in Kpi. */}
      <div
        className={`mt-2 whitespace-nowrap font-display @min-[12rem]:mt-3 font-semibold tracking-tight tabular-nums ${
          waiting ? 'text-ink' : 'text-muted'
        } ${
          typeof value === 'string' && value.includes('RD$')
            ? 'text-base @min-[11rem]:text-xl @min-[14rem]:text-2xl'
            : 'text-2xl'
        }`}
      >
        <Figure value={value ?? '…'} />
      </div>
      <div className="mt-0.5 text-[12px] text-muted">{hint}</div>
    </Link>
  )
}

const tileIcon = 'size-[18px] shrink-0'

/** Rows that come out even: 5 or 6 cards go in threes, not 4 + a lonely 2. */
function Grid({ label, children }: { label?: string; children: ReactNode }) {
  const count = Children.toArray(children).length
  const columns =
    count === 3 || count === 5 || count === 6
      ? 'lg:grid-cols-3'
      : count >= 4
        ? 'lg:grid-cols-4'
        : 'sm:grid-cols-2'
  return (
    <section aria-label={label} className={`grid grid-cols-2 gap-3 ${columns}`}>
      {children}
    </section>
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
  const drafts = useQuery({
    queryKey: ['applications', 'mias', '', 1],
    queryFn: () => listApplications({ bandeja: 'mias' }),
    enabled: originator,
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
  const watchesArrears = hasRole(me, ACCESS.delinquency) && !board
  const cash = useQuery({ queryKey: ['my-cash'], queryFn: getMyCash, enabled: cashier })
  const arrears = useQuery({
    queryKey: ['loans', 'active', 'atraso'],
    queryFn: () => listLoans({ status: 'active', tramo: 'atraso' }),
    enabled: watchesArrears,
  })
  if (!reader) return null
  return (
    <Grid label="Tu trabajo de hoy">
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
      {originator ? (
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
            cash.data ? (cash.data.session ? rd(cash.data.session.expected) : 'Cerrada') : undefined
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
          hint="Cajas cerradas que esperan tu visto bueno"
        />
      ) : null}
      {hasRole(me, ACCESS.manageCollections) ? (
        <Tile
          to="/cobranza"
          label="Agenda de hoy"
          icon={<AgendaIcon className={tileIcon} />}
          value={me.agenda_today ?? 0}
          hint="Promesas que vencen y seguimientos pendientes"
        />
      ) : null}
      {watchesArrears ? (
        <Tile
          to="/atrasos"
          icon={<ClockAlertIcon className={tileIcon} />}
          label="En atraso"
          value={arrears.data?.count}
          hint={
            arrears.data
              ? `${rd(arrears.data.totals.principal_outstanding)} de capital en riesgo`
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
              ? `${rd(loans.data.totals.principal_outstanding)} de capital`
              : 'Cartera de tu alcance'
          }
        />
      )}
    </Grid>
  )
}

const ALL_BRANCHES = ['Gerente', 'Contabilidad', 'Auditoría']

function Section({
  title,
  aside,
  children,
}: {
  title: string
  /** A quiet note at the right of the title (the scope of the figures). */
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-label={title} className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {aside ? <span className="text-[12.5px] text-muted">{aside}</span> : null}
      </div>
      {children}
    </section>
  )
}

/** P10 · indicators (decision 086): the same figures as the reports. */
function Indicators({ data, scope }: { data: Dashboard; scope?: string }) {
  const ind = data.indicators
  if (!ind) return null
  const defs = data.definitions
  const p = ind.portfolio
  const promises = ind.promises_month
  const resolved = promises.kept + promises.broken
  const diffs = ind.cash_differences_month
  const maxBucket = Math.max(...p.buckets.map((b) => Number(b.principal)), 1)
  return (
    <>
      <Section title="Cartera y cobros" aside={scope ? `Alcance: ${scope}` : undefined}>
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
            value={pct(p.par30)}
            hint={`PAR7 ${pct(p.par7)} · PAR90 ${pct(p.par90)}`}
            help={defs.par30}
            tone={Number(p.par30 ?? 0) > 0.1 ? 'bad' : undefined}
          />
          <Kpi
            label="Cobrado hoy"
            value={rd(ind.today.collected)}
            hint={
              Number(ind.today.expected) > 0
                ? `de ${rd(ind.today.expected)} esperado · ${pct(ind.today.recovery, 0)}`
                : 'Hoy no vencía ninguna cuota'
            }
            help={`${defs.collected} Esperado: ${defs.expected}`}
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
            label="Promesas cumplidas del mes"
            value={pct(promises.rate, 0)}
            hint={resolved ? `${promises.kept} de ${resolved} resueltas` : 'Ninguna resuelta aún'}
            help={defs.promises}
            to="/cobranza"
          />
          <Kpi
            label="Diferencias de caja del mes"
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
      <Section title="Mora por tramos">
        <div className="rounded-xl border border-edge bg-surface p-4 shadow-sm sm:p-5">
          <p className="mb-4 text-[12.5px] text-muted">{defs.buckets}</p>
          {/* One grid for every row (subgrid): the bars share the same track
              whatever the width of each row's figures. */}
          <ul className="grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-2">
            {p.buckets.map((b) => (
              <li key={b.key} className="col-span-3 grid grid-cols-subgrid items-center">
                <span className="text-[13px]">{b.label}</span>
                <span className="h-2 overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-edge/60">
                  <span
                    className={`block h-full rounded-full ${b.key === 'al_dia' ? 'bg-brand-700' : 'bg-warning-700'}`}
                    style={{ width: `${(Number(b.principal) / maxBucket) * 100}%` }}
                  />
                </span>
                <span className="text-right text-[13px] tabular-nums">
                  {b.count} · {rd(b.principal)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Section>
    </>
  )
}

function Operations({ data }: { data: Dashboard }) {
  const ops = data.operations
  if (!ops) return null
  return (
    <Section title="Operación de hoy">
      <Grid>
        {ops.fraud_alerts_open !== null ? (
          <Kpi
            label="Alertas antifraude"
            value={String(ops.fraud_alerts_open)}
            hint={ops.fraud_alerts_open ? 'Por revisar' : 'Nada por revisar'}
            to="/ajustes/alertas"
            tone={ops.fraud_alerts_open ? 'bad' : 'good'}
          />
        ) : null}
        <Kpi label="Cajas abiertas" value={String(ops.open_cash_sessions)} to="/cajas" />
        <Kpi
          label="Rutas en la calle"
          value={`${ops.routes_open} de ${ops.routes_total}`}
          hint={
            ops.routes_total
              ? plural(ops.routes_total - ops.routes_open, 'ya rendida', 'ya rendidas')
              : 'Ninguna ruta abierta hoy'
          }
          to="/rutas"
        />
        <Kpi
          label="Visitas de las rutas"
          value={`${ops.stops.visited} de ${ops.stops.total}`}
          hint={`${ops.stops.paid} con pago`}
          to="/rutas"
        />
      </Grid>
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

function Board({ me }: { me: Me }) {
  const [branch, setBranch] = useState('')
  const wide = hasRole(me, ALL_BRANCHES)
  const branches = useQuery({ queryKey: ['branches'], queryFn: listBranches, enabled: wide })
  const board = useQuery({
    queryKey: ['dashboard', branch],
    queryFn: () => getDashboard(branch || undefined),
    refetchInterval: 60_000,
  })
  const data = board.data
  if (board.isError && !data) return <LoadError error={board.error} />
  if (!data || !(data.indicators || data.operations || data.books || data.officer)) return null
  return (
    <div className="space-y-7">
      {wide && (branches.data?.results.length ?? 0) > 1 ? (
        <div className="max-w-xs">
          <Field label="Sucursal">
            <Select value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="">Toda la empresa</option>
              {branches.data?.results.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      ) : null}
      <Indicators
        data={data}
        scope={wide && (branches.data?.results.length ?? 0) > 1 ? undefined : data.scope}
      />
      <Operations data={data} />
      <Books data={data} />
      <Officer data={data} />
    </div>
  )
}

function greeting(hour: number) {
  if (hour < 12) return 'Buenos días'
  if (hour < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

export function DashboardPage({ me }: { me: Me }) {
  const company = useQuery({ queryKey: ['my-company'], queryFn: getMyCompany })
  const data = company.data
  const [now] = useState(() => new Date())
  const today = now.toLocaleDateString('es-DO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const originator = hasRole(me, ACCESS.originate)

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-muted first-letter:uppercase">{today}</p>
          <h1 className="mt-0.5 text-2xl font-semibold sm:text-[1.75rem]">
            {greeting(now.getHours())}
            {me.first_name ? `, ${me.first_name}` : ''}
          </h1>
        </div>
        {originator || hasRole(me, ACCESS.simulate) ? (
          <div className="flex flex-wrap gap-2">
            {hasRole(me, ACCESS.simulate) ? (
              <Link to="/simulador" className={buttonClass('secondary')}>
                Simular
              </Link>
            ) : null}
            {originator ? (
              <Link to="/solicitudes/nueva" className={buttonClass()}>
                Nueva solicitud
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      {data?.status === 'trial' && typeof data.trial_days_left === 'number' ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-gold-500/30 bg-gold-100 px-4 py-2.5 text-sm text-gold-800"
        >
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-gold-500" />
          <span className="flex-1">
            Te quedan <strong>{plural(data.trial_days_left, 'día')}</strong> de prueba gratis.
          </span>
          {me.is_manager ? (
            <Link
              to="/ajustes/suscripcion"
              className="font-semibold underline-offset-2 hover:underline"
            >
              Ver la suscripción →
            </Link>
          ) : null}
        </div>
      ) : null}
      {data?.status === 'suspended' ? (
        <Alert tone="warning">
          {data.status_reason || 'La empresa está suspendida: puedes consultar, pero no registrar.'}
        </Alert>
      ) : null}

      <Today me={me} />
      <Board me={me} />
    </>
  )
}
