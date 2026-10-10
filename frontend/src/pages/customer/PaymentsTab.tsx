import { PaymentList } from '../../components/PaymentList'
import { Card } from '../../components/ui'
import { moment } from '../../lib/format'

/** P22 «Pagos»: every receipt of the customer, newest first. */
export function PaymentsTab({ customerId }: { customerId: string }) {
  return (
    <Card>
      <PaymentList
        filter={{ customer: customerId }}
        queryKey={['payments', 'customer', customerId]}
        describe={(p) =>
          `Préstamo ${p.loan_number} · ${p.kind_label} · ${p.method_label} · ${moment(p.paid_at)}`
        }
      />
    </Card>
  )
}
