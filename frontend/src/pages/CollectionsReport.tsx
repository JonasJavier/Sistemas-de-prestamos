import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { getCollectionsReport, type CollectionsReport } from '../api/reports'
import { DateInput } from '../components/DateInput'
import { Kpi } from '../components/Kpi'
import { EmptyState, LoadError, PageHeader, Segmented, Spinner } from '../components/ui'
import { pct, plural, rd, todayISO } from '../lib/format'
import { useDocumentTitle } from '../lib/hooks'

/** The recovery a route should reach (decision 115): emerald from here up. */
const GOAL = 0.9

type Preset = 'mes' | '7' | 'anterior' | 'otro'

function rangeOf(preset: Preset): { desde: string; hasta: string } {
  const today = todayISO()
  if (preset === '7') return { desde: todayISO(-6), hasta: today }
  if (preset === 'anterior') {
    const first = new Date(`${today.slice(0, 8)}01T00:00:00`)
    const end = new Date(first)
    end.setDate(0)
    const start = new Date(end.getFullYear(), end.getMonth(), 1)
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { desde: iso(start), hasta: iso(end) }
  }
  return { desde: `${today.slice(0, 8)}01`, hasta: today }
}

const WEEKDAY = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const dateOf = (iso: string) => new Date(`${iso}T00:00:00`)

/** «Por día»: the expected as a soft column and the collected inside it; a
 * click picks a day and the line above tells its figures (decision 115). */
function DayBars({ report }: { report: CollectionsReport }) {
  const days = report.days
  const [picked, setPicked] = useState(() => {
    const withData = [...days].reverse().find((d) => Number(d.expected) || Number(d.collected))
    return withData?.date ?? days.at(-1)?.date
  })
  const day = days.find((d) => d.date === picked)
  const max = Math.max(...days.map((d) => Math.max(Number(d.expected), Number(d.collected))), 1)
  const long = (iso: string) =>
    dateOf(iso).toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' })
  return (
    <section className="rounded-card border border-edge bg-surface shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-2 pt-4">
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold">Por día</h2>
          <p className="mt-0.5 text-[12.5px] text-muted first-letter:uppercase" aria-live="polite">
            {day
              ? `${long(day.date)}: ${rd(day.collected)} de ${rd(day.expected)}${
                  day.recovery ? ` · ${pct(day.recovery, 1)}` : ''
                }`
              : 'Elige un día.'}
          </p>
        </div>
        <div className="flex gap-4 text-[12px] text-muted">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full bg-brand-700" />
            Cobrado
          </span>
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 rounded-full bg-brand-100 ring-1 ring-brand-700/20"
            />
            Esperado
          </span>
        </div>
      </div>
      <div className="overflow-x-auto px-3 pb-3">
        <div
          role="radiogroup"
          aria-label="Día"
          className="flex h-[260px] min-w-full items-end gap-1"
          style={{ minWidth: `${days.length * 30}px` }}
        >
          {days.map((d, index) => {
            const on = d.date === picked
            const expected = (Number(d.expected) / max) * 100
            const collected = (Number(d.collected) / max) * 100
            const date = dateOf(d.date)
            return (
              <button
                key={d.date}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`${long(d.date)}: ${rd(d.collected)} de ${rd(d.expected)}`}
                onClick={() => setPicked(d.date)}
                className={`group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5 rounded-lg px-0.5 pb-1 pt-2 outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                  on ? 'bg-brand-50' : 'hover:bg-surface-2'
                }`}
              >
                <span className="relative flex w-full max-w-9 flex-1 items-end">
                  <span
                    className="absolute inset-x-0 bottom-0 origin-bottom animate-grow-y rounded-t-md bg-brand-100"
                    style={{ height: `${expected}%`, animationDelay: `${index * 20}ms` }}
                  />
                  <span
                    className={`absolute inset-x-1 bottom-0 origin-bottom animate-grow-y rounded-t-[5px] transition-colors ${
                      on ? 'bg-brand-700' : 'bg-brand-700/55 group-hover:bg-brand-700/75'
                    }`}
                    style={{ height: `${collected}%`, animationDelay: `${index * 20 + 120}ms` }}
                  />
                </span>
                <span
                  className={`text-[11px] leading-tight whitespace-nowrap ${on ? 'font-semibold text-ink' : 'text-muted'}`}
                >
                  {days.length <= 16 ? `${WEEKDAY[date.getDay()]} ` : ''}
                  {date.getDate()}
                </span>
                {days.length <= 16 ? (
                  <span className="text-[10.5px] text-muted">
                    {d.recovery ? pct(d.recovery, 0) : '—'}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}

const COLUMNS =
  'grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.6fr)_minmax(0,0.7fr)] items-center gap-x-4'

/** «Por ruta»: each collector's collection against his stops. */
function ByRoute({ report }: { report: CollectionsReport }) {
  return (
    <section className="overflow-hidden rounded-card border border-edge bg-surface shadow-sm">
      <h2 className="px-5 py-4 text-[16px] font-semibold">Por ruta</h2>
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div
            className={`${COLUMNS} border-y border-edge bg-surface-2 px-5 py-2 text-[12px] font-medium text-muted`}
          >
            <span>Ruta · cobrador</span>
            <span className="text-right">Cobrado</span>
            <span className="text-right">Esperado</span>
            <span className="text-right">Visitas</span>
            <span>Recuperación</span>
            <span className="text-right">Promesas</span>
          </div>
          <ul className="divide-y divide-edge">
            {report.routes.map((route) => {
              const ratio = route.recovery === null ? null : Number(route.recovery)
              const ok = ratio !== null && ratio >= GOAL
              return (
                <li key={route.id} className={`${COLUMNS} px-5 py-3 text-[13px]`}>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{route.name}</span>
                    <span className="block text-[12px] text-muted">Ruta del cobrador</span>
                  </span>
                  <span className="text-right font-semibold tabular-nums">
                    {rd(route.collected)}
                  </span>
                  <span className="text-right text-muted tabular-nums">{rd(route.expected)}</span>
                  <span className="text-right tabular-nums">
                    {route.visited} de {route.stops}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-edge">
                      <span
                        className={`block h-full origin-left animate-grow-x rounded-full ${ok ? 'bg-brand-700' : 'bg-warning-700'}`}
                        style={{ width: `${Math.min(ratio ?? 0, 1) * 100}%` }}
                      />
                    </span>
                    <span
                      className={`w-12 text-right font-semibold tabular-nums ${ok ? 'text-brand-700' : 'text-warning-700'}`}
                    >
                      {ratio === null ? '—' : pct(ratio, 0)}
                    </span>
                  </span>
                  <span className="text-right tabular-nums">{route.promises}</span>
                </li>
              )
            })}
            <li className={`${COLUMNS} px-5 py-3 text-[13px]`}>
              <span className="min-w-0">
                <span className="block font-semibold">Caja oficina</span>
                <span className="block text-[12px] text-muted">Pagos en la sucursal</span>
              </span>
              <span className="text-right font-semibold tabular-nums">{rd(report.office)}</span>
              <span className="text-right text-muted">—</span>
              <span className="text-right text-muted">—</span>
              <span className="text-muted">Sin esperado propio</span>
              <span className="text-right text-muted">—</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  )
}

/** P64 «Cobros» (decision 115): what came in against what fell due, the four
 * figures of the period, day by day and by route. */
export function CollectionsReportPage() {
  useDocumentTitle('Cobros')
  const [preset, setPreset] = useState<Preset>('mes')
  const [custom, setCustom] = useState(() => rangeOf('mes'))
  const range = preset === 'otro' ? custom : rangeOf(preset)
  const report = useQuery({
    queryKey: ['report-collections', range],
    queryFn: () => getCollectionsReport(range),
    placeholderData: keepPreviousData,
  })
  const data = report.data
  const recovery = data?.recovery === null || data === undefined ? null : Number(data.recovery)
  const change =
    data?.previous_daily_average && Number(data.previous_daily_average)
      ? Number(data.daily_average) / Number(data.previous_daily_average) - 1
      : null
  return (
    <>
      <PageHeader
        title="Cobros"
        subtitle="Lo cobrado frente a lo que vencía, por día y por ruta."
        actions={
          <Segmented
            label="Período"
            value={preset}
            onChange={setPreset}
            options={[
              { value: 'mes', label: 'Este mes' },
              { value: '7', label: '7 días' },
              { value: 'anterior', label: 'Mes pasado' },
              { value: 'otro', label: 'Otro' },
            ]}
          />
        }
      />
      {preset === 'otro' ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1.5 text-[13px] font-medium">
            <span className="block">Desde</span>
            <DateInput
              value={custom.desde}
              max={custom.hasta}
              onChange={(desde) => setCustom((value) => ({ ...value, desde }))}
              aria-label="Desde"
            />
          </label>
          <label className="space-y-1.5 text-[13px] font-medium">
            <span className="block">Hasta</span>
            <DateInput
              value={custom.hasta}
              max={todayISO()}
              onChange={(hasta) => setCustom((value) => ({ ...value, hasta }))}
              aria-label="Hasta"
            />
          </label>
        </div>
      ) : null}
      {report.isError ? <LoadError error={report.error} /> : null}
      {report.isPending ? (
        <Spinner />
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            <Kpi
              label="Cobrado"
              value={rd(data.collected)}
              hint={plural(data.days_with_activity, 'día con cobros', 'días con cobros')}
              help={data.definitions.collected}
            />
            <Kpi
              label="Esperado"
              value={rd(data.expected)}
              hint="Cuotas que vencían"
              help={data.definitions.expected}
            />
            <Kpi
              label="Recuperación"
              value={recovery === null ? '—' : pct(recovery, 1)}
              hint={
                recovery === null
                  ? 'Nada vencía'
                  : recovery >= GOAL
                    ? `Meta ${pct(GOAL, 0)} cumplida`
                    : `Meta ${pct(GOAL, 0)} · faltan ${((GOAL - recovery) * 100).toFixed(1)} pts`
              }
              help={data.definitions.recovery}
              tone={recovery !== null && recovery < GOAL ? 'warn' : undefined}
            />
            <Kpi
              label="Promedio diario"
              value={rd(data.daily_average)}
              hint={
                change === null
                  ? 'Sin período anterior para comparar'
                  : `${change >= 0 ? '+' : ''}${(change * 100).toFixed(1)} % frente al período anterior`
              }
              help={data.definitions.daily_average}
            />
          </div>
          {data.days.length ? <DayBars key={`${data.from}-${data.to}`} report={data} /> : null}
          {data.routes.length || Number(data.office) ? (
            <ByRoute report={data} />
          ) : (
            <EmptyState>Sin cobros en el período.</EmptyState>
          )}
        </>
      ) : null}
    </>
  )
}
