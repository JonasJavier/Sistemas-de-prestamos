import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'

import type { Me } from '../api/accounts'
import { listApplications } from '../api/origination'
import {
  Badge,
  EmptyState,
  PageHeader,
  Pagination,
  rowLinkClass,
  RowList,
  SearchInput,
  Spinner,
  Tabs,
} from '../components/ui'
import { buttonClass } from '../components/classes'
import { APPLICATION_STATUS, dateOf, day, installmentsText, rd } from '../lib/format'
import type { ApplicationsSearch, ApplicationTab } from '../lib/applications'
import { useDebounced } from '../lib/hooks'
import { ACCESS, hasRole } from '../lib/roles'

const TAB_FILTERS: Record<ApplicationTab, { bandeja?: string; status?: string }> = {
  por_aprobar: { bandeja: 'por_aprobar' },
  mias: { bandeja: 'mias' },
  in_review: { status: 'in_review' },
  por_desembolsar: { bandeja: 'por_desembolsar' },
  rejected: { status: 'rejected' },
  todas: {},
}

const EMPTY_TEXT: Partial<Record<ApplicationTab, string>> = {
  por_aprobar: 'No tienes solicitudes por aprobar.',
  mias: 'No tienes borradores ni solicitudes devueltas.',
  por_desembolsar: 'No hay solicitudes aprobadas esperando desembolso.',
}

/** P26: the officer's drafts, the approver's tray, and everything else. */
export function ApplicationsPage({ me }: { me: Me }) {
  const decider = hasRole(me, ACCESS.decide)
  const originator = hasRole(me, ACCESS.originate)
  const tabs = [
    ...(decider ? ([['por_aprobar', 'Por aprobar']] as const) : []),
    ...(originator ? ([['mias', 'Mis borradores']] as const) : []),
    ['in_review', 'En evaluación'],
    ['por_desembolsar', 'Aprobadas por desembolsar'],
    ['rejected', 'Rechazadas'],
    ['todas', 'Todas'],
  ] as const
  const search: ApplicationsSearch = useSearch({ from: '/app/solicitudes' })
  const navigate = useNavigate({ from: '/solicitudes' })
  const tab: ApplicationTab =
    search.bandeja && tabs.some(([key]) => key === search.bandeja) ? search.bandeja : tabs[0][0]
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const term = useDebounced(q.trim(), 300)
  const query = useQuery({
    queryKey: ['applications', tab, term, page],
    queryFn: () => listApplications({ ...TAB_FILTERS[tab], q: term, page }),
    placeholderData: keepPreviousData,
  })
  const rows = query.data?.results ?? []

  return (
    <>
      <PageHeader
        title="Solicitudes"
        subtitle="Del simulador a la aprobación: nadie aprueba lo que creó."
        actions={
          originator ? (
            <Link to="/solicitudes/nueva" className={buttonClass()}>
              Nueva solicitud
            </Link>
          ) : null
        }
      />
      <Tabs
        tabs={tabs}
        value={tab}
        onChange={(next) => {
          setPage(1)
          void navigate({ search: { bandeja: next }, replace: true })
        }}
      />
      <SearchInput
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setPage(1)
        }}
        placeholder="Buscar por número, cliente o cédula…"
      />
      {query.isPending ? (
        <Spinner />
      ) : rows.length > 0 ? (
        <>
          <RowList>
            {rows.map((app) => {
              const status = APPLICATION_STATUS[app.status]
              return (
                <li key={app.id}>
                  <Link to="/solicitudes/$id" params={{ id: app.id }} className={rowLinkClass}>
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
                        por {app.created_by_name}
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
                          : dateOf(app.created_at)}
                      </div>
                    </div>
                  </Link>
                </li>
              )
            })}
          </RowList>
          <Pagination page={page} count={query.data?.count ?? 0} onChange={setPage} />
        </>
      ) : (
        <EmptyState
          action={
            originator && !term ? (
              <Link
                to="/solicitudes/nueva"
                className="font-semibold text-brand-700 hover:underline"
              >
                Crear solicitud
              </Link>
            ) : null
          }
        >
          {term
            ? `Ninguna solicitud coincide con «${term}».`
            : (EMPTY_TEXT[tab] ?? 'Aún no hay solicitudes aquí.')}
        </EmptyState>
      )}
    </>
  )
}
