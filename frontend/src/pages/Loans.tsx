import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { listLoans } from '../api/origination'
import { Badge, Card, EmptyState, Input, PageHeader, Select, Spinner } from '../components/ui'
import { day, LOAN_STATUS, rd } from '../lib/format'
import { useDebounced } from '../lib/hooks'

/** P31: loans with filters; the totals respect the filters (doc 07 - 5). */
export function LoansPage() {
  const [status, setStatus] = useState('active')
  const [q, setQ] = useState('')
  const term = useDebounced(q.trim(), 300)
  const query = useQuery({
    queryKey: ['loans', status, term],
    queryFn: () => listLoans({ status, q: term }),
  })
  const rows = query.data?.results ?? []
  const outstanding = rows.reduce((sum, loan) => sum + Number(loan.principal_outstanding), 0)

  return (
    <>
      <PageHeader title="Préstamos" subtitle="Cartera de la empresa, por número o cliente." />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_200px]">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por número o cliente…" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          {Object.entries(LOAN_STATUS).map(([key, value]) => (
            <option key={key} value={key}>
              {value.label}
            </option>
          ))}
        </Select>
      </div>
      {query.isPending ? (
        <Spinner />
      ) : rows.length > 0 ? (
        <Card className="!p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-edge text-left text-[12.5px] text-muted">
                  <th className="px-4 py-2">Número</th>
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">Estado</th>
                  <th className="py-2 pr-3 text-right">Capital pendiente</th>
                  <th className="py-2 pr-4 text-right">Próximo vencimiento</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((loan) => {
                  const s = LOAN_STATUS[loan.status]
                  return (
                    <tr key={loan.id} className="border-b border-edge/60 last:border-0 hover:bg-surface-2">
                      <td className="px-4 py-2">
                        <Link
                          to="/prestamos/$numero"
                          params={{ numero: loan.number }}
                          className="font-semibold tabular-nums text-brand-700 hover:underline"
                        >
                          {loan.number}
                        </Link>
                        <div className="text-[12px] text-muted">{loan.product_name}</div>
                      </td>
                      <td className="py-2 pr-3">
                        {loan.customer_name}
                        <div className="text-[12px] text-muted tabular-nums">{loan.customer_document}</div>
                      </td>
                      <td className="py-2 pr-3">
                        <Badge tone={s?.tone}>{s?.label ?? loan.status}</Badge>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{rd(loan.principal_outstanding)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{day(loan.next_due_date)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-brand-700/40 font-semibold">
                  <td className="px-4 py-2" colSpan={3}>
                    {query.data?.count} préstamo{query.data?.count === 1 ? '' : 's'}
                    {query.data && query.data.count > rows.length ? ' (totales de esta página)' : ''}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{rd(outstanding)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      ) : (
        <EmptyState>No hay préstamos con estos filtros.</EmptyState>
      )}
    </>
  )
}
