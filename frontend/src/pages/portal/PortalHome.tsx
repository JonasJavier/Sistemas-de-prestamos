import { type UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { ApiError } from '../../api/client'
import {
  getPortalLoan,
  getPortalMe,
  leavePortal,
  portalStatementUrl,
  type PortalLoan,
  type PortalLoanRow,
} from '../../api/portal'
import { buttonClass } from '../../components/classes'
import { Alert, Badge, Button, Card, EmptyState, Spinner, Texture } from '../../components/ui'
import { LOAN_STATUS, day, nearDay, phoneText, plural, rd } from '../../lib/format'
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
        <button
          type="button"
          disabled={leave.isPending}
          onClick={() => leave.mutate()}
          className="press press-down h-9 rounded-control bg-white/10 px-3.5 text-[13px] font-semibold ring-1 ring-inset ring-white/15 hover:bg-white/15"
        >
          Salir
        </button>
      }
    >
      <section className="rounded-card border border-edge bg-surface px-5 py-4 shadow-sm">
        <p className="eyebrow flex items-center gap-2">
          <span aria-hidden className="size-1.5 rounded-full bg-gold-500" />
          Tu portal
        </p>
        <h1 className="mt-1 text-[24px] leading-tight">Hola, {data.customer}</h1>
        {data.phone ? (
          <p className="mt-1 text-[13px] text-muted">
            ¿Dudas con tu préstamo? Llama a {data.company} al{' '}
            <a href={`tel:${data.phone}`} className="font-semibold text-brand-700">
              {phoneText(data.phone)}
            </a>
            .
          </p>
        ) : null}
      </section>
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
  const detail = useQuery({
    queryKey: ['portal', 'loan', loan.number],
    queryFn: () => getPortalLoan(loan.number),
    retry: false,
    enabled: active || open,
  })
  const rows = detail.data?.installments ?? []
  const next = rows.find((row) => row.status !== 'paid')
  const paid = rows.filter((row) => row.status === 'paid').length
  const late = loan.days_past_due > 0
  return (
    <section aria-label={`Préstamo ${loan.number}`} className="space-y-3">
      <div className="overflow-hidden rounded-card border border-edge bg-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-3 pt-4">
          <div>
            <h2 className="text-[16px] font-semibold">Préstamo {loan.number}</h2>
            <div className="text-[12.5px] text-muted">
              {loan.product} · desde el {day(loan.disbursed_on)}
            </div>
          </div>
          <Badge tone={late ? 'warning' : status.tone} dot>
            {late ? `${plural(loan.days_past_due, 'día')} de atraso` : status.label}
          </Badge>
        </div>
        {active ? (
          <div className="relative mx-3 mb-3 overflow-hidden rounded-xl bg-brand-950 px-4 py-4 text-on-forest">
            <Texture tone="forest" />
            <div className="relative">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-200">
                {late ? 'Pago atrasado' : 'Tu próximo pago'}
              </div>
              <div className="mt-1 font-display text-[30px] font-bold leading-tight tracking-[-0.025em]">
                {next ? rd(next.owed) : '—'}
              </div>
              <div className="text-[13px] text-brand-200">
                {next
                  ? `${late ? 'Vencía' : 'Vence'} ${nearDay(next.due_date).toLowerCase()} · cuota ${next.number} de ${rows.length}`
                  : loan.next_due_date
                    ? `Vence el ${day(loan.next_due_date)}`
                    : ''}
              </div>
            </div>
          </div>
        ) : null}
        {active ? (
          <div className="px-5 pb-4">
            <div className="flex justify-between text-[12.5px] text-muted">
              <span>Capital pendiente</span>
              <span className="font-semibold text-ink tabular-nums">
                {rd(loan.principal_outstanding)}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Cuotas pagadas"
              aria-valuemin={0}
              aria-valuemax={rows.length || 1}
              aria-valuenow={paid}
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-edge"
            >
              <div
                className="h-full origin-left animate-grow-x rounded-full bg-brand-700"
                style={{ width: rows.length ? `${(paid / rows.length) * 100}%` : '0%' }}
              />
            </div>
            <div className="mt-1 text-[12px] text-muted">
              {rows.length ? `${paid} de ${rows.length} cuotas pagadas` : ''}
            </div>
            {late ? (
              <div className="mt-3">
                <Alert tone="warning">
                  Tienes cuotas atrasadas
                  {Number(loan.late_fee_outstanding) > 0
                    ? ` y una mora de ${rd(loan.late_fee_outstanding)}`
                    : ''}
                  . Ponte al día para evitar más cargos.
                </Alert>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2 border-t border-edge px-5 py-3">
          <Button variant="secondary" size="sm" onClick={() => setOpen((value) => !value)}>
            {open ? 'Ocultar detalle' : 'Ver cuotas y pagos'}
          </Button>
          <a
            className={buttonClass('ghost', '', 'sm')}
            href={portalStatementUrl(loan.number)}
            target="_blank"
            rel="noreferrer"
          >
            Estado de cuenta (PDF)
          </a>
        </div>
      </div>
      {open ? <LoanDetail query={detail} /> : null}
    </section>
  )
}

function LoanDetail({ query }: { query: UseQueryResult<PortalLoan> }) {
  if (query.isPending) return <Spinner />
  if (!query.data) return <Alert tone="danger">No pudimos cargar este préstamo.</Alert>
  const { installments, payments } = query.data
  const next = installments.find((row) => row.status !== 'paid')
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <section className="overflow-hidden rounded-card border border-edge bg-surface shadow-sm">
        <h3 className="border-b border-edge px-4 py-3 text-[14px] font-semibold">
          Calendario de pagos
        </h3>
        <ul className="divide-y divide-edge text-[13px]">
          {installments.map((row) => {
            const paid = row.status === 'paid'
            return (
              <li
                key={row.number}
                className={`flex items-center justify-between gap-2 px-4 py-2.5 ${row === next ? 'bg-brand-50' : ''}`}
              >
                <div>
                  <div className="font-medium">
                    Cuota {row.number} · {day(row.due_date)}
                  </div>
                  <div className="mt-0.5">
                    <Badge
                      tone={
                        paid
                          ? 'brand'
                          : row.days_late > 0
                            ? 'warning'
                            : row === next
                              ? 'info'
                              : 'neutral'
                      }
                      dot={paid || row.days_late > 0 || row === next}
                    >
                      {paid
                        ? 'Pagada'
                        : row.days_late > 0
                          ? `${plural(row.days_late, 'día')} de atraso`
                          : row === next
                            ? 'Próxima'
                            : row.status_label}
                    </Badge>
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
      </section>
      <section className="overflow-hidden rounded-card border border-edge bg-surface shadow-sm">
        <h3 className="border-b border-edge px-4 py-3 text-[14px] font-semibold">Tus pagos</h3>
        {payments.length === 0 ? (
          <p className="px-4 py-3 text-[13px] text-muted">Aún no hay pagos registrados.</p>
        ) : (
          <ul className="divide-y divide-edge text-[13px]">
            {payments.map((payment) => (
              <li
                key={payment.number}
                className="flex items-center justify-between gap-2 px-4 py-2.5"
              >
                <div>
                  <div className="font-semibold tabular-nums">{rd(payment.amount)}</div>
                  <div className="text-[12px] text-muted">
                    {day(payment.date)} · {payment.number}
                    {payment.reversed ? ' · reversado' : ''}
                  </div>
                </div>
                {payment.receipt_path ? (
                  <a
                    className={buttonClass('soft', '', 'sm')}
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
      </section>
    </div>
  )
}
