import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { listApplications } from '../api/origination'
import { Badge, EmptyState, PageHeader, Pagination, Spinner, Table } from '../components/ui'
import { tableRowClass } from '../components/classes'
import { plural, rd, todayISO } from '../lib/format'

/** P29: approved, still-valid applications waiting for their money. */
export function DisbursementsPage() {
  const [page, setPage] = useState(1)
  const query = useQuery({
    queryKey: ['applications', 'por_desembolsar', page],
    queryFn: () => listApplications({ bandeja: 'por_desembolsar', page }),
  })
  return (
    <>
      <PageHeader
        title="Por desembolsar"
        subtitle="Solicitudes aprobadas y vigentes. Quien aprobó no puede desembolsar."
      />
      {query.isPending ? (
        <Spinner />
      ) : query.data && query.data.results.length > 0 ? (
        <Table
          label="Por desembolsar"
          columns="minmax(0,0.9fr) minmax(0,1.6fr) minmax(0,1.2fr) minmax(0,1fr) minmax(0,1.1fr)"
          head={[
            { label: 'Solicitud' },
            { label: 'Cliente' },
            { label: 'Producto' },
            { label: 'Aprobado', align: 'right' },
            { label: 'Vigencia' },
          ]}
          footer={
            <>
              <span>{plural(query.data.count, 'solicitud aprobada', 'solicitudes aprobadas')}</span>
              <span className="tabular-nums">
                {rd(
                  query.data.results.reduce(
                    (sum, app) => sum + Number(app.approved_amount ?? 0),
                    0,
                  ),
                )}{' '}
                en esta página
              </span>
            </>
          }
        >
          {query.data.results.map((app, index) => {
            const left = app.valid_until
              ? Math.round(
                  (new Date(`${app.valid_until}T00:00:00`).getTime() -
                    new Date(`${todayISO()}T00:00:00`).getTime()) /
                    86_400_000,
                )
              : null
            return (
              <li
                key={app.id}
                className="animate-reveal"
                style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }}
              >
                <Link to="/desembolsos/$id" params={{ id: app.id }} className={tableRowClass}>
                  <span className="font-semibold tabular-nums">{app.number}</span>
                  <span className="min-w-0 max-md:order-first max-md:basis-full">
                    <span className="block truncate text-[13.5px] font-medium">
                      {app.customer_name}
                    </span>
                  </span>
                  <span className="truncate text-muted max-md:hidden">{app.product_name}</span>
                  <span className="text-right font-display text-[15px] font-semibold tabular-nums">
                    {rd(app.approved_amount)}
                  </span>
                  <span>
                    <Badge tone={left !== null && left <= 3 ? 'warning' : 'neutral'} dot>
                      {left === null
                        ? 'Sin vencimiento'
                        : left <= 0
                          ? 'Vence hoy'
                          : `Vence en ${plural(left, 'día')}`}
                    </Badge>
                  </span>
                </Link>
              </li>
            )
          })}
        </Table>
      ) : (
        <EmptyState>No hay solicitudes aprobadas esperando desembolso.</EmptyState>
      )}
      <Pagination page={page} count={query.data?.count ?? 0} onChange={setPage} />
    </>
  )
}
