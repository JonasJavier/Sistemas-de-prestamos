import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { lazy, Suspense, useState } from 'react'

import { ApiError } from '../api/client'
import { extendHours, listWorkingHours, type HoursRow } from '../api/notifications'
import { getRouteMap, getRoutes, getRouteStops, type CollectorDay } from '../api/routes'
import { buttonClass } from '../components/classes'
import { Modal } from '../components/Modal'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Texture,
} from '../components/ui'
import { errorMessage, initials, moment, plural, rd, todayISO } from '../lib/format'
import { activityOf, nextStop, stopResult, tally } from '../lib/stops'
import { ArrowRightIcon, MapIcon } from '../components/icons'
import { notify } from '../lib/toast'
import { DateInput } from '../components/DateInput'

const MapView = lazy(() => import('../components/MapView'))

function RouteMapDialog({
  collector,
  date,
  onClose,
}: {
  collector: CollectorDay
  date: string
  onClose: () => void
}) {
  const map = useQuery({
    queryKey: ['route-map', collector.id, date],
    queryFn: () => getRouteMap(collector.id, date),
  })
  const points = map.data
    ? [
        ...map.data.pings.map((p) => ({
          lat: Number(p.lat),
          lng: Number(p.lng),
          label: new Date(p.at).toLocaleTimeString('es-DO', { timeStyle: 'short' }),
          kind: 'route' as const,
        })),
        ...map.data.visits.map((v) => ({
          lat: Number(v.lat),
          lng: Number(v.lng),
          label: `${v.result} · ${new Date(v.at).toLocaleTimeString('es-DO', { timeStyle: 'short' })}`,
          kind: 'visit' as const,
        })),
        ...map.data.payments.map((p) => ({
          lat: Number(p.lat),
          lng: Number(p.lng),
          label: `${p.number} · ${rd(p.amount)}`,
          kind: 'payment' as const,
        })),
      ]
    : []
  return (
    <Modal onClose={onClose} labelledBy="map-title">
      <div className="w-full max-w-4xl space-y-3 rounded-2xl bg-surface p-4 shadow-xl">
        <div className="flex items-center justify-between gap-2">
          <h2 id="map-title" className="text-lg font-semibold">
            Recorrido de {collector.name}
          </h2>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>
        {map.isPending ? (
          <Spinner label="Cargando el recorrido…" />
        ) : points.length ? (
          <Suspense fallback={<Spinner label="Cargando el mapa…" />}>
            <MapView points={points} trail />
          </Suspense>
        ) : (
          <EmptyState>Sin ubicaciones registradas ese día.</EmptyState>
        )}
        <p className="text-[12.5px] text-muted">
          Azul: recorrido (cada 5 min con «Mi ruta» en pantalla) · verde: cobros · ámbar: visitas.
          Los huecos son momentos con el celular bloqueado. Esta consulta queda registrada (decisión
          031).
        </p>
      </div>
    </Modal>
  )
}

function HoursCard() {
  const queryClient = useQueryClient()
  const staff = useQuery({ queryKey: ['working-hours'], queryFn: listWorkingHours })
  const [extending, setExtending] = useState<HoursRow | null>(null)
  const [minutes, setMinutes] = useState('60')
  const [note, setNote] = useState('')
  const extend = useMutation({
    meta: { inlineError: true },
    mutationFn: () => extendHours({ user: extending!.id, minutes: Number(minutes), note }),
    onSuccess: () => {
      notify('Horario extendido.', 'success')
      setExtending(null)
      setNote('')
      void queryClient.invalidateQueries({ queryKey: ['working-hours'] })
    },
  })
  if (!staff.data?.length) return null
  return (
    <Card className="space-y-2">
      <h2 className="text-base font-semibold">Horario de cajeros y cobradores</h2>
      <ul className="divide-y divide-edge text-sm">
        {staff.data.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
            <span>{row.name}</span>
            <span className="flex items-center gap-2">
              {row.extended_until ? (
                <Badge tone="info">
                  Extendido hasta{' '}
                  {new Date(row.extended_until).toLocaleTimeString('es-DO', { timeStyle: 'short' })}
                </Badge>
              ) : row.outside_hours ? (
                <Badge tone="warning">Fuera de horario</Badge>
              ) : (
                <Badge tone="success">En horario</Badge>
              )}
              <Button variant="secondary" onClick={() => setExtending(row)}>
                Extender
              </Button>
            </span>
          </li>
        ))}
      </ul>
      {extending ? (
        <Modal onClose={() => setExtending(null)} labelledBy="extend-title">
          <div className="w-full max-w-sm space-y-3 rounded-2xl bg-surface p-5 shadow-xl">
            <h2 id="extend-title" className="text-lg font-semibold">
              Extender el horario de {extending.name}
            </h2>
            <Field label="Por">
              <Select value={minutes} onChange={(e) => setMinutes(e.target.value)}>
                {[30, 60, 120, 180, 360].map((m) => (
                  <option key={m} value={m}>
                    {m < 60 ? `${m} minutos` : `${m / 60} hora${m > 60 ? 's' : ''}`}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Motivo">
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            {extend.error instanceof ApiError ? (
              <Alert tone="danger">{errorMessage(extend.error.data)}</Alert>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setExtending(null)}>
                Cancelar
              </Button>
              <Button onClick={() => extend.mutate()} disabled={!note.trim() || extend.isPending}>
                Extender
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </Card>
  )
}

/** P45: each collector's day, the cash they carry, their map, and the
 * portfolio without a collector. */
const ROUTE_STATUS = {
  open: { label: 'En la calle', className: 'bg-info-100 text-info-700' },
  settled: { label: 'Rendida', className: 'bg-brand-100 text-brand-800' },
  none: { label: 'Sin abrir', className: 'bg-surface-2 text-muted' },
} as const

const statusOf = (c: CollectorDay) => ROUTE_STATUS[c.route?.status ?? 'none']

const ratio = (collected: string, expected: string) =>
  Number(expected) > 0 ? Math.min(Number(collected) / Number(expected), 1) : 0

const DOT: Record<string, string> = {
  payment: 'bg-brand-700',
  promise: 'bg-gold-500',
  not_home: 'bg-warning-700',
  other: 'bg-info-700',
}

const STOP_COLUMNS =
  'grid grid-cols-[32px_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_72px] items-center gap-x-3'

const hour = (at: string) => new Date(at).toLocaleTimeString('es-DO', { timeStyle: 'short' })

/** One collector's day (decision 114): the strip of figures, the stops in
 * his order with their results, the live feed and what he must hand in. */
function RouteDay({
  collector,
  date,
  onMap,
}: {
  collector: CollectorDay
  date: string
  onMap: () => void
}) {
  const today = date === todayISO()
  const day = useQuery({
    queryKey: ['route-stops', collector.id, date],
    queryFn: () => getRouteStops(collector.id, date),
    refetchInterval: today ? 60_000 : false,
  })
  const data = day.data
  const stops = data?.stops ?? []
  const next = nextStop(stops)
  const counts = tally(stops)
  const feed = activityOf(stops)
  const share = data ? ratio(data.collected, data.expected) : 0
  const missing = data ? Math.max(Number(data.expected) - Number(data.collected), 0) : 0
  const live = today && collector.route?.status === 'open'
  const cells: [string, string, string, string][] = [
    ['Visitas', `${counts.visited} de ${stops.length}`, `${counts.paid} con pago`, ''],
    ['Promesas', String(counts.promised), 'Para dar seguimiento', ''],
    [
      'No estaba',
      String(counts.notHome),
      'Reprogramar visita',
      counts.notHome ? 'text-warning-700' : '',
    ],
    ['Falta', rd(missing), 'Por cobrar hoy', ''],
  ]
  return (
    <>
      <div className="grid grid-cols-2 overflow-hidden rounded-card border border-edge bg-surface shadow-sm lg:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))]">
        <div className="col-span-2 border-b border-edge px-5 py-4 lg:col-span-1 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-2 text-[12.5px] font-medium text-muted">
            <span
              aria-hidden
              className={`size-[7px] shrink-0 rounded-full bg-brand-700 ${live ? 'animate-live' : ''}`}
            />
            <span className="truncate">{collector.name} · cobrado</span>
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 font-display">
            <span className="text-[26px] font-bold tracking-[-0.025em]">
              {rd(data?.collected ?? collector.collected)}
            </span>
            <span className="text-[13px] font-medium text-muted">
              de {rd(data?.expected ?? collector.stops.expected)}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-edge">
            <div
              className="h-full origin-left animate-grow-x rounded-full bg-brand-700"
              style={{ width: `${share * 100}%` }}
            />
          </div>
        </div>
        {cells.map(([label, value, hint, tone], index) => (
          <div
            key={label}
            className={`px-5 py-4 ${index % 2 ? 'border-l border-edge' : ''} ${
              index > 1 ? 'border-t border-edge lg:border-t-0' : ''
            } ${index > 0 ? 'lg:border-l' : ''}`}
          >
            <div className="text-[12.5px] text-muted">{label}</div>
            <div className={`mt-1 font-display text-[22px] font-bold tracking-[-0.02em] ${tone}`}>
              {value}
            </div>
            <div className="text-[12px] text-muted">{hint}</div>
          </div>
        ))}
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 overflow-hidden rounded-card border border-edge bg-surface shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
            <h2 className="text-[16px] font-semibold">
              Paradas{' '}
              <span className="ml-1 text-[12.5px] font-normal text-muted">
                en el orden del cobrador
              </span>
            </h2>
            <div className="flex gap-2">
              <button type="button" className={buttonClass('secondary', '', 'sm')} onClick={onMap}>
                <MapIcon className="size-4 shrink-0" />
                Mapa
              </button>
              <Link
                to="/prestamos"
                search={{ cobrador: collector.id }}
                className={buttonClass('soft', '', 'sm')}
              >
                Cartera
              </Link>
            </div>
          </div>
          {day.isPending ? (
            <div className="px-5 pb-5">
              <Spinner />
            </div>
          ) : stops.length ? (
            <div className="overflow-x-auto">
              <div className="min-w-[620px]">
                <div
                  className={`${STOP_COLUMNS} border-y border-edge bg-surface-2 px-5 py-2 text-[12px] font-medium text-muted`}
                >
                  <span />
                  <span>Cliente</span>
                  <span className="text-right">Cuota</span>
                  <span>Resultado</span>
                  <span className="text-right">Cobrado</span>
                  <span className="text-right">Hora</span>
                </div>
                <ul className="divide-y divide-edge">
                  {stops.map((stop) => {
                    const result = stopResult(stop, next)
                    const at = stop.payment?.at ?? stop.action?.at ?? stop.visited_at
                    return (
                      <li
                        key={stop.loan_number}
                        className={`${STOP_COLUMNS} px-5 py-2.5 text-[13px] ${
                          result.next ? 'bg-brand-50' : ''
                        }`}
                      >
                        <span
                          className={`grid size-7 place-items-center rounded-full text-[12px] font-semibold tabular-nums ${
                            result.next ? 'bg-brand-700 text-on-brand' : 'bg-surface-2 text-muted'
                          }`}
                        >
                          {stop.position}
                        </span>
                        <span className="min-w-0">
                          <Link
                            to="/clientes/$id"
                            params={{ id: stop.customer_id }}
                            className="block truncate font-semibold hover:underline"
                          >
                            {stop.customer_name}
                          </Link>
                          <span className="block truncate text-[12px] text-muted">
                            {stop.address || stop.loan_number}
                          </span>
                        </span>
                        <span className="text-right">
                          <span className="block font-medium tabular-nums">
                            {rd(stop.amount_due)}
                          </span>
                          <span
                            className={`block text-[11.5px] ${
                              stop.days_past_due ? 'text-warning-700' : 'text-muted'
                            }`}
                          >
                            {stop.days_past_due
                              ? `${plural(stop.days_past_due, 'día')} de atraso`
                              : 'Al día'}
                          </span>
                        </span>
                        <span>
                          {result.next ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-950 px-2 py-0.5 text-[11px] font-semibold text-on-forest">
                              <ArrowRightIcon className="size-3 shrink-0" />
                              Siguiente
                            </span>
                          ) : (
                            <Badge tone={result.tone} dot={result.label !== 'Pendiente'}>
                              {result.label}
                            </Badge>
                          )}
                        </span>
                        <span className="text-right font-semibold tabular-nums">
                          {stop.payment ? rd(stop.payment.amount) : '—'}
                        </span>
                        <span className="whitespace-nowrap text-right text-muted tabular-nums">
                          {at ? hour(at) : '—'}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>
          ) : (
            <div className="px-5 pb-5">
              <EmptyState>
                {today
                  ? 'Las paradas aparecen cuando el cobrador abre «Mi ruta».'
                  : 'Ese día no tuvo paradas.'}
              </EmptyState>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <section className="rounded-card border border-edge bg-surface shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-edge px-5 py-3.5">
              <h2 className="text-[16px] font-semibold">Actividad</h2>
              {live ? (
                <span className="flex items-center gap-1.5 text-[12px] text-muted">
                  <span aria-hidden className="size-1.5 animate-live rounded-full bg-brand-700" />
                  en vivo
                </span>
              ) : null}
            </div>
            {feed.length ? (
              <ol className="max-h-[420px] space-y-3.5 overflow-y-auto px-5 py-4">
                {feed.map((event, index) => (
                  <li key={`${event.at}-${index}`} className="flex gap-3 text-[13px]">
                    <span
                      aria-hidden
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[event.kind]}`}
                    />
                    <span className="min-w-0">
                      <span className="block leading-snug">{event.text}</span>
                      <span className="text-[12px] text-muted">
                        {hour(event.at)} · parada {event.position}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="px-5 py-4 text-[13px] text-muted">Sin movimientos todavía.</p>
            )}
          </section>
          {data?.route ? (
            <section className="relative overflow-hidden rounded-card bg-brand-950 px-5 py-4 text-on-forest shadow-sm">
              <Texture tone="forest" />
              <div className="relative">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-200">
                  <span aria-hidden className="size-1.5 rounded-full bg-gold-500" />
                  {data.route.status === 'open' ? 'Por rendir en caja' : 'Rendida en caja'}
                </div>
                <div className="mt-1.5 font-display text-[30px] font-bold tracking-[-0.025em]">
                  {rd(data.route.status === 'open' ? data.route.cash : collector.route?.delivered)}
                </div>
                <div className="text-[12.5px] text-brand-200">
                  {data.route.status === 'open'
                    ? `en efectivo · ${rd(data.route.other_methods)} por transferencia u otros`
                    : collector.route?.difference && Number(collector.route.difference)
                      ? `Diferencia de ${rd(collector.route.difference)}`
                      : 'Cuadró sin diferencias'}
                </div>
              </div>
            </section>
          ) : null}
          <p className="px-1 text-[12.5px] text-muted">
            {collector.last_ping
              ? `Última ubicación ${moment(collector.last_ping)}`
              : 'Sin ubicación hoy'}
            {collector.off_route ? ` · ${plural(collector.off_route, 'cobro')} fuera de ruta` : ''}{' '}
            · {plural(collector.loans, 'préstamo')} en su cartera, {collector.loans_in_arrears} en
            atraso.
          </p>
        </aside>
      </div>
    </>
  )
}

/** P45, «Rutas de cobro» (decision 114): one card per route of the day (the
 * chosen one in forest) and that route followed stop by stop. */
export function RoutesPage() {
  const [date, setDate] = useState(todayISO())
  const [picked, setPicked] = useState<string | null>(null)
  const [mapFor, setMapFor] = useState<CollectorDay | null>(null)
  const routes = useQuery({
    queryKey: ['routes', date],
    queryFn: () => getRoutes(date),
    refetchInterval: date === todayISO() ? 60_000 : false,
  })
  const collectors = routes.data?.collectors ?? []
  const chosen = collectors.find((c) => c.id === picked) ?? collectors[0]
  return (
    <>
      <PageHeader
        title="Rutas de cobro"
        subtitle="Cada cobrador en la calle, parada por parada, y el efectivo por rendir."
        actions={<DateInput value={date} max={todayISO()} onChange={setDate} aria-label="Fecha" />}
      />
      {routes.data && routes.data.unassigned_loans > 0 ? (
        <Alert tone="info">
          {plural(routes.data.unassigned_loans, 'préstamo activo', 'préstamos activos')} sin
          cobrador.{' '}
          <Link to="/prestamos" search={{ cobrador: 'none' }} className="font-semibold underline">
            Asignarlos
          </Link>
        </Alert>
      ) : null}
      {routes.isPending ? (
        <Spinner />
      ) : collectors.length && chosen ? (
        <>
          <div
            role="radiogroup"
            aria-label="Ruta"
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
          >
            {collectors.map((c, index) => {
              const on = c.id === chosen.id
              const status = statusOf(c)
              const share = ratio(c.collected, c.stops.expected)
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setPicked(c.id)}
                  className={`lift relative flex animate-reveal items-center gap-3 overflow-hidden rounded-card px-4 py-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                    on
                      ? 'bg-brand-950 text-on-forest shadow-lg'
                      : 'border border-edge bg-surface shadow-sm hover:border-brand-700/35'
                  }`}
                  style={{ animationDelay: `${index * 45}ms` }}
                >
                  {on ? <Texture tone="forest" /> : null}
                  <span
                    aria-hidden
                    className={`relative grid size-9 shrink-0 place-items-center rounded-full text-[12px] font-bold ${
                      on ? 'bg-white/10 text-on-forest' : 'bg-brand-100 text-brand-800'
                    }`}
                  >
                    {initials(c.name ?? '?')}
                  </span>
                  <span className="relative min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-semibold">{c.name}</span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                          on ? 'bg-white/10 text-on-forest' : status.className
                        }`}
                      >
                        {status.label}
                      </span>
                    </span>
                    <span
                      className={`block truncate text-[12px] ${on ? 'text-brand-200' : 'text-muted'}`}
                    >
                      {c.stops.visited} de {c.stops.total} visitas · {plural(c.loans, 'préstamo')}
                    </span>
                  </span>
                  <span className="relative shrink-0 text-right">
                    <span className="block font-display text-[19px] font-bold tracking-[-0.02em]">
                      {Number(c.stops.expected) ? `${Math.round(share * 100)} %` : '—'}
                    </span>
                    <span
                      className={`block text-[12px] tabular-nums ${on ? 'text-brand-200' : 'text-muted'}`}
                    >
                      {rd(c.collected)}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
          <RouteDay
            key={chosen.id}
            collector={chosen}
            date={date}
            onMap={() => setMapFor(chosen)}
          />
        </>
      ) : (
        <EmptyState>
          No hay cobradores en tus sucursales. Invítalos desde Ajustes · Usuarios.
        </EmptyState>
      )}
      <HoursCard />
      {mapFor ? (
        <RouteMapDialog collector={mapFor} date={date} onClose={() => setMapFor(null)} />
      ) : null}
    </>
  )
}
