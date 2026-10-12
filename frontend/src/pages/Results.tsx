import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { listBranches } from '../api/accounts'
import { getManagementResults, type Range } from '../api/accounting'
import { cardClass } from '../components/classes'
import { Button, Card, Field, PageHeader, Select, Spinner, Stat } from '../components/ui'
import { day, rd, todayISO } from '../lib/format'
import { printArea } from '../lib/print'
import { DateInput } from '../components/DateInput'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** P61 · Resultados: what was collected minus operating expenses (cash
 * basis, doc 09); the owner's movements and write-offs apart. */
export function ResultsPage() {
  const [range, setRange] = useState<Range>(() => ({
    desde: `${todayISO().slice(0, 4)}-01-01`,
    hasta: todayISO(),
  }))
  const branches = useQuery({ queryKey: ['branches'], queryFn: listBranches })
  const report = useQuery({
    queryKey: ['management-results', range],
    queryFn: () => getManagementResults(range),
  })
  const data = report.data
  const positive = data ? Number(data.result) >= 0 : true
  return (
    <>
      <PageHeader
        title="Resultados"
        subtitle="Lo cobrado (intereses, mora, cargos y otros ingresos) menos los gastos operativos. El devengo del cierre de mes no entra: es contabilidad, no caja."
        actions={
          <Button variant="secondary" onClick={() => printArea('letter')}>
            Imprimir
          </Button>
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Desde">
          <DateInput value={range.desde} onChange={(date) => setRange({ ...range, desde: date })} />
        </Field>
        <Field label="Hasta">
          <DateInput value={range.hasta} onChange={(date) => setRange({ ...range, hasta: date })} />
        </Field>
        <Field label="Sucursal">
          <Select
            value={range.sucursal ?? ''}
            onChange={(e) => setRange({ ...range, sucursal: e.target.value || undefined })}
          >
            <option value="">Todas</option>
            {branches.data?.results.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {report.isPending ? <Spinner /> : null}
      {data ? (
        <div id="print-area" className="space-y-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <Stat label="Ingresos cobrados" value={rd(data.income_total)} />
            <Stat label="Gastos operativos" value={rd(data.expense_total)} />
            {/* A loss reads in red, as its size: «Pérdida RD$ 1,000», never in green. */}
            <Stat
              label={positive ? 'Ganancia cobrada' : 'Pérdida'}
              value={rd(Math.abs(Number(data.result)))}
              emphasis={positive}
              danger={!positive}
            />
          </div>
          <p className="text-[12.5px] text-muted">
            Del {day(data.date_from)} al {day(data.date_to)}.
          </p>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Ledger
              title="Ingresos cobrados"
              total={data.income_total}
              rows={data.income.map((row) => ({
                key: row.label,
                label: row.label,
                amount: row.amount,
              }))}
            />
            <Ledger
              title="Gastos operativos"
              total={data.expense_total}
              empty="Sin gastos en esas fechas."
              rows={data.expenses.map((row) => ({
                key: row.id,
                code: row.code,
                label: row.name,
                amount: row.amount,
              }))}
            />
          </div>
          <Ledger
            title="Aparte del resultado"
            hint="No entran en la ganancia: son pérdidas de capital y movimientos del dueño."
            rows={[
              {
                key: 'write-offs',
                label: 'Castigos de cartera (pérdida de capital)',
                amount: data.write_offs,
              },
              {
                key: 'withdrawals',
                label: 'Retiros y gastos personales del dueño',
                amount: data.owner_withdrawals,
              },
              { key: 'capital', label: 'Aportes de capital netos', amount: data.owner_capital },
            ]}
          />
          {data.months.length > 1 ? (
            <Card className="space-y-2">
              <h2 className="text-[17px] font-semibold">Por mes</h2>
              <div className="-mx-4 overflow-x-auto sm:-mx-5">
                <table className="data-table w-full min-w-[480px]">
                  <thead>
                    <tr className="text-[12.5px] text-muted">
                      <th className="font-medium">Mes</th>
                      <th className="text-right font-medium">Ingresos</th>
                      <th className="text-right font-medium">Gastos</th>
                      <th className="text-right font-medium">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.months.map((m) => (
                      <tr key={`${m.year}-${m.month}`} className="border-edge/60">
                        <td className="pr-3">
                          {MONTHS[m.month - 1]} {m.year}
                        </td>
                        <td className="text-right tabular-nums">{rd(m.income)}</td>
                        <td className="text-right tabular-nums">{rd(m.expenses)}</td>
                        <td className="text-right tabular-nums">{rd(m.result)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}
    </>
  )
}

/** A statement block (decision 116): rows of label and amount, the amount
 * never wrapping, and the total closing it. */
function Ledger({
  title,
  hint,
  total,
  rows,
  empty,
}: {
  title: string
  hint?: string
  total?: string
  rows: { key: string; code?: string; label: string; amount: string }[]
  empty?: string
}) {
  return (
    <section className={`${cardClass} overflow-hidden`}>
      <div className="px-4 pb-2 pt-4 sm:px-5">
        <h2 className="text-[17px] font-semibold">{title}</h2>
        {hint ? <p className="mt-0.5 text-[12.5px] text-muted">{hint}</p> : null}
      </div>
      {rows.length ? (
        <ul className="divide-y divide-edge text-[13px]">
          {rows.map((row) => (
            <li
              key={row.key}
              className="flex items-baseline justify-between gap-4 px-4 py-2.5 sm:px-5"
            >
              <span className="min-w-0">
                {row.code ? (
                  <span className="mr-1.5 text-muted tabular-nums">{row.code}</span>
                ) : null}
                {row.label}
              </span>
              <span className="shrink-0 whitespace-nowrap tabular-nums">{rd(row.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 pb-4 text-[13px] text-muted sm:px-5">{empty}</p>
      )}
      {total !== undefined ? (
        <div className="flex items-baseline justify-between gap-4 border-t border-edge bg-surface-2/60 px-4 py-3 text-[13.5px] font-semibold sm:px-5">
          <span>Total</span>
          <span className="whitespace-nowrap tabular-nums">{rd(total)}</span>
        </div>
      ) : null}
    </section>
  )
}
