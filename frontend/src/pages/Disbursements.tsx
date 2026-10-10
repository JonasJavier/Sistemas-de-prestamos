import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { listApplications } from '../api/origination'
import { Card, EmptyState, PageHeader, Pagination, Spinner } from '../components/ui'
import { day, rd } from '../lib/format'

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
        <Card className="!p-0">
          <ul className="divide-y divide-edge">
            {query.data.results.map((app) => (
              <li key={app.id}>
                <Link
                  to="/desembolsos/$id"
                  params={{ id: app.id }}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-brand-50/60"
                >
                  <div>
                    <div className="font-semibold tabular-nums">{app.number}</div>
                    <div className="text-sm">{app.customer_name}</div>
                    <div className="text-[12.5px] text-muted">{app.product_name}</div>
                  </div>
                  <div className="sm:text-right">
                    <div className="font-display font-bold tabular-nums">
                      {rd(app.approved_amount)}
                    </div>
                    <div className="text-[12.5px] text-muted">
                      Vence la aprobación el {day(app.valid_until)}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState>No hay solicitudes aprobadas esperando desembolso.</EmptyState>
      )}
      <Pagination page={page} count={query.data?.count ?? 0} onChange={setPage} />
    </>
  )
}
