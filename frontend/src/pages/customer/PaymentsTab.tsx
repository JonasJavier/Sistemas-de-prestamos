import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'

import { listPayments } from '../../api/payments'
import { Badge, Card, Spinner } from '../../components/ui'
import { moment, rd } from '../../lib/format'

/** P22 «Pagos»: every receipt of the customer, newest first. */
export function PaymentsTab({ customerId }: { customerId: string }) {
  const payments = useQuery({
    queryKey: ['payments', 'customer', customerId],
    queryFn: () => listPayments({ customer: customerId }),
  })
  return (
    <Card>
      {payments.isPending ? (
        <Spinner />
      ) : payments.data?.results.length ? (
        <ul className="divide-y divide-edge text-sm">
          {payments.data.results.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <Link
                  to="/recibos/$numero"
                  params={{ numero: p.number }}
                  className="font-semibold text-brand-700 hover:underline"
                >
                  {p.number}
                </Link>{' '}
                <span className="text-muted">
                  · préstamo {p.loan_number} · {p.kind_label} · {p.method_label} ·{' '}
                  {moment(p.paid_at)}
                </span>
              </span>
              <span className="flex items-center gap-2">
                {p.status === 'reversed' ? <Badge tone="danger">Reversado</Badge> : null}
                <span className="font-medium tabular-nums">{rd(p.amount)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Sin pagos todavía.</p>
      )}
    </Card>
  )
}
