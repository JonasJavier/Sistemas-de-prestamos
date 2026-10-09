import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { listBranches } from '../api/accounts'
import { getManagementResults, type Range } from '../api/accounting'
import { Button, Card, Field, Input, PageHeader, Select, Spinner, Stat } from '../components/ui'
import { day, rd, todayISO } from '../lib/format'
import { printArea } from '../lib/print'

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
          <Input
            type="date"
            value={range.desde}
            onChange={(e) => setRange({ ...range, desde: e.target.value })}
          />
        </Field>
        <Field label="Hasta">
          <Input
            type="date"
            value={range.hasta}
            onChange={(e) => setRange({ ...range, hasta: e.target.value })}
          />
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
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="space-y-2">
              <h2 className="text-base font-semibold">Ingresos cobrados</h2>
              <ul className="divide-y divide-edge text-sm">
                {data.income.map((row) => (
                  <li key={row.label} className="flex justify-between py-1.5">
                    <span>{row.label}</span>
                    <span className="tabular-nums">{rd(row.amount)}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="space-y-2">
              <h2 className="text-base font-semibold">Gastos operativos</h2>
              {data.expenses.length ? (
                <ul className="divide-y divide-edge text-sm">
                  {data.expenses.map((row) => (
                    <li key={row.id} className="flex justify-between gap-2 py-1.5">
                      <span>
                        <span className="tabular-nums text-muted">{row.code}</span> {row.name}
                      </span>
                      <span className="tabular-nums">{rd(row.amount)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Sin gastos en esas fechas.</p>
              )}
            </Card>
          </div>
          <Card className="space-y-2">
            <h2 className="text-base font-semibold">Aparte del resultado</h2>
            <ul className="divide-y divide-edge text-sm">
              <li className="flex justify-between py-1.5">
                <span>Castigos de cartera (pérdida de capital)</span>
                <span className="tabular-nums">{rd(data.write_offs)}</span>
              </li>
              <li className="flex justify-between py-1.5">
                <span>Retiros y gastos personales del dueño</span>
                <span className="tabular-nums">{rd(data.owner_withdrawals)}</span>
              </li>
              <li className="flex justify-between py-1.5">
                <span>Aportes de capital netos</span>
                <span className="tabular-nums">{rd(data.owner_capital)}</span>
              </li>
            </ul>
          </Card>
          {data.months.length > 1 ? (
            <Card className="space-y-2">
              <h2 className="text-base font-semibold">Por mes</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-edge text-left text-[12.5px] text-muted">
                      <th className="py-2 pr-3 font-medium">Mes</th>
                      <th className="py-2 pr-3 text-right font-medium">Ingresos</th>
                      <th className="py-2 pr-3 text-right font-medium">Gastos</th>
                      <th className="py-2 text-right font-medium">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.months.map((m) => (
                      <tr key={`${m.year}-${m.month}`} className="border-b border-edge/60">
                        <td className="py-1.5 pr-3">
                          {MONTHS[m.month - 1]} {m.year}
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{rd(m.income)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{rd(m.expenses)}</td>
                        <td className="py-1.5 text-right tabular-nums">{rd(m.result)}</td>
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
