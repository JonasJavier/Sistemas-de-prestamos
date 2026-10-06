import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import type { Me } from '../api/accounts'
import { listApplications } from '../api/origination'
import { Badge, Card, EmptyState, Input, PageHeader, Spinner, Tabs } from '../components/ui'
import { APPLICATION_STATUS, day, installmentsText, rd } from '../lib/format'
import { hasRole, useDebounced } from '../lib/hooks'

type TabKey = 'por_aprobar' | 'mias' | 'in_review' | 'por_desembolsar' | 'rejected' | 'todas'

const TAB_FILTERS: Record<TabKey, { bandeja?: string; status?: string }> = {
  por_aprobar: { bandeja: 'por_aprobar' },
  mias: { bandeja: 'mias' },
  in_review: { status: 'in_review' },
  por_desembolsar: { bandeja: 'por_desembolsar' },
  rejected: { status: 'rejected' },
  todas: {},
}

/** P26: the officer's drafts, the approver's tray, and everything else. */
export function ApplicationsPage({ me }: { me: Me }) {
  const decider = hasRole(me, 'Gerente', 'Supervisor')
  const originator = hasRole(me, 'Gerente', 'Supervisor', 'Oficial de crédito')
  const tabs = [
    ...(decider ? ([['por_aprobar', 'Por aprobar']] as const) : []),
    ...(originator ? ([['mias', 'Mis borradores']] as const) : []),
    ['in_review', 'En evaluación'],
    ['por_desembolsar', 'Aprobadas por desembolsar'],
    ['rejected', 'Rechazadas'],
    ['todas', 'Todas'],
  ] as const
  const [tab, setTab] = useState<TabKey>(tabs[0][0])
  const [q, setQ] = useState('')
  const term = useDebounced(q.trim(), 300)
  const query = useQuery({
    queryKey: ['applications', tab, term],
    queryFn: () => listApplications({ ...TAB_FILTERS[tab], q: term }),
  })

  return (
    <>
      <PageHeader
        title="Solicitudes"
        subtitle="Del simulador a la aprobación: nadie aprueba lo que creó."
        actions={
          originator ? (
            <Link
              to="/solicitudes/nueva"
              className="inline-flex h-11 items-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 sm:h-9"
            >
              Nueva solicitud
            </Link>
          ) : null
        }
      />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por número o cliente…"
      />
      {query.isPending ? (
        <Spinner />
      ) : query.data && query.data.results.length > 0 ? (
        <Card className="!p-0">
          <ul className="divide-y divide-edge">
            {query.data.results.map((app) => {
              const status = APPLICATION_STATUS[app.status]
              return (
                <li key={app.id}>
                  <Link
                    to="/solicitudes/$id"
                    params={{ id: app.id }}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-surface-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold tabular-nums">{app.number}</span>
                        <Badge tone={status?.tone}>{status?.label ?? app.status}</Badge>
                      </div>
                      <div className="truncate text-sm">
                        {app.customer_name}{' '}
                        <span className="text-muted tabular-nums">· {app.customer_document}</span>
                      </div>
                      <div className="text-[12.5px] text-muted">
                        {app.product_name} · {installmentsText(app.installments, app.frequency)} ·
                        por{' '}
                        {app.created_by_name}
                        {app.assigned_approver_name && app.status === 'in_review'
                          ? ` · asignada a ${app.assigned_approver_name}`
                          : ''}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-display font-bold tabular-nums">
                        {rd(app.approved_amount ?? app.amount)}
                      </div>
                      <div className="text-[12.5px] text-muted">
                        {app.status === 'approved' && app.valid_until
                          ? `Vigente hasta ${day(app.valid_until)}`
                          : day(app.created_at)}
                      </div>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
      ) : (
        <EmptyState
          action={
            originator ? (
              <Link to="/solicitudes/nueva" className="font-semibold text-brand-700 hover:underline">
                Crear solicitud
              </Link>
            ) : null
          }
        >
          {tab === 'por_aprobar'
            ? 'No tienes solicitudes por aprobar.'
            : 'Aún no hay solicitudes aquí.'}
        </EmptyState>
      )}
    </>
  )
}
