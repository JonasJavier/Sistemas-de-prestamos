import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { listBranches, type Me } from '../api/accounts'
import { listProducts } from '../api/lending'
import { getPortfolioReport, type PortfolioCut, type PortfolioFilters } from '../api/reports'
import { ExportButtons } from '../components/ExportButtons'
import { Kpi } from '../components/Kpi'
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  LoadError,
  PageHeader,
  Select,
  Spinner,
} from '../components/ui'
import { day, pct, rd, todayISO, plural } from '../lib/format'
import { printArea } from '../lib/print'
import { hasRole } from '../lib/roles'
import { DateInput } from '../components/DateInput'

const CUTS: [PortfolioCut, string][] = [
  ['sucursal', 'Sucursal'],
  ['cobrador', 'Cobrador'],
  ['producto', 'Producto'],
]

/** P60 · Cartera (doc 09): balances by branch, collector or product, the
 * aging and PAR at any cut date. A past date reads that night's snapshot. */
export function PortfolioReportPage({ me }: { me: Me }) {
  const [filters, setFilters] = useState<PortfolioFilters>({ corte: 'sucursal' })
  const wide = hasRole(me, ['Gerente', 'Contabilidad', 'Auditoría'])
  const branches = useQuery({ queryKey: ['branches'], queryFn: listBranches, enabled: wide })
  const products = useQuery({ queryKey: ['products'], queryFn: listProducts })
  const report = useQuery({
    queryKey: ['report-portfolio', filters],
    queryFn: () => getPortfolioReport(filters),
    placeholderData: keepPreviousData,
  })
  const data = report.data
  const cutLabel = CUTS.find(([key]) => key === (filters.corte ?? 'sucursal'))?.[1]
  return (
    <>
      <PageHeader
        title="Cartera"
        subtitle="Capital pendiente de los préstamos activos, su antigüedad y la cartera en riesgo, con cortes por sucursal, cobrador y producto."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => printArea('letter')}>
              Imprimir
            </Button>
            {hasRole(me, ['Gerente', 'Supervisor', 'Contabilidad', 'Auditoría']) ? (
              <ExportButtons report="cartera" filters={{ ...filters }} />
            ) : null}
          </div>
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Fecha de corte">
          <DateInput
            max={todayISO()}
            value={filters.fecha ?? todayISO()}
            onChange={(date) =>
              setFilters({
                ...filters,
                fecha: date && date !== todayISO() ? date : undefined,
              })
            }
          />
        </Field>
        <Field label="Agrupar por">
          <Select
            value={filters.corte}
            onChange={(e) => setFilters({ ...filters, corte: e.target.value as PortfolioCut })}
          >
            {CUTS.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        {wide && (branches.data?.results.length ?? 0) > 1 ? (
          <Field label="Sucursal">
            <Select
              value={filters.sucursal ?? ''}
              onChange={(e) => setFilters({ ...filters, sucursal: e.target.value || undefined })}
            >
              <option value="">Todas</option>
              {branches.data?.results.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Producto">
          <Select
            value={filters.producto ?? ''}
            onChange={(e) => setFilters({ ...filters, producto: e.target.value || undefined })}
          >
            <option value="">Todos</option>
            {products.data?.results.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {report.isPending ? <Spinner /> : null}
      {report.error ? <LoadError error={report.error} /> : null}
      {data?.missing_snapshot ? (
        <Alert tone="info">
          No hay foto de la cartera de la noche del {day(data.date)}: la empresa aún no tenía
          préstamos activos o el cierre nocturno no corrió ese día. Elige otra fecha.
        </Alert>
      ) : data ? (
        <div id="print-area" className="space-y-4">
          <p className="text-[12.5px] text-muted">
            Corte al {day(data.date)} · {data.scope}
            {data.snapshot ? ' · foto de esa noche' : ' · en vivo'}
          </p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              label="Cartera activa"
              value={rd(data.totals.principal)}
              hint={plural(data.totals.count, 'préstamo')}
              help={data.definitions.portfolio}
            />
            <Kpi
              label="PAR30"
              value={pct(data.totals.par30)}
              hint={`${rd(data.totals.at_risk30)} en riesgo`}
              help={data.definitions.par30}
            />
            <Kpi label="PAR7" value={pct(data.totals.par7)} />
            <Kpi label="PAR90" value={pct(data.totals.par90)} />
          </div>
          <Card className="space-y-2">
            <h2 className="text-base font-semibold">Antigüedad</h2>
            <p className="text-[12px] text-muted">{data.definitions.buckets}</p>
            <div className="-mx-4 overflow-x-auto sm:-mx-5">
              <table className="data-table w-full min-w-[420px]">
                <thead>
                  <tr className="text-[12.5px] text-muted">
                    <th className="font-medium">Tramo</th>
                    <th className="text-right font-medium">Préstamos</th>
                    <th className="text-right font-medium">Capital</th>
                    <th className="text-right font-medium">% de la cartera</th>
                  </tr>
                </thead>
                <tbody>
                  {data.totals.buckets.map((b) => (
                    <tr key={b.key} className="border-edge/60">
                      <td className="pr-3">{b.label}</td>
                      <td className="text-right tabular-nums">{b.count}</td>
                      <td className="text-right tabular-nums">{rd(b.principal)}</td>
                      <td className="text-right tabular-nums">
                        {Number(data.totals.principal)
                          ? pct(Number(b.principal) / Number(data.totals.principal), 1)
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card className="space-y-2">
            <h2 className="text-base font-semibold">Por {cutLabel?.toLowerCase()}</h2>
            {data.rows.length ? (
              <div className="-mx-4 overflow-x-auto sm:-mx-5">
                <table className="data-table w-full min-w-[620px]">
                  <thead>
                    <tr className="text-[12.5px] text-muted">
                      <th className="font-medium">{cutLabel}</th>
                      <th className="text-right font-medium">Préstamos</th>
                      <th className="text-right font-medium">En atraso</th>
                      <th className="text-right font-medium">Capital</th>
                      <th className="text-right font-medium">En riesgo 30</th>
                      <th className="text-right font-medium">PAR30</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => (
                      <tr key={row.key || row.name} className="border-edge/60">
                        <td className="pr-3">{row.name}</td>
                        <td className="text-right tabular-nums">{row.count}</td>
                        <td className="text-right tabular-nums">{row.in_arrears}</td>
                        <td className="text-right tabular-nums">{rd(row.principal)}</td>
                        <td className="text-right tabular-nums">{rd(row.at_risk30)}</td>
                        <td className="text-right tabular-nums">{pct(row.par30, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold">
                      <td className="pr-3">Total</td>
                      <td className="text-right tabular-nums">{data.totals.count}</td>
                      <td className="text-right tabular-nums">
                        {data.rows.reduce((sum, row) => sum + row.in_arrears, 0)}
                      </td>
                      <td className="text-right tabular-nums">{rd(data.totals.principal)}</td>
                      <td className="text-right tabular-nums">{rd(data.totals.at_risk30)}</td>
                      <td className="text-right tabular-nums">{pct(data.totals.par30, 1)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <EmptyState>Sin préstamos activos con esos filtros.</EmptyState>
            )}
          </Card>
        </div>
      ) : null}
    </>
  )
}
