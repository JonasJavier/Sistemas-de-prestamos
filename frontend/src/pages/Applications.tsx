import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'

import type { Me } from '../api/accounts'
import { listApplications } from '../api/origination'
import { PlusIcon } from '../components/icons'
import {
  Badge,
  EmptyState,
  PageHeader,
  Pagination,
  SearchInput,
  Segmented,
  Spinner,
  Table,
} from '../components/ui'
import { buttonClass, tableRowClass } from '../components/classes'
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
        inline
        actions={
          originator ? (
            <Link
              to="/solicitudes/nueva"
              aria-label="Nueva solicitud"
              className={buttonClass('primary', 'max-sm:size-11 max-sm:px-0')}
            >
              <PlusIcon />
              <span className="hidden sm:inline">Nueva solicitud</span>
            </Link>
          ) : null
        }
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <Segmented
          label="Bandeja"
          value={tab}
          onChange={(next) => {
            setPage(1)
            void navigate({ search: { bandeja: next }, replace: true })
          }}
          options={tabs.map(([value, label]) => ({ value, label }))}
        />
        <div className="hidden flex-1 lg:block" />
        <SearchInput
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(1)
          }}
          placeholder="Buscar por número, cliente o cédula…"
          className="w-full max-sm:order-first sm:w-auto sm:min-w-64 sm:flex-1 lg:max-w-80 lg:flex-none"
        />
      </div>
      {query.isPending ? (
        <Spinner />
      ) : rows.length > 0 ? (
        <>
          <Table
            label="Solicitudes"
            columns="minmax(0,0.9fr) minmax(0,1.5fr) minmax(0,1.4fr) minmax(0,1fr) minmax(0,1.2fr)"
            head={[
              { label: 'Solicitud' },
              { label: 'Cliente' },
              { label: 'Producto y plazo' },
              { label: 'Monto', align: 'right' },
              { label: 'Estado' },
            ]}
          >
            {rows.map((app, index) => {
              const status = APPLICATION_STATUS[app.status]
              return (
                <li
                  key={app.id}
                  className="animate-reveal"
                  style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }}
                >
                  <Link to="/solicitudes/$id" params={{ id: app.id }} className={tableRowClass}>
                    <span className="min-w-0">
                      <span className="block font-semibold tabular-nums">{app.number}</span>
                      <span className="block text-[12px] text-muted">{dateOf(app.created_at)}</span>
                    </span>
                    <span className="min-w-0 max-md:order-first max-md:basis-full">
                      <span className="block truncate text-[13.5px] font-medium">
                        {app.customer_name}
                      </span>
                      <span className="block truncate text-[12px] text-muted tabular-nums">
                        {app.customer_document}
                      </span>
                    </span>
                    <span className="min-w-0 max-md:hidden">
                      <span className="block truncate">{app.product_name}</span>
                      <span className="block truncate text-[12px] text-muted">
                        {installmentsText(app.installments, app.frequency)} · por{' '}
                        {app.created_by_name}
                      </span>
                    </span>
                    <span className="text-right font-display text-[15px] font-semibold tabular-nums">
                      {rd(app.approved_amount ?? app.amount)}
                    </span>
                    <span className="min-w-0">
                      <Badge tone={status?.tone} dot>
                        {status?.label ?? app.status}
                      </Badge>
                      <span className="mt-0.5 block truncate text-[11.5px] text-muted">
                        {app.status === 'approved' && app.valid_until
                          ? `Vigente hasta ${day(app.valid_until)}`
                          : app.assigned_approver_name && app.status === 'in_review'
                            ? `Asignada a ${app.assigned_approver_name}`
                            : ''}
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </Table>
          <Pagination page={page} count={query.data?.count ?? 0} onChange={setPage} />
        </>
      ) : (
        <EmptyState
          action={
            originator && !term ? (
              <Link to="/solicitudes/nueva" className={buttonClass()}>
                <PlusIcon />
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
