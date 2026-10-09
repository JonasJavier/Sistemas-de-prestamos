import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { lazy, Suspense, useState } from 'react'

import { ApiError } from '../api/client'
import { extendHours, listWorkingHours, type HoursRow } from '../api/notifications'
import { getRouteMap, getRoutes, type CollectorDay } from '../api/routes'
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
} from '../components/ui'
import { errorMessage, moment, rd, todayISO, plural } from '../lib/format'
import { notify } from '../lib/toast'

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
      <div className="w-full max-w-4xl space-y-3 rounded-xl bg-surface p-4 shadow-xl">
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
          <div className="w-full max-w-sm space-y-3 rounded-xl bg-surface p-5 shadow-xl">
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
export function RoutesPage() {
  const [date, setDate] = useState(todayISO())
  const [mapFor, setMapFor] = useState<CollectorDay | null>(null)
  const routes = useQuery({ queryKey: ['routes', date], queryFn: () => getRoutes(date) })
  return (
    <>
      <PageHeader
        title="Rutas"
        subtitle="Avance de los cobradores, efectivo en mano y rendiciones"
        actions={
          <Input
            type="date"
            value={date}
            max={todayISO()}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Fecha"
          />
        }
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
      ) : routes.data?.collectors.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {routes.data.collectors.map((c) => (
            <Card key={c.id} className="space-y-2 !p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{c.name}</div>
                  <div className="text-[12.5px] text-muted">
                    {c.loans} préstamos · {c.loans_in_arrears} en atraso
                  </div>
                </div>
                {c.route ? (
                  c.route.status === 'open' ? (
                    <Badge tone="info">Ruta abierta</Badge>
                  ) : (
                    <Badge
                      tone={c.route.difference && Number(c.route.difference) ? 'danger' : 'success'}
                    >
                      Rendida
                      {c.route.difference && Number(c.route.difference)
                        ? ` (${rd(c.route.difference)})`
                        : ''}
                    </Badge>
                  )
                ) : (
                  <Badge>Sin ruta</Badge>
                )}
              </div>
              <dl className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <dt className="text-[12px] text-muted">Visitas</dt>
                  <dd className="tabular-nums">
                    {c.stops.visited}/{c.stops.total}
                  </dd>
                </div>
                <div>
                  <dt className="text-[12px] text-muted">Cobrado</dt>
                  <dd className="tabular-nums">{rd(c.collected)}</dd>
                </div>
                <div>
                  <dt className="text-[12px] text-muted">En mano</dt>
                  <dd className="tabular-nums">{c.route ? rd(c.route.cash) : '—'}</dd>
                </div>
              </dl>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted">
                <span>
                  {c.last_ping ? `Última ubicación ${moment(c.last_ping)}` : 'Sin ubicación hoy'}
                  {c.off_route ? ` · ${plural(c.off_route, 'cobro')} fuera de ruta` : ''}
                </span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    className={buttonClass('secondary', '!h-8')}
                    onClick={() => setMapFor(c)}
                  >
                    Mapa
                  </button>
                  <Link
                    to="/prestamos"
                    search={{ cobrador: c.id }}
                    className={buttonClass('secondary', '!h-8')}
                  >
                    Cartera
                  </Link>
                </span>
              </div>
            </Card>
          ))}
        </div>
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
