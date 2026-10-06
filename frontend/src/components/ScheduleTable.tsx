import { day, rd } from '../lib/format'

export interface ScheduleRow {
  number: number
  due_date: string
  principal: string
  interest: string
  total: string
  original_due_date?: string
  status?: string
}

const STATUS_TEXT: Record<string, string> = {
  pending: 'Pendiente',
  partial: 'Parcial',
  paid: 'Pagada',
  superseded: 'Reemplazada',
}

/** The payment table, with the running balance (P25, P27, P30, P32). */
export function ScheduleTable({ rows, principal }: { rows: ScheduleRow[]; principal?: string }) {
  const showBalance = Boolean(principal)
  // Running balance after each installment, computed once (pure render).
  const balances = rows.reduce<number[]>((acc, row) => {
    const previous = acc.length ? acc[acc.length - 1] : Number(principal ?? 0)
    return [...acc, previous - Number(row.principal)]
  }, [])
  const totals = rows.reduce(
    (acc, row) => ({
      principal: acc.principal + Number(row.principal),
      interest: acc.interest + Number(row.interest),
      total: acc.total + Number(row.total),
    }),
    { principal: 0, interest: 0, total: 0 },
  )
  const showStatus = rows.some((row) => row.status)
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-edge text-left text-[12.5px] text-muted">
            <th className="py-2 pr-3">#</th>
            <th className="py-2 pr-3">Vence</th>
            <th className="py-2 pr-3 text-right">Capital</th>
            <th className="py-2 pr-3 text-right">Interés</th>
            <th className="py-2 pr-3 text-right">Cuota</th>
            {showBalance ? <th className="py-2 pr-3 text-right">Saldo</th> : null}
            {showStatus ? <th className="py-2">Estado</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const shifted = row.original_due_date && row.original_due_date !== row.due_date
            return (
              <tr key={row.number} className="border-b border-edge/60 last:border-0">
                <td className="py-1.5 pr-3 tabular-nums">{row.number}</td>
                <td className="py-1.5 pr-3 tabular-nums">
                  {day(row.due_date)}
                  {shifted ? (
                    <span
                      className="ml-1 text-[11.5px] text-muted"
                      title={`Corrida desde ${day(row.original_due_date)} por día no laborable`}
                    >
                      ↷
                    </span>
                  ) : null}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{rd(row.principal)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{rd(row.interest)}</td>
                <td className="py-1.5 pr-3 text-right font-medium tabular-nums">{rd(row.total)}</td>
                {showBalance ? (
                  <td className="py-1.5 pr-3 text-right tabular-nums text-muted">
                    {rd(Math.max(balances[index], 0))}
                  </td>
                ) : null}
                {showStatus ? (
                  <td className="py-1.5 text-[12.5px] text-muted">
                    {STATUS_TEXT[row.status ?? ''] ?? row.status}
                  </td>
                ) : null}
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-brand-700/40 font-semibold">
            <td className="py-2 pr-3" colSpan={2}>
              Totales
            </td>
            <td className="py-2 pr-3 text-right tabular-nums">{rd(totals.principal)}</td>
            <td className="py-2 pr-3 text-right tabular-nums">{rd(totals.interest)}</td>
            <td className="py-2 pr-3 text-right tabular-nums">{rd(totals.total)}</td>
            {showBalance ? <td /> : null}
            {showStatus ? <td /> : null}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
