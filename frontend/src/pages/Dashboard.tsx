import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'

import { listBranches, type Me } from '../api/accounts'
import { getMyCash } from '../api/cash'
import { listApplications, listLoans } from '../api/origination'
import { getMyCompany } from '../api/platform'
import { type Dashboard, getDashboard } from '../api/reports'
import { Kpi } from '../components/Kpi'
import { Alert, Field, Select } from '../components/ui'
import { buttonClass } from '../components/classes'
import { pct, rd } from '../lib/format'
import { ACCESS, hasRole } from '../lib/roles'

function Tile({
  to,
  search,
  label,
  value,
  hint,
}: {
  to: string
  search?: Record<string, string>
  label: string
  value?: string | number
  hint: string
}) {
  return (
    <Link
      to={to}
      search={search}
      className="block rounded-xl border border-edge bg-surface p-4 shadow-sm outline-none transition-colors hover:border-brand-700/50 focus-visible:ring-2 focus-visible:ring-accent-500"
    >
      <div className="text-[12.5px] text-muted">{label}</div>
      <div className="font-display text-2xl font-bold tabular-nums text-brand-700">
        {value ?? '…'}
      </div>
      <div className="text-[12px] text-muted">{hint}</div>
    </Link>
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
    <section aria-label="Tu trabajo de hoy" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {decider ? (
        <Tile
          to="/solicitudes"
          search={{ bandeja: 'por_aprobar' }}
          label="Por aprobar"
          value={pending.data?.count}
          hint="Solicitudes que puedes decidir"
        />
      ) : null}
      {originator ? (
        <Tile
          to="/solicitudes"
          search={{ bandeja: 'mias' }}
          label="Mis borradores"
          value={drafts.data?.count}
          hint="Borradores y devueltas"
        />
      ) : null}
      {disburser ? (
        <Tile
          to="/desembolsos"
          label="Por desembolsar"
          value={toDisburse.data?.count}
          hint="Aprobadas y vigentes"
        />
      ) : null}
      {cashier ? (
        <Tile
          to="/caja"
          label="Mi caja"
          value={
            cash.data ? (cash.data.session ? rd(cash.data.session.expected) : 'Cerrada') : undefined
          }
          hint={
            cash.data?.session
              ? `${cash.data.session.number} · ${cash.data.routes_to_settle.length} rendición(es) por recibir`
              : 'Ábrela para cobrar y desembolsar en efectivo'
          }
        />
      ) : null}
      {supervisor ? (
        <Tile
          to="/avisos"
          label="Por autorizar"
          value={me.pending_approvals ?? 0}
          hint="Reversos, condonaciones y descuentos"
        />
      ) : null}
      {hasRole(me, ACCESS.cashSessions) && supervisor ? (
        <Tile
          to="/cajas"
          label="Cierres por aprobar"
          value={me.closings_to_approve ?? 0}
          hint="Cajas cerradas que esperan tu visto bueno"
        />
      ) : null}
      {hasRole(me, ACCESS.manageCollections) ? (
        <Tile
          to="/cobranza"
          label="Agenda de hoy"
          value={me.agenda_today ?? 0}
          hint="Promesas que vencen y seguimientos pendientes"
        />
      ) : null}
      {watchesArrears ? (
        <Tile
          to="/atrasos"
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
          value={loans.data?.count}
          hint={
            loans.data
              ? `${rd(loans.data.totals.principal_outstanding)} de capital`
              : 'Cartera de tu alcance'
          }
        />
      )}
    </section>
  )
}

const ALL_BRANCHES = ['Gerente', 'Contabilidad', 'Auditoría']

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-2">
      <h2 className="text-sm font-semibold text-muted">{title}</h2>
      {children}
    </section>
  )
}

/** P10 · indicators (decision 086): the same figures as the reports. */
function Indicators({ data }: { data: Dashboard }) {
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
      <Section title="Cartera y cobros">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label="Cartera activa"
            value={rd(p.principal)}
            hint={`${p.count} préstamo(s)`}
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
            hint={`de ${rd(ind.today.expected)} esperado · ${pct(ind.today.recovery, 0)}`}
            help={`${defs.collected} Esperado: ${defs.expected}`}
          />
          <Kpi
            label="Desembolsado del mes"
            value={rd(ind.disbursed_month.total)}
            hint={`${ind.disbursed_month.count} desembolso(s)`}
            help={defs.disbursed}
          />
          {ind.profit_month ? (
            <Kpi
              label="Ganancia cobrada del mes"
              value={rd(ind.profit_month.result)}
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
        </div>
      </Section>
      <Section title="Mora por tramos">
        <div className="rounded-xl border border-edge bg-surface p-4 shadow-sm">
          <p className="mb-3 text-[12px] text-muted">{defs.buckets}</p>
          <ul className="space-y-2">
            {p.buckets.map((b) => (
              <li key={b.key} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3">
                <span className="text-[13px]">{b.label}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-surface-2">
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
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
          hint="Abiertas de las de hoy"
          to="/rutas"
        />
        <Kpi
          label="Visitas de las rutas"
          value={`${ops.stops.visited} de ${ops.stops.total}`}
          hint={`${ops.stops.paid} con pago`}
          to="/rutas"
        />
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
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
          hint={`${books.payables_due.count} por pagar · ${books.payables_due.overdue} vencida(s)`}
          to="/cuentas-por-pagar"
          tone={books.payables_due.overdue ? 'bad' : undefined}
        />
        <Kpi
          label={`Conciliaciones de ${pending.month.slice(5)}/${pending.month.slice(0, 4)}`}
          value={pending.accounts.length ? `${pending.accounts.length} pendiente(s)` : 'Al día'}
          hint={pending.accounts.join(', ') || 'Todos los bancos conciliados'}
          to="/contabilidad"
          tone={pending.accounts.length ? 'bad' : 'good'}
        />
      </div>
    </Section>
  )
}

function Officer({ data }: { data: Dashboard }) {
  const officer = data.officer
  if (!officer) return null
  return (
    <Section title="Mi cartera">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
      </div>
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
  if (!data || !(data.indicators || data.operations || data.books || data.officer)) return null
  return (
    <div className="space-y-5">
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
      ) : data.indicators ? (
        <p className="text-[12.5px] text-muted">Alcance: {data.scope}</p>
      ) : null}
      <Indicators data={data} />
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
          <h1 className="text-2xl font-semibold">
            {greeting(now.getHours())}
            {me.first_name ? `, ${me.first_name}` : ''}
          </h1>
          <p className="text-sm text-muted first-letter:uppercase">{today}</p>
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
        <Alert tone="info">
          Te quedan <strong>{data.trial_days_left} días</strong> de prueba gratis.
          {me.is_manager ? (
            <>
              {' '}
              <Link to="/ajustes/suscripcion" className="font-semibold underline">
                Ver la suscripción
              </Link>
            </>
          ) : null}
        </Alert>
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
