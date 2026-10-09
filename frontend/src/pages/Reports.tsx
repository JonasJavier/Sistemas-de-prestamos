import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import {
  type ColumnKind,
  exportFileUrl,
  type Filters,
  getReport,
  getReportCatalog,
  listMyExports,
  type ReportCatalog,
  type ReportSpec,
} from '../api/reports'
import { ApiError } from '../api/client'
import { ExportButtons } from '../components/ExportButtons'
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  RowList,
  Select,
  Spinner,
  Tabs,
} from '../components/ui'
import { day, errorMessage, moment, pct, rd, todayISO } from '../lib/format'

const TABS = [
  ['reports', 'Reportes'],
  ['exports', 'Mis exportaciones'],
] as const

const RIGHT: ColumnKind[] = ['money', 'int', 'pct']

function cell(value: string | number | null | undefined, kind: ColumnKind) {
  if (value === null || value === undefined || value === '') return kind === 'text' ? '' : '—'
  if (kind === 'money')
    return Number(value).toLocaleString('es-DO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  if (kind === 'int') return Number(value).toLocaleString('es-DO')
  if (kind === 'pct') return pct(value, 1)
  if (kind === 'date') return day(String(value))
  return String(value)
}

function FilterField({
  spec,
  filters,
  options,
  onChange,
}: {
  spec: ReportSpec['filters'][number]
  filters: Filters
  options: ReportCatalog['options']
  onChange: (key: string, value: string) => void
}) {
  const value = filters[spec.key] ?? ''
  if (spec.kind === 'date' || spec.kind === 'from' || spec.kind === 'to') {
    const fallback = spec.kind === 'from' ? `${todayISO().slice(0, 8)}01` : todayISO()
    return (
      <Field label={spec.label}>
        <Input
          type="date"
          max={spec.kind === 'date' ? todayISO() : undefined}
          value={value || fallback}
          onChange={(e) => onChange(spec.key, e.target.value)}
        />
      </Field>
    )
  }
  if (spec.kind === 'month') {
    return (
      <Field label={spec.label}>
        <Input
          type="month"
          max={todayISO().slice(0, 7)}
          value={value || todayISO().slice(0, 7)}
          onChange={(e) => onChange(spec.key, e.target.value)}
        />
      </Field>
    )
  }
  const choices = options[spec.kind] ?? []
  if (spec.kind === 'branch' && choices.length < 2) return null
  return (
    <Field label={spec.label}>
      <Select value={value} onChange={(e) => onChange(spec.key, e.target.value)}>
        {spec.kind === 'cut' ? null : <option value="">Todos</option>}
        {choices.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </Field>
  )
}

function ReportBody({ spec, catalog }: { spec: ReportSpec; catalog: ReportCatalog }) {
  const [filters, setFilters] = useState<Filters>({})
  const report = useQuery({
    queryKey: ['report', spec.key, filters],
    queryFn: () => getReport(spec.key, filters),
    placeholderData: keepPreviousData,
  })
  const data = report.data
  const personal = data?.columns.some((c) => c.personal)
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{spec.title}</h2>
          <p className="text-sm text-muted">{spec.description}</p>
        </div>
        {catalog.can_export ? <ExportButtons report={spec.key} filters={filters} /> : null}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {spec.filters.map((filter) => (
          <FilterField
            key={filter.key}
            spec={filter}
            filters={filters}
            options={catalog.options}
            onChange={(key, value) => setFilters({ ...filters, [key]: value || undefined })}
          />
        ))}
      </div>
      {report.error instanceof ApiError ? (
        <Alert tone="danger">{errorMessage(report.error.data)}</Alert>
      ) : null}
      {report.isPending ? <Spinner /> : null}
      {data ? (
        <>
          <p className="text-[12.5px] text-muted">{data.filters_line}</p>
          {catalog.can_export && personal && !catalog.exports_personal ? (
            <Alert tone="info">
              Tus exportaciones de este reporte salen sin los datos personales de los clientes: solo
              el gerente y auditoría los exportan.
            </Alert>
          ) : null}
          {data.summary.length ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {data.summary.map((item) => (
                <div
                  key={item.label}
                  className="rounded-lg border border-edge bg-surface px-3 py-2"
                >
                  <div className="text-[12px] text-muted">{item.label}</div>
                  <div className="font-semibold tabular-nums">
                    {item.kind === 'money' ? rd(item.value) : cell(item.value, item.kind)}
                  </div>
                  {item.hint ? <div className="text-[11.5px] text-muted">{item.hint}</div> : null}
                </div>
              ))}
            </div>
          ) : null}
          <Card className="!p-0">
            {data.rows.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-max text-sm">
                  <thead>
                    <tr className="border-b border-edge text-left text-[12.5px] text-muted">
                      {data.columns.map((column) => (
                        <th
                          key={column.key}
                          className={`whitespace-nowrap px-3 py-2 font-medium ${RIGHT.includes(column.kind) ? 'text-right' : ''}`}
                        >
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row, index) => (
                      <tr key={index} className="border-b border-edge/60">
                        {data.columns.map((column) => (
                          <td
                            key={column.key}
                            className={`px-3 py-1.5 ${RIGHT.includes(column.kind) ? 'whitespace-nowrap text-right tabular-nums' : ''}`}
                          >
                            {cell(row[column.key], column.kind)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  {Object.keys(data.totals).length ? (
                    <tfoot>
                      <tr className="font-semibold">
                        {data.columns.map((column, index) => (
                          <td
                            key={column.key}
                            className={`whitespace-nowrap px-3 py-2 ${RIGHT.includes(column.kind) ? 'text-right tabular-nums' : ''}`}
                          >
                            {column.key in data.totals
                              ? cell(data.totals[column.key], column.kind)
                              : index === 0
                                ? 'Total'
                                : ''}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
            ) : (
              <EmptyState>Sin datos con estos filtros.</EmptyState>
            )}
          </Card>
          {data.truncated ? (
            <p className="text-[12.5px] text-muted">
              Se muestran {data.rows.length} de {data.count} filas; los totales son de todas.
              Exporta para verlas completas.
            </p>
          ) : null}
          {data.note ? <p className="text-[12.5px] text-muted">{data.note}</p> : null}
        </>
      ) : null}
    </div>
  )
}

function MyExports() {
  const jobs = useQuery({
    queryKey: ['my-exports'],
    queryFn: listMyExports,
    refetchInterval: (query) =>
      query.state.data?.some((job) => job.status === 'pending' || job.status === 'running')
        ? 2500
        : false,
  })
  if (jobs.isPending) return <Spinner />
  if (!jobs.data?.length)
    return <EmptyState>Aún no has exportado reportes. Los archivos duran 7 días.</EmptyState>
  return (
    <>
      <p className="text-[12.5px] text-muted">Los archivos duran 7 días; solo tú los descargas.</p>
      <RowList>
        {jobs.data.map((job) => (
          <li key={job.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{job.title}</span>
                <Badge tone="neutral">{job.format_label}</Badge>
                <Badge
                  tone={
                    job.status === 'done'
                      ? 'success'
                      : job.status === 'failed'
                        ? 'danger'
                        : job.status === 'expired'
                          ? 'neutral'
                          : 'info'
                  }
                >
                  {job.status_label}
                </Badge>
                {job.personal ? <Badge tone="warning">Con datos personales</Badge> : null}
              </div>
              <div className="text-[12.5px] text-muted">
                {moment(job.created_at)} · {job.filters_line}
                {job.status === 'done' ? ` · ${job.rows} fila(s)` : ''}
                {job.error ? ` · ${job.error}` : ''}
              </div>
            </div>
            {job.status === 'done' ? (
              <a
                href={exportFileUrl(job.id)}
                className="inline-flex h-9 items-center rounded-lg border border-edge px-3 text-sm font-semibold hover:bg-surface-2"
              >
                Descargar
              </a>
            ) : null}
          </li>
        ))}
      </RowList>
    </>
  )
}

/** P64 · Centro de reportes (decision 087): every report with its filters,
 * on screen and in PDF or Excel from the very same figures. */
export function ReportsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('reports')
  const catalog = useQuery({ queryKey: ['report-catalog'], queryFn: getReportCatalog })
  const [selected, setSelected] = useState<string>()
  const data = catalog.data
  const current = data?.reports.find((r) => r.key === selected) ?? data?.reports[0]
  const groups = [...new Set(data?.reports.map((r) => r.group))]
  return (
    <>
      <PageHeader
        title="Centro de reportes"
        subtitle="Cada reporte con sus filtros; el PDF y el Excel salen con las mismas cifras que ves en pantalla."
      />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'exports' ? (
        <MyExports />
      ) : catalog.isPending ? (
        <Spinner />
      ) : !data || !current ? (
        <EmptyState>Tu rol no tiene reportes.</EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[15rem_1fr]">
          <nav aria-label="Reportes" className="space-y-3">
            {groups.map((group) => (
              <div key={group}>
                <div className="px-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
                  {group}
                </div>
                <ul className="mt-1 flex flex-wrap gap-1 lg:flex-col">
                  {data.reports
                    .filter((r) => r.group === group)
                    .map((r) => (
                      <li key={r.key}>
                        <button
                          type="button"
                          aria-current={r.key === current.key ? 'page' : undefined}
                          onClick={() => setSelected(r.key)}
                          className={`w-full rounded-lg px-2 py-1.5 text-left text-sm ${
                            r.key === current.key
                              ? 'bg-brand-100 font-semibold text-brand-800'
                              : 'hover:bg-surface-2'
                          }`}
                        >
                          {r.title}
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </nav>
          <ReportBody key={current.key} spec={current} catalog={data} />
        </div>
      )}
    </>
  )
}
