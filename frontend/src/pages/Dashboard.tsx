import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'

import type { Me } from '../api/accounts'
import { listApplications, listLoans } from '../api/origination'
import { getMyCompany, type MyCompany } from '../api/platform'
import { Alert, Card } from '../components/ui'
import { hasRole } from '../lib/hooks'

export const STATUS_BADGES: Record<MyCompany['status'], { text: string; classes: string }> = {
  trial: { text: 'En prueba', classes: 'bg-brand-100 text-brand-800' },
  active: { text: 'Activa', classes: 'bg-success-600/15 text-success-600' },
  suspended: { text: 'Suspendida', classes: 'bg-warning-700/15 text-warning-700' },
  closed: { text: 'Cerrada', classes: 'bg-danger-600/15 text-danger-600' },
}

function Tile({ to, label, count, hint }: { to: string; label: string; count?: number; hint: string }) {
  return (
    <Link
      to={to}
      className="block rounded-xl border border-edge bg-surface p-4 shadow-sm transition-colors hover:border-brand-700/50"
    >
      <div className="text-[12.5px] text-muted">{label}</div>
      <div className="font-display text-2xl font-bold tabular-nums text-brand-700">
        {count ?? '…'}
      </div>
      <div className="text-[12px] text-muted">{hint}</div>
    </Link>
  )
}

/** Minimal P10 until phase 7: what is waiting for this role today. */
function Today({ me }: { me: Me }) {
  const decider = hasRole(me, 'Gerente', 'Supervisor')
  const originator = hasRole(me, 'Gerente', 'Supervisor', 'Oficial de crédito')
  const disburser = hasRole(me, 'Gerente', 'Cajero', 'Contabilidad')
  const reader = hasRole(
    me,
    'Gerente',
    'Supervisor',
    'Oficial de crédito',
    'Cajero',
    'Cobrador',
    'Contabilidad',
    'Auditoría',
  )
  const pending = useQuery({
    queryKey: ['applications', 'por_aprobar', ''],
    queryFn: () => listApplications({ bandeja: 'por_aprobar' }),
    enabled: decider,
  })
  const drafts = useQuery({
    queryKey: ['applications', 'mias', ''],
    queryFn: () => listApplications({ bandeja: 'mias' }),
    enabled: originator,
  })
  const toDisburse = useQuery({
    queryKey: ['applications', 'por_desembolsar'],
    queryFn: () => listApplications({ bandeja: 'por_desembolsar' }),
    enabled: disburser,
  })
  const loans = useQuery({
    queryKey: ['loans', 'active', ''],
    queryFn: () => listLoans({ status: 'active' }),
    enabled: reader,
  })
  if (!reader) return null
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {decider ? (
        <Tile to="/solicitudes" label="Por aprobar" count={pending.data?.count} hint="Solicitudes que puedes decidir" />
      ) : null}
      {originator ? (
        <Tile to="/solicitudes" label="Mis borradores" count={drafts.data?.count} hint="Borradores y devueltas" />
      ) : null}
      {disburser ? (
        <Tile to="/desembolsos" label="Por desembolsar" count={toDisburse.data?.count} hint="Aprobadas y vigentes" />
      ) : null}
      <Tile to="/prestamos" label="Préstamos activos" count={loans.data?.count} hint="Cartera de tu alcance" />
    </div>
  )
}

export function DashboardPage({ me }: { me: Me }) {
  const company = useQuery({ queryKey: ['my-company'], queryFn: getMyCompany })
  const data = company.data
  const badge = data ? STATUS_BADGES[data.status] : null

  return (
    <>
      {data?.status === 'trial' && typeof data.trial_days_left === 'number' ? (
        <Alert tone="info">
          Te quedan <strong>{data.trial_days_left} días</strong> de prueba gratis.
        </Alert>
      ) : null}
      {data?.status === 'suspended' ? (
        <Alert tone="warning">
          {data.status_reason || 'La empresa está suspendida: solo lectura.'}
        </Alert>
      ) : null}

      <Card>
        {company.isPending ? <p className="text-sm text-muted">Cargando…</p> : null}
        {data ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-semibold">{data.trade_name || data.legal_name}</h1>
              {badge ? (
                <span
                  className={`rounded-full px-3 py-1 text-[12.5px] font-medium ${badge.classes}`}
                >
                  {badge.text}
                </span>
              ) : null}
            </div>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted">Plan</dt>
                <dd className="font-medium">{data.subscription?.plan.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted">Pagada hasta</dt>
                <dd className="font-medium tabular-nums">
                  {data.subscription?.paid_until ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted">RNC</dt>
                <dd className="font-medium tabular-nums">{data.rnc || '—'}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </Card>

      <Today me={me} />
    </>
  )
}
