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
import { Kpi } from '../components/Kpi'
import { ExportButtons } from '../components/ExportButtons'
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  Field,
  MonthInput,
  PageHeader,
  RowList,
  Select,
  Spinner,
  Tabs,
} from '../components/ui'
import { day, errorMessage, moment, pct, rd, todayISO, plural } from '../lib/format'
import { DateInput } from '../components/DateInput'

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
        <DateInput
          max={spec.kind === 'date' ? todayISO() : undefined}
          value={value || fallback}
          onChange={(date) => onChange(spec.key, date)}
        />
      </Field>
    )
  }
  if (spec.kind === 'month') {
    return (
      <Field label={spec.label}>
        <MonthInput
          label={spec.label}
          max={todayISO().slice(0, 7)}
          value={value || todayISO().slice(0, 7)}
          onChange={(month) => onChange(spec.key, month)}
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
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
              {data.summary.map((item) => (
                <Kpi
                  key={item.label}
                  label={item.label}
                  value={item.kind === 'money' ? rd(item.value) : cell(item.value, item.kind)}
                  hint={item.hint || undefined}
                />
              ))}
            </div>
          ) : null}
          <Card className="!p-0">
            {data.rows.length ? (
              <div className="overflow-x-auto">
                <table className="data-table w-full min-w-max">
                  <thead>
                    <tr className="text-[12.5px] text-muted">
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
                      <tr key={index} className="border-edge/60">
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
                {job.status === 'done' ? ` · ${plural(job.rows, 'fila')}` : ''}
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
        <div className="space-y-5">
          <nav
            aria-label="Reportes"
            className="flex flex-wrap gap-x-6 gap-y-3 rounded-card border border-edge bg-surface px-4 py-3.5 shadow-sm"
          >
            {groups.map((group) => (
              <div key={group} className="min-w-0">
                <div className="eyebrow mb-1.5">{group}</div>
                <ul className="flex flex-wrap gap-1.5">
                  {data.reports
                    .filter((r) => r.group === group)
                    .map((r) => (
                      <li key={r.key}>
                        <button
                          type="button"
                          aria-current={r.key === current.key ? 'page' : undefined}
                          onClick={() => setSelected(r.key)}
                          className={`press press-down h-8 rounded-full px-3 text-[13px] ring-1 ring-inset outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                            r.key === current.key
                              ? 'bg-brand-100 font-semibold text-brand-800 ring-brand-700/30'
                              : 'font-medium text-ink ring-edge hover:bg-brand-50'
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
