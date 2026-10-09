import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  closeMonth,
  getMonthClose,
  listPeriods,
  type MonthClose,
  monthClosePdfUrl,
  reopenMonth,
} from '../api/accounting'
import { ApiError } from '../api/client'
import { errorMessage, moment, rd } from '../lib/format'
import { notify } from '../lib/toast'
import { usePrompt } from './Dialog'
import { Alert, Badge, Button, Card, Spinner } from './ui'

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/** F15 · Cierre de mes (decision 084): checklist, accrual, lock and PDF. */
export function MonthCloseTab() {
  const periods = useQuery({ queryKey: ['periods'], queryFn: listPeriods })
  const [selected, setSelected] = useState<{ year: number; month: number } | null>(null)
  if (periods.isPending) return <Spinner />
  const months = periods.data ?? []
  const current = selected ?? (months[1] ? { year: months[1].year, month: months[1].month } : null)
  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
      <Card className="h-fit space-y-1">
        <h2 className="text-sm font-semibold">Meses</h2>
        <ul className="max-h-[28rem] space-y-1 overflow-y-auto text-sm">
          {months.map((p) => {
            const active = current?.year === p.year && current?.month === p.month
            return (
              <li key={`${p.year}-${p.month}`}>
                <button
                  type="button"
                  onClick={() => setSelected({ year: p.year, month: p.month })}
                  className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left ${
                    active ? 'bg-brand-100 font-semibold' : 'hover:bg-surface-2'
                  }`}
                >
                  <span className="capitalize">
                    {MONTHS[p.month - 1]} {p.year}
                  </span>
                  <Badge tone={p.status === 'closed' ? 'success' : 'neutral'}>
                    {p.status === 'closed' ? 'Cerrado' : 'Abierto'}
                  </Badge>
                </button>
              </li>
            )
          })}
        </ul>
      </Card>
      {current ? <MonthDetail year={current.year} month={current.month} /> : null}
    </div>
  )
}

function MonthDetail({ year, month }: { year: number; month: number }) {
  const queryClient = useQueryClient()
  const [dialog, ask] = usePrompt()
  const detail = useQuery({
    queryKey: ['month-close', year, month],
    queryFn: () => getMonthClose(year, month),
  })
  const after = (data: MonthClose | null) => {
    if (!data) return
    queryClient.setQueryData(['month-close', year, month], data)
    // The closing PDF is issued after the commit: read it back.
    void queryClient.invalidateQueries({ queryKey: ['month-close', year, month] })
    void queryClient.invalidateQueries({ queryKey: ['periods'] })
    void queryClient.invalidateQueries({ queryKey: ['chart'] })
  }
  const close = useMutation({
    meta: { inlineError: true },
    mutationFn: async () => {
      const ok = await ask({
        title: `Cerrar ${MONTHS[month - 1]} ${year}`,
        description:
          'Se asienta el devengo de intereses, el mes queda bloqueado y se emite el PDF del cierre.',
        confirmText: 'Cerrar el mes',
      })
      return ok === null ? null : closeMonth(year, month)
    },
    onSuccess: (data) => {
      if (data) notify('Mes cerrado.', 'success')
      after(data)
    },
  })
  const reopen = useMutation({
    meta: { inlineError: true },
    mutationFn: async () => {
      const reason = await ask({
        title: `Reabrir ${MONTHS[month - 1]} ${year}`,
        label: 'Motivo',
        type: 'textarea',
        required: true,
        danger: true,
        confirmText: 'Reabrir',
      })
      return reason === null ? null : reopenMonth(year, month, reason)
    },
    onSuccess: (data) => {
      if (data) notify('Mes reabierto: su devengo quedó anulado.', 'success')
      after(data)
    },
  })
  const data = detail.data
  if (!data) return <Spinner />
  const closed = data.status === 'closed'
  const error = [close.error, reopen.error].find((e) => e instanceof ApiError)
  return (
    <Card className="space-y-3">
      {dialog}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold capitalize">
            {MONTHS[month - 1]} {year}
          </h2>
          <p className="text-[12.5px] text-muted">
            {closed
              ? `Cerrado por ${data.closed_by_name} · ${moment(data.closed_at)}`
              : data.reopen_reason
                ? `Reabierto: ${data.reopen_reason}`
                : 'Abierto: admite movimientos con fecha de este mes.'}
          </p>
        </div>
        <Badge tone={closed ? 'success' : 'neutral'}>{closed ? 'Cerrado' : 'Abierto'}</Badge>
      </div>
      <ul className="space-y-1.5 text-sm">
        {data.checklist.checks.map((check) => (
          <li key={check.key} className="flex gap-2">
            <span
              aria-hidden
              className={check.ok ? 'text-success-600' : check.blocking ? 'text-danger-600' : ''}
            >
              {check.ok ? '✓' : '✗'}
            </span>
            <span>
              {check.label}
              {check.detail ? <span className="text-muted"> · {check.detail}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-sm">
        Devengo de intereses no cobrados al cierre:{' '}
        <strong className="tabular-nums">
          {rd(closed && data.accrual ? data.accrual.total : data.accrual_preview)}
        </strong>
        <span className="text-[12.5px] text-muted">
          {' '}
          · préstamos con hasta 90 días de atraso; se reversa solo el día 1 del mes siguiente.
        </span>
      </p>
      {error instanceof ApiError ? <Alert tone="danger">{errorMessage(error.data)}</Alert> : null}
      <div className="flex flex-wrap justify-end gap-2">
        {data.document ? (
          <a
            href={monthClosePdfUrl(year, month)}
            target="_blank"
            rel="noopener"
            className="inline-flex h-9 items-center rounded-lg border border-edge px-3 text-sm font-semibold hover:bg-surface-2"
          >
            PDF del cierre
          </a>
        ) : null}
        {data.can_close && closed ? (
          <Button variant="secondary" onClick={() => reopen.mutate()}>
            Reabrir
          </Button>
        ) : null}
        {data.can_close && !closed ? (
          <Button
            onClick={() => close.mutate()}
            disabled={!data.checklist.ready || close.isPending}
          >
            Cerrar el mes
          </Button>
        ) : null}
      </div>
    </Card>
  )
}
