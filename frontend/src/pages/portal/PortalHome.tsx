import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { ApiError } from '../../api/client'
import {
  getPortalLoan,
  getPortalMe,
  leavePortal,
  portalStatementUrl,
  type PortalLoanRow,
} from '../../api/portal'
import { Alert, Badge, Button, Card, EmptyState, Spinner, Stat } from '../../components/ui'
import { LOAN_STATUS, day, phoneText, rd } from '../../lib/format'
import { PortalFrame } from './PortalFrame'

/** P93 · Portal del cliente: inicio (decision 099). Only this customer's
 * loans in this company: balance, next payment, schedule and receipts. */
export function PortalHomePage() {
  const queryClient = useQueryClient()
  const me = useQuery({ queryKey: ['portal', 'me'], queryFn: getPortalMe, retry: false })
  const [left, setLeft] = useState(false)
  const leave = useMutation({
    mutationFn: leavePortal,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['portal'] })
      setLeft(true)
    },
  })

  if (left || (me.error instanceof ApiError && me.error.status === 401)) {
    return (
      <PortalFrame>
        <Card className="space-y-2 text-center">
          <h1 className="text-lg font-semibold">
            {left ? 'Saliste de tu portal' : 'Tu sesión terminó'}
          </h1>
          <p className="text-sm text-muted">
            Para entrar de nuevo, abre el enlace personal que te envió tu financiera y pide un
            código.
          </p>
        </Card>
      </PortalFrame>
    )
  }
  if (me.isPending) {
    return (
      <PortalFrame>
        <Spinner />
      </PortalFrame>
    )
  }
  if (!me.data) {
    return (
      <PortalFrame>
        <Alert tone="danger">No pudimos cargar tu información. Inténtalo de nuevo.</Alert>
      </PortalFrame>
    )
  }

  const data = me.data
  return (
    <PortalFrame
      company={data.company}
      actions={
        <Button variant="secondary" disabled={leave.isPending} onClick={() => leave.mutate()}>
          Salir
        </Button>
      }
    >
      <div>
        <h1 className="text-xl font-semibold">Hola, {data.customer}</h1>
        {data.phone ? (
          <p className="text-sm text-muted">
            ¿Dudas con tu préstamo? Llama a {data.company} al {phoneText(data.phone)}.
          </p>
        ) : null}
      </div>
      {data.loans.length === 0 ? (
        <EmptyState>No tienes préstamos con esta financiera.</EmptyState>
      ) : (
        // Active loans first; the detail opens by itself when there is only one.
        [...data.loans]
          .sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active'))
          .map((loan) => (
            <LoanCard key={loan.number} loan={loan} expanded={data.loans.length === 1} />
          ))
      )}
    </PortalFrame>
  )
}

function LoanCard({ loan, expanded }: { loan: PortalLoanRow; expanded: boolean }) {
  const [open, setOpen] = useState(expanded)
  const status = LOAN_STATUS[loan.status] ?? { label: loan.status_label, tone: 'neutral' }
  const active = loan.status === 'active'
  return (
    <section aria-label={`Préstamo ${loan.number}`} className="space-y-3">
      <Card className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Préstamo {loan.number}</h2>
            <div className="text-[12.5px] text-muted">
              {loan.product} · desde el {day(loan.disbursed_on)}
            </div>
          </div>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        {active ? (
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Capital pendiente" value={rd(loan.principal_outstanding)} emphasis />
            <Stat
              label="Próximo pago"
              value={day(loan.next_due_date)}
              hint={loan.days_past_due > 0 ? `${loan.days_past_due} días de atraso` : 'Al día'}
            />
          </div>
        ) : null}
        {active && loan.days_past_due > 0 ? (
          <Alert tone="warning">
            Tienes cuotas atrasadas
            {Number(loan.late_fee_outstanding) > 0
              ? ` y una mora de ${rd(loan.late_fee_outstanding)}`
              : ''}
            . Ponte al día para evitar más cargos.
          </Alert>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setOpen((value) => !value)}>
            {open ? 'Ocultar detalle' : 'Ver cuotas y pagos'}
          </Button>
          <a
            className="inline-flex h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold text-brand-700 hover:underline sm:h-9"
            href={portalStatementUrl(loan.number)}
            target="_blank"
            rel="noreferrer"
          >
            Estado de cuenta (PDF)
          </a>
        </div>
      </Card>
      {open ? <LoanDetail number={loan.number} /> : null}
    </section>
  )
}

function LoanDetail({ number }: { number: string }) {
  const loan = useQuery({
    queryKey: ['portal', 'loan', number],
    queryFn: () => getPortalLoan(number),
    retry: false,
  })
  if (loan.isPending) return <Spinner />
  if (!loan.data) return <Alert tone="danger">No pudimos cargar este préstamo.</Alert>
  const { installments, payments } = loan.data
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Card className="p-4 sm:p-5">
        <h3 className="mb-2 text-sm font-semibold">Calendario de pagos</h3>
        <ul className="divide-y divide-edge text-sm">
          {installments.map((row) => {
            const paid = row.status === 'paid'
            return (
              <li key={row.number} className="flex items-center justify-between gap-2 py-2">
                <div>
                  <div className="font-medium">
                    Cuota {row.number} · {day(row.due_date)}
                  </div>
                  <div className="text-[12.5px] text-muted">
                    {paid
                      ? 'Pagada'
                      : row.days_late > 0
                        ? `${row.days_late} días de atraso`
                        : row.status_label}
                  </div>
                </div>
                <div className="text-right tabular-nums">
                  <div className={paid ? 'text-muted line-through' : 'font-semibold'}>
                    {rd(paid ? row.total : row.owed)}
                  </div>
                  {Number(row.late_fee) > 0 ? (
                    <div className="text-[12px] text-danger-600">mora {rd(row.late_fee)}</div>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      </Card>
      <Card className="p-4 sm:p-5">
        <h3 className="mb-2 text-sm font-semibold">Tus pagos</h3>
        {payments.length === 0 ? (
          <p className="text-sm text-muted">Aún no hay pagos registrados.</p>
        ) : (
          <ul className="divide-y divide-edge text-sm">
            {payments.map((payment) => (
              <li key={payment.number} className="flex items-center justify-between gap-2 py-2">
                <div>
                  <div className="font-medium tabular-nums">{rd(payment.amount)}</div>
                  <div className="text-[12.5px] text-muted">
                    {day(payment.date)} · {payment.number}
                    {payment.reversed ? ' · reversado' : ''}
                  </div>
                </div>
                {payment.receipt_path ? (
                  <a
                    className="text-sm font-semibold text-brand-700 hover:underline"
                    href={payment.receipt_path}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ver recibo
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
