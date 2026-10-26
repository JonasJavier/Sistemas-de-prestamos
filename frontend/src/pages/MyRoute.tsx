import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { lazy, type ReactNode, Suspense, useEffect, useState } from 'react'

import { ApiError } from '../api/client'
import type { ActionResult } from '../api/collections'
import { listPayments } from '../api/payments'
import {
  acceptLocationConsent,
  getMyRoute,
  openRoute,
  pinCustomer,
  reorderRoute,
  sendPing,
  type MyRoute,
  type RouteStop,
} from '../api/routes'
import { ActionDialog } from '../components/ActionDialog'
import { InstallBanner } from '../components/InstallBanner'
import { buttonClass } from '../components/classes'
import { ChevronDownIcon, CollectIcon, RouteIcon } from '../components/icons'
import { Modal } from '../components/Modal'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Segmented,
  Spinner,
  Stat,
  Texture,
} from '../components/ui'
import { errorMessage, phoneText, plural, rd } from '../lib/format'
import { useDocumentTitle } from '../lib/hooks'
import { whatsappLink } from '../lib/print'
import { nextStop, stopResult, tally } from '../lib/stops'
import { notify } from '../lib/toast'

const MapView = lazy(() => import('../components/MapView'))
const PING_EVERY_MS = 5 * 60 * 1000

function currentPosition(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null)
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
      enableHighAccuracy: true,
      timeout: 10_000,
      maximumAge: 60_000,
    })
  })
}

/** Decision 031: every 5 minutes while «Mi ruta» is on screen and the route open. */
function useLocationPings(active: boolean) {
  useEffect(() => {
    if (!active) return
    const ping = async () => {
      if (document.visibilityState !== 'visible') return
      const position = await currentPosition()
      if (!position) return
      await sendPing({
        latitude: position.coords.latitude.toFixed(6),
        longitude: position.coords.longitude.toFixed(6),
        accuracy: Math.round(position.coords.accuracy),
      }).catch(() => undefined)
    }
    void ping()
    const timer = window.setInterval(() => void ping(), PING_EVERY_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void ping()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [active])
}

/** Directions to the pin, else to the address; none when neither is known
 * (an empty destination opens a blank map). */
function directions(stop: RouteStop) {
  const target =
    stop.latitude && stop.longitude ? `${stop.latitude},${stop.longitude}` : stop.address
  return target
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(target)}`
    : null
}

const lateText = (stop: RouteStop) =>
  stop.reason === 'promise'
    ? 'Promesa de hoy'
    : stop.days_past_due
      ? `${plural(stop.days_past_due, 'día')} de atraso`
      : 'Vence hoy'

/** The tools of a stop: call, WhatsApp, directions, a visit, the pin and the order. */
function StopTools({
  stop,
  first,
  last,
  onMove,
  onVisit,
  open,
}: {
  stop: RouteStop
  first: boolean
  last: boolean
  onMove: (delta: number) => void
  onVisit: () => void
  open: boolean
}) {
  const queryClient = useQueryClient()
  const pin = useMutation({
    mutationFn: async () => {
      const position = await currentPosition()
      if (!position) throw new Error('Sin ubicación')
      return pinCustomer(stop.loan_number, {
        latitude: position.coords.latitude.toFixed(6),
        longitude: position.coords.longitude.toFixed(6),
      })
    },
    onSuccess: () => {
      notify('Ubicación del cliente guardada.', 'success')
      void queryClient.invalidateQueries({ queryKey: ['my-route'] })
    },
  })
  const done = Boolean(stop.payment || stop.action)
  const mapLink = directions(stop)
  const tool = buttonClass('secondary', '!h-11 !px-2')
  return (
    <div className="space-y-2 border-t border-edge px-3.5 pb-3.5 pt-3">
      {stop.payment ? (
        <p className="text-sm text-success-600">
          Cobrado {rd(stop.payment.amount)} ·{' '}
          <Link
            to="/recibos/$numero"
            params={{ numero: stop.payment.number }}
            className="underline"
          >
            {stop.payment.number}
          </Link>
        </p>
      ) : stop.action ? (
        <p className="text-sm text-warning-700">
          {stop.action.result}
          {stop.action.note ? `: ${stop.action.note}` : ''}
        </p>
      ) : null}
      <div className="grid grid-cols-3 gap-2">
        {stop.phone ? (
          <>
            <a
              href={`tel:${stop.phone}`}
              className={tool}
              aria-label={`Llamar al ${phoneText(stop.phone)}`}
            >
              Llamar
            </a>
            <a
              href={whatsappLink(
                stop.phone,
                `Hola ${stop.customer_name.split(' ')[0]}, le escribe su cobrador.`,
              )}
              target="_blank"
              rel="noopener"
              className={tool}
            >
              WhatsApp
            </a>
          </>
        ) : null}
        {mapLink ? (
          <a href={mapLink} target="_blank" rel="noopener" className={tool}>
            Cómo llegar
          </a>
        ) : null}
        {open && !stop.payment ? (
          <Link
            to="/cobrar/$numero"
            params={{ numero: stop.loan_number }}
            className={buttonClass('primary', '!h-11 !px-2')}
          >
            Cobrar
          </Link>
        ) : null}
        {open && !done ? (
          <Button variant="secondary" className="!h-11 !px-2" onClick={onVisit}>
            Gestión
          </Button>
        ) : null}
        {open && !stop.latitude ? (
          <Button
            variant="secondary"
            className="!h-11 !px-2"
            onClick={() => pin.mutate()}
            disabled={pin.isPending}
          >
            Fijar ubicación
          </Button>
        ) : null}
      </div>
      {open ? (
        <div className="flex justify-end gap-1 text-[12.5px]">
          <button
            type="button"
            className="rounded px-2 py-1 text-muted hover:bg-brand-100 disabled:opacity-40"
            disabled={first}
            onClick={() => onMove(-1)}
          >
            ↑ Subir
          </button>
          <button
            type="button"
            className="rounded px-2 py-1 text-muted hover:bg-brand-100 disabled:opacity-40"
            disabled={last}
            onClick={() => onMove(1)}
          >
            ↓ Bajar
          </button>
        </div>
      ) : null}
    </div>
  )
}

/** A stop in the list: number, who, where and what is owed; it unfolds into
 * its tools. */
function StopRow({
  stop,
  next,
  children,
}: {
  stop: RouteStop
  next: RouteStop | undefined
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const result = stopResult(stop, next)
  return (
    <li className="overflow-hidden rounded-card border border-edge bg-surface shadow-sm">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="press flex w-full items-center gap-3 px-3.5 py-3 text-left outline-none focus-visible:bg-brand-50"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-[12px] font-semibold text-muted tabular-nums">
          {stop.position}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">{stop.customer_name}</span>
          <span className="block truncate text-[12px] text-muted">
            Préstamo {stop.loan_number}
            {stop.address ? ` · ${stop.address}` : ''}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[14px] font-semibold tabular-nums">
            {rd(stop.amount_due)}
          </span>
          {stop.payment || stop.action ? (
            <Badge tone={result.tone} dot>
              {result.label}
            </Badge>
          ) : (
            <span
              className={`block text-[11.5px] ${stop.days_past_due ? 'text-warning-700' : 'text-muted'}`}
            >
              {lateText(stop)}
            </span>
          )}
        </span>
        <ChevronDownIcon
          className={`size-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? children : null}
    </li>
  )
}

function Consent({ data }: { data: MyRoute }) {
  const queryClient = useQueryClient()
  const accept = useMutation({
    mutationFn: acceptLocationConsent,
    onSuccess: (route) => queryClient.setQueryData(['my-route'], route),
  })
  return (
    <Card className="max-w-xl space-y-3">
      <h2 className="text-base font-semibold">Antes de tu primera ruta</h2>
      <p className="text-sm">{data.consent_text}</p>
      <Button onClick={() => accept.mutate()} disabled={accept.isPending}>
        Acepto
      </Button>
    </Card>
  )
}

function Summary({ data, onClose }: { data: MyRoute; onClose: () => void }) {
  const payments = useQuery({
    queryKey: ['payments', 'route', data.route?.id],
    queryFn: () => listPayments({ route_session: data.route!.id }),
    enabled: Boolean(data.route),
  })
  return (
    <Modal onClose={onClose} labelledBy="summary-title" align="bottom">
      <div className="max-h-[85vh] w-full space-y-3 overflow-y-auto rounded-t-2xl bg-surface p-5 pb-8 shadow-xl">
        <h2 id="summary-title" className="text-lg font-semibold">
          Resumen para la rendición
        </h2>
        <Stat label="Efectivo a entregar al cajero" value={rd(data.route?.cash)} emphasis />
        <ul className="divide-y divide-edge text-sm">
          {payments.data?.results.map((p) => (
            <li key={p.id} className="flex justify-between gap-2 py-1.5">
              <span>
                {p.number} · {p.customer_name}{' '}
                <span className="text-muted">({p.method_label})</span>
              </span>
              <span className="tabular-nums">{rd(p.amount)}</span>
            </li>
          ))}
        </ul>
        <p className="text-[12.5px] text-muted">
          Entrega el efectivo hoy mismo: el cajero lo cuenta y confirma. Las transferencias no se
          entregan: ya están en el banco.
        </p>
        <Button variant="secondary" className="w-full" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </Modal>
  )
}

/** P40, «Mi ruta de hoy» on the collector's phone (decision 115): how the
 * day goes, the next stop in forest with its three answers, and the rest. */
export function MyRoutePage() {
  useDocumentTitle('Mi ruta')
  const queryClient = useQueryClient()
  const route = useQuery({ queryKey: ['my-route'], queryFn: getMyRoute })
  const [view, setView] = useState<'list' | 'map'>('list')
  const [visiting, setVisiting] = useState<{ stop: RouteStop; result: ActionResult | '' } | null>(
    null,
  )
  const [summary, setSummary] = useState(false)
  const data = route.data
  const isOpen = data?.route?.status === 'open' && !data.route.stale
  useLocationPings(Boolean(isOpen))
  const open = useMutation({
    meta: { inlineError: true },
    mutationFn: () => openRoute(),
    onSuccess: (next) => {
      queryClient.setQueryData(['my-route'], next)
      void queryClient.invalidateQueries({ queryKey: ['me'] })
    },
  })
  const reorder = useMutation({
    mutationFn: reorderRoute,
    onSuccess: (next) => queryClient.setQueryData(['my-route'], next),
  })
  if (route.isPending) return <Spinner />
  if (!data) return <Alert tone="danger">No se pudo cargar tu ruta.</Alert>
  const move = (index: number, delta: number) => {
    const order = data.stops.map((s) => s.loan_number)
    const [item] = order.splice(index, 1)
    order.splice(index + delta, 0, item)
    reorder.mutate(order)
  }
  const next = nextStop(data.stops)
  const counts = tally(data.stops)
  const expected = data.stops.reduce((sum, stop) => sum + Number(stop.amount_due), 0)
  const collected = Number(data.route?.collected ?? 0)
  const share = expected > 0 ? Math.min(collected / expected, 1) : 0
  const status = !data.route
    ? { label: 'Sin abrir', tone: 'neutral' }
    : data.route.status === 'settled'
      ? { label: 'Rendida', tone: 'brand' }
      : { label: 'En la calle', tone: 'info' }
  const after = data.stops.filter((stop) => stop !== next && !stop.payment && !stop.action)
  const done = data.stops.filter((stop) => stop.payment || stop.action)
  const tools = (stop: RouteStop) => {
    const index = data.stops.indexOf(stop)
    return (
      <StopTools
        stop={stop}
        first={index === 0}
        last={index === data.stops.length - 1}
        onMove={(delta) => move(index, delta)}
        onVisit={() => setVisiting({ stop, result: '' })}
        open={Boolean(isOpen)}
      />
    )
  }

  return (
    <>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12.5px] text-muted first-letter:uppercase">
            {new Date(`${data.date}T00:00:00`).toLocaleDateString('es-DO', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </p>
          <h1 className="text-[26px] leading-tight sm:text-[30px]">Mi ruta de hoy</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={status.tone} dot>
            {status.label}
          </Badge>
          {isOpen ? (
            <Button variant="secondary" size="sm" onClick={() => setSummary(true)}>
              Cerrar ruta
            </Button>
          ) : null}
        </div>
      </div>
      <InstallBanner />

      {!data.consent ? (
        <Consent data={data} />
      ) : !data.route ? (
        <Card className="space-y-2">
          <p className="text-sm">
            Abre tu ruta para cobrar en efectivo. Mientras esté abierta y en pantalla, el celular
            envía su ubicación cada 5 minutos.
          </p>
          {open.error instanceof ApiError ? (
            <Alert tone="danger">{errorMessage(open.error.data)}</Alert>
          ) : null}
          <Button
            className="w-full !h-12 sm:w-auto"
            onClick={() => open.mutate()}
            disabled={open.isPending}
          >
            <RouteIcon className="size-[18px] shrink-0" />
            Abrir mi ruta de hoy
          </Button>
        </Card>
      ) : data.route.stale ? (
        <Alert tone="danger">
          Tu ruta de un día anterior no se ha rendido: entrega el efectivo al cajero antes de
          seguir.
        </Alert>
      ) : data.route.status === 'settled' ? (
        <Card className="space-y-2">
          <Alert tone="success">Ruta rendida. ¡Buen trabajo!</Alert>
          <p className="text-sm text-muted">
            ¿Sales de nuevo hoy? Abre otra ruta: el efectivo que cobres se rinde aparte.
          </p>
          <Button variant="secondary" onClick={() => open.mutate()} disabled={open.isPending}>
            Abrir mi ruta de hoy
          </Button>
        </Card>
      ) : null}

      {/* How the day goes. */}
      <section className="rounded-card border border-edge bg-surface px-[18px] py-4 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="font-display text-[26px] font-bold tracking-[-0.025em]">
            {rd(collected)}
          </span>
          <span className="text-[12.5px] text-muted">de {rd(expected)}</span>
        </div>
        <div className="mt-2 h-[7px] overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-edge">
          <div
            className="h-full origin-left animate-grow-x rounded-full bg-brand-700"
            style={{ width: `${share * 100}%` }}
          />
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-[12px] text-muted">
          <span>
            {counts.visited} de {data.stops.length} visitas
          </span>
          <span>
            {plural(counts.paid, 'pago')} · {plural(counts.promised, 'promesa')} · {counts.notHome}{' '}
            no estaba
          </span>
        </div>
        {data.route?.status === 'open' ? (
          <div className="mt-3 flex justify-between border-t border-edge pt-2.5 text-[13px]">
            <span className="text-muted">Efectivo en mano</span>
            <span className="font-semibold tabular-nums">{rd(data.route.cash)}</span>
          </div>
        ) : null}
      </section>

      {/* The next stop, with its three answers. */}
      {next ? (
        <ul aria-label="Siguiente parada">
          <li className="relative overflow-hidden rounded-card bg-brand-950 px-[18px] py-4 text-on-forest shadow-lg">
            <Texture tone="forest" />
            <div className="relative">
              <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-200">
                <span>Siguiente · parada {next.position}</span>
                {directions(next) ? (
                  <a
                    href={directions(next)!}
                    target="_blank"
                    rel="noopener"
                    className="normal-case tracking-normal text-on-forest underline-offset-2 hover:underline"
                  >
                    Cómo llegar ↗
                  </a>
                ) : null}
              </div>
              <div className="mt-1.5 font-display text-[22px] font-bold leading-tight">
                {next.customer_name}
              </div>
              <div className="text-[12.5px] text-brand-200">
                Préstamo {next.loan_number}
                {next.address ? ` · ${next.address}` : ''}
              </div>
              <dl className="mt-3 flex gap-6 text-[11.5px] text-brand-200">
                <div>
                  <dt>Cuota</dt>
                  <dd className="font-display text-[16px] font-bold text-on-forest">
                    {rd(next.amount_due)}
                  </dd>
                </div>
                <div>
                  <dt>Atraso</dt>
                  <dd className="font-display text-[16px] font-bold text-on-forest">
                    {next.days_past_due ? plural(next.days_past_due, 'día') : 'Al día'}
                  </dd>
                </div>
              </dl>
              {isOpen ? (
                <div className="mt-3.5 grid grid-cols-[1.3fr_1fr_1fr] gap-2">
                  <Link
                    to="/cobrar/$numero"
                    params={{ numero: next.loan_number }}
                    className="press press-down flex h-11 items-center justify-center gap-2 rounded-[10px] bg-forest-accent text-[14px] font-semibold text-on-forest-accent"
                  >
                    <CollectIcon className="size-[18px] shrink-0" />
                    Cobrar
                  </Link>
                  <button
                    type="button"
                    onClick={() => setVisiting({ stop: next, result: 'promised' })}
                    className="press press-down h-11 rounded-[10px] bg-white/10 text-[13.5px] font-semibold ring-1 ring-inset ring-white/15 hover:bg-white/15"
                  >
                    Prometió
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisiting({ stop: next, result: 'not_home' })}
                    className="press press-down h-11 rounded-[10px] bg-white/10 text-[13.5px] font-semibold ring-1 ring-inset ring-white/15 hover:bg-white/15"
                  >
                    No estaba
                  </button>
                </div>
              ) : null}
            </div>
          </li>
        </ul>
      ) : null}

      {data.stops.length === 0 ? (
        <EmptyState>Hoy no tienes cobros pendientes en tu cartera.</EmptyState>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[16px] font-semibold">
              {view === 'map' ? 'Mapa' : 'Después'}
              {view === 'list' && after.length ? (
                <span className="ml-2 text-[12.5px] font-normal text-muted">
                  {plural(after.length, 'más', 'más')}
                </span>
              ) : null}
            </h2>
            <Segmented
              label="Vista"
              value={view}
              onChange={setView}
              options={[
                { value: 'list', label: 'Lista' },
                { value: 'map', label: 'Mapa' },
              ]}
            />
          </div>
          {view === 'list' ? (
            <>
              {after.length ? (
                <ul className="space-y-2">
                  {after.map((stop) => (
                    <StopRow key={stop.loan_number} stop={stop} next={next}>
                      {tools(stop)}
                    </StopRow>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-muted">
                  {next ? 'Solo queda la parada de arriba.' : 'Ya visitaste todas tus paradas.'}
                </p>
              )}
              {next ? (
                <details className="rounded-card border border-edge bg-surface shadow-sm">
                  <summary className="cursor-pointer px-3.5 py-3 text-[13px] font-semibold">
                    Herramientas de la parada {next.position}
                  </summary>
                  {tools(next)}
                </details>
              ) : null}
              {done.length ? (
                <>
                  <h2 className="pt-2 text-[16px] font-semibold">
                    Hechas
                    <span className="ml-2 text-[12.5px] font-normal text-muted">{done.length}</span>
                  </h2>
                  <ul className="space-y-2">
                    {done.map((stop) => (
                      <StopRow key={stop.loan_number} stop={stop} next={next}>
                        {tools(stop)}
                      </StopRow>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          ) : (
            <Suspense fallback={<Spinner label="Cargando el mapa…" />}>
              <MapView
                points={data.stops
                  .filter((s) => s.latitude && s.longitude)
                  .map((s) => ({
                    lat: Number(s.latitude),
                    lng: Number(s.longitude),
                    label: `${s.position}. ${s.customer_name} · ${rd(s.amount_due)}`,
                    kind: s.payment ? 'payment' : 'stop',
                  }))}
              />
              <p className="text-[12.5px] text-muted">
                Solo aparecen los clientes con ubicación. Usa «Fijar ubicación» en la visita para
                agregar los que faltan.
              </p>
            </Suspense>
          )}
        </>
      )}
      {visiting ? (
        <ActionDialog
          loanNumber={visiting.stop.loan_number}
          customerName={visiting.stop.customer_name}
          suggestedAmount={visiting.stop.amount_due}
          defaultKind="visit"
          defaultResult={visiting.result}
          sheet
          withLocation
          onClose={() => setVisiting(null)}
        />
      ) : null}
      {summary ? <Summary data={data} onClose={() => setSummary(false)} /> : null}
    </>
  )
}
