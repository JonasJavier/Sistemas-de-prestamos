import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { listPayments, type PaymentRow } from '../api/payments'
import { rd } from '../lib/format'
import { Badge, LoadError, Pagination, Spinner } from './ui'

/** The receipts of a loan, a customer or a cash session, newest first and
 * paged: a daily loan or a busy drawer goes past the 25 rows of a page. */
export function PaymentList({
  filter,
  queryKey,
  describe,
  empty = 'Sin pagos todavía.',
  enabled = true,
}: {
  filter: { loan?: string; customer?: string; cash_session?: string }
  queryKey: readonly unknown[]
  /** The second line of each receipt (loan, method, date, who collected). */
  describe: (payment: PaymentRow) => string
  empty?: string
  enabled?: boolean
}) {
  const [page, setPage] = useState(1)
  const payments = useQuery({
    queryKey: [...queryKey, page],
    queryFn: () => listPayments({ ...filter, page }),
    enabled,
  })
  if (payments.isPending) return <Spinner />
  if (payments.isError) return <LoadError error={payments.error} />
  if (!payments.data.results.length) return <p className="text-sm text-muted">{empty}</p>
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-edge text-sm">
        {payments.data.results.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <Link
                to="/recibos/$numero"
                params={{ numero: p.number }}
                className="font-semibold text-brand-700 hover:underline"
              >
                {p.number}
              </Link>
              <div className="text-[12.5px] text-muted">{describe(p)}</div>
            </div>
            <span className="flex shrink-0 items-center gap-2">
              {p.status === 'reversed' ? <Badge tone="danger">Reversado</Badge> : null}
              <span
                className={`font-medium tabular-nums ${
                  p.status === 'reversed' ? 'text-muted line-through' : ''
                }`}
              >
                {rd(p.amount)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <Pagination page={page} count={payments.data.count} onChange={setPage} />
    </div>
  )
}
