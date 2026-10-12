import { useState } from 'react'

import type { InstallmentRow, LoanTerms } from '../api/origination'
import { day, nearDay, num, plural, todayISO } from '../lib/format'
import { Badge } from './ui'

type Row = InstallmentRow

/** Days between two ISO dates (b − a). */
const between = (a: string, b: string) =>
  Math.round(
    (new Date(`${b.slice(0, 10)}T00:00:00`).getTime() -
      new Date(`${a.slice(0, 10)}T00:00:00`).getTime()) /
      86_400_000,
  )

/** The state of an installment as a chip, and the line under its date. */
function describe(row: Row, next: Row | undefined, today: string) {
  const late = row.due_date < today
  if (row.status === 'paid') {
    const behind = row.paid_on ? between(row.due_date, row.paid_on) > 0 : false
    return {
      chip: behind
        ? { label: 'Pagada con atraso', tone: 'warning' }
        : { label: 'Pagada', tone: 'brand' },
      line: row.paid_on ? `Pagada ${nearDay(row.paid_on, today).toLowerCase()}` : 'Pagada',
    }
  }
  if (row.status === 'partial')
    return {
      chip: { label: 'Pago parcial', tone: late ? 'warning' : 'info' },
      line: late ? `Vencida hace ${plural(between(row.due_date, today), 'día')}` : 'Abonada',
    }
  if (late)
    return {
      chip: { label: 'Vencida', tone: between(row.due_date, today) > 30 ? 'danger' : 'warning' },
      line: `Hace ${plural(between(row.due_date, today), 'día')}`,
    }
  if (row === next) {
    const days = between(today, row.due_date)
    return {
      chip: { label: 'Próxima', tone: 'info' },
      line: days === 0 ? 'Vence hoy' : `En ${plural(days, 'día')}`,
    }
  }
  return { chip: { label: 'Pendiente', tone: 'neutral' }, line: '' }
}

/** Narrow (a phone, a card beside the menu): #, date, installment and state;
 * from 600 px of card the capital, interest and late fee join them. */
const COLUMNS =
  'grid grid-cols-[22px_minmax(0,1.3fr)_minmax(0,1fr)_auto] items-center gap-x-3 @min-[600px]:grid-cols-[28px_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.2fr)]'
const WIDE = 'hidden @min-[600px]:block'

/** The schedule of a loan (decision 114): how many are paid with a bar, then
 * each installment with its date, amounts, late fee and state; the next one
 * stands out. It opens around the next installment and unfolds whole. */
export function LoanCalendar({ rows, terms }: { rows: Row[]; terms: LoanTerms | null }) {
  const [all, setAll] = useState(false)
  const today = todayISO()
  const current = rows.filter(
    (row) => row.version === (terms?.version ?? 1) && row.status !== 'superseded',
  )
  const paid = current.filter((row) => row.status === 'paid').length
  const next = current.find((row) => row.status !== 'paid')
  const at = next ? current.indexOf(next) : current.length
  const start = all ? 0 : Math.max(0, Math.min(at - 4, current.length - 8))
  const shown = all ? current : current.slice(start, start + 8)
  return (
    <div className="@container flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="text-[13.5px] font-semibold whitespace-nowrap">
            {paid} de {current.length} cuotas pagadas
          </span>
          <span
            role="progressbar"
            aria-label="Cuotas pagadas"
            aria-valuemin={0}
            aria-valuemax={current.length || 1}
            aria-valuenow={paid}
            className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-edge sm:block"
          >
            <span
              className="block h-full origin-left animate-grow-x rounded-full bg-brand-700"
              style={{ width: current.length ? `${(paid / current.length) * 100}%` : '0%' }}
            />
          </span>
        </div>
        <span className="text-[12.5px] text-muted">
          Versión {terms?.version ?? 1} del calendario
          {terms && terms.version > 1 ? ` · desde ${day(terms.effective_from)}` : ' · sin cambios'}
        </span>
      </div>
      <div>
        <div>
          <div
            className={`${COLUMNS} border-y border-edge bg-surface-2 px-4 py-2 text-[12px] font-medium text-muted @min-[600px]:px-5`}
          >
            <span>#</span>
            <span>Vence</span>
            <span className="text-right">Cuota</span>
            <span className={`text-right ${WIDE}`}>Capital</span>
            <span className={`text-right ${WIDE}`}>Interés</span>
            <span className={`text-right ${WIDE}`}>Mora</span>
            <span className="@min-[600px]:pl-2">Estado</span>
          </div>
          <ul className="divide-y divide-edge">
            {shown.map((row) => {
              const { chip, line } = describe(row, next, today)
              const fee = Math.max(
                Number(row.late_fee_accrued ?? 0),
                Number(row.late_fee_paid ?? 0),
              )
              const shifted = row.original_due_date && row.original_due_date !== row.due_date
              return (
                <li
                  key={row.id}
                  className={`${COLUMNS} px-4 py-2.5 text-[13px] @min-[600px]:px-5 ${
                    row === next ? 'bg-brand-50' : ''
                  }`}
                >
                  <span className="text-muted tabular-nums">{row.number}</span>
                  <span className="min-w-0">
                    <span className={`block ${row === next ? 'font-semibold' : ''}`}>
                      {nearDay(row.due_date, today) === 'Hoy' ? 'Hoy' : day(row.due_date)}
                      {shifted ? (
                        <span
                          className="ml-1 text-[11.5px] text-muted"
                          title={`Corrida desde ${day(row.original_due_date)} por día no laborable`}
                        >
                          ↷
                        </span>
                      ) : null}
                    </span>
                    {line ? (
                      <span className="block truncate text-[11.5px] text-muted">{line}</span>
                    ) : null}
                  </span>
                  <span className="text-right font-semibold tabular-nums">
                    {num(row.total_due)}
                  </span>
                  <span className={`text-right tabular-nums ${WIDE}`}>
                    {num(row.principal_due)}
                  </span>
                  <span className={`text-right tabular-nums ${WIDE}`}>{num(row.interest_due)}</span>
                  <span
                    className={`text-right tabular-nums ${WIDE} ${fee ? 'text-warning-700' : 'text-muted'}`}
                  >
                    {fee ? num(fee) : '—'}
                  </span>
                  <span className="@min-[600px]:pl-2">
                    <Badge tone={chip.tone} dot={chip.label !== 'Pendiente'}>
                      {chip.label}
                    </Badge>
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
      {current.length > 8 ? (
        <button
          type="button"
          onClick={() => setAll((value) => !value)}
          className="self-start px-5 py-3 text-[13px] font-semibold text-brand-700 hover:underline"
        >
          {all ? 'Ver menos' : `Ver las ${current.length} cuotas →`}
        </button>
      ) : null}
    </div>
  )
}
