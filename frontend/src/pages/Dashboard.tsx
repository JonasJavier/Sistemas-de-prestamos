import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import type { Me } from '../api/accounts'
import { getMyCash } from '../api/cash'
import { listApplications, listLoans } from '../api/origination'
import { getMyCompany } from '../api/platform'
import { Alert } from '../components/ui'
import { buttonClass } from '../components/classes'
import { rd } from '../lib/format'
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

/** Minimal P10 until phase 7: what is waiting for this role today. */
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
  const loans = useQuery({
    queryKey: ['loans', 'active', '', 1],
    queryFn: () => listLoans({ status: 'active' }),
    enabled: reader,
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
    </section>
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
    </>
  )
}
