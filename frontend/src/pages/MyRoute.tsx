import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { lazy, Suspense, useEffect, useState } from 'react'

import { ApiError } from '../api/client'
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
import { buttonClass } from '../components/classes'
import { Modal } from '../components/Modal'
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Spinner, Stat } from '../components/ui'
import { errorMessage, phoneText, rd } from '../lib/format'
import { whatsappLink } from '../lib/print'
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

function directions(stop: RouteStop) {
  const target =
    stop.latitude && stop.longitude ? `${stop.latitude},${stop.longitude}` : stop.address
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(target)}`
}

function StopCard({
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
  return (
    <li
      className={`rounded-xl border bg-surface p-4 shadow-sm ${done ? 'border-success-600/40 opacity-80' : 'border-edge'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12.5px] text-muted">
            {stop.position}. Préstamo {stop.loan_number}
          </div>
          <div className="truncate text-base font-semibold">{stop.customer_name}</div>
          <div className="text-[12.5px] text-muted">
            {stop.address || 'Sin dirección registrada'}
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold tabular-nums">{rd(stop.amount_due)}</div>
          {stop.reason === 'promise' ? (
            <Badge tone="info">Promesa de hoy</Badge>
          ) : stop.reason === 'overdue' ? (
            <Badge tone="danger">{stop.days_past_due} días</Badge>
          ) : (
            <Badge tone="warning">Vence hoy</Badge>
          )}
        </div>
      </div>
      {stop.payment ? (
        <p className="mt-2 text-sm text-success-600">
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
        <p className="mt-2 text-sm text-warning-700">
          {stop.action.result}
          {stop.action.note ? `: ${stop.action.note}` : ''}
        </p>
      ) : null}
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        <a
          href={`tel:${stop.phone}`}
          className={buttonClass('secondary', '!h-11 !px-2')}
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
          className={buttonClass('secondary', '!h-11 !px-2')}
        >
          WhatsApp
        </a>
        <a
          href={directions(stop)}
          target="_blank"
          rel="noopener"
          className={buttonClass('secondary', '!h-11 !px-2')}
        >
          Cómo llegar
        </a>
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
        <div className="mt-2 flex justify-end gap-1 text-[12.5px]">
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
          Entrega el efectivo hoy mismo (decisión 025): el cajero lo cuenta y confirma. Las
          transferencias no se entregan: ya están en el banco.
        </p>
        <Button variant="secondary" className="w-full" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </Modal>
  )
}

/** P40: the collector's day on the phone — stops, progress, map and cash. */
export function MyRoutePage() {
  const queryClient = useQueryClient()
  const route = useQuery({ queryKey: ['my-route'], queryFn: getMyRoute })
  const [view, setView] = useState<'list' | 'map'>('list')
  const [visiting, setVisiting] = useState<RouteStop | null>(null)
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
  const pending = data.progress.stops - data.progress.visited
  return (
    <>
      <PageHeader
        title="Mi ruta"
        subtitle={new Date(`${data.date}T00:00:00`).toLocaleDateString('es-DO', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
        actions={
          isOpen ? (
            <Button variant="secondary" onClick={() => setSummary(true)}>
              Cerrar ruta
            </Button>
          ) : null
        }
      />
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

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Cobrado hoy" value={rd(data.route?.collected ?? '0')} emphasis />
        <Stat
          label="Visitas"
          value={`${data.progress.visited}/${data.progress.stops}`}
          hint={pending ? `${pending} pendientes` : 'todas hechas'}
        />
        <Stat label="Efectivo en mano" value={rd(data.route?.cash ?? '0')} />
      </div>

      <div className="flex gap-2">
        {(
          [
            ['list', 'Lista'],
            ['map', 'Mapa'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={view === value}
            onClick={() => setView(value)}
            className={`h-10 flex-1 rounded-lg border text-sm font-semibold sm:flex-none sm:px-6 ${
              view === value ? 'border-brand-700 bg-brand-100' : 'border-edge bg-surface'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {data.stops.length === 0 ? (
        <EmptyState>Hoy no tienes cobros pendientes en tu cartera.</EmptyState>
      ) : view === 'list' ? (
        <ul className="space-y-3">
          {data.stops.map((stop, index) => (
            <StopCard
              key={stop.loan_number}
              stop={stop}
              first={index === 0}
              last={index === data.stops.length - 1}
              onMove={(delta) => move(index, delta)}
              onVisit={() => setVisiting(stop)}
              open={Boolean(isOpen)}
            />
          ))}
        </ul>
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
      {visiting ? (
        <ActionDialog
          loanNumber={visiting.loan_number}
          customerName={visiting.customer_name}
          suggestedAmount={visiting.amount_due}
          defaultKind="visit"
          sheet
          withLocation
          onClose={() => setVisiting(null)}
        />
      ) : null}
      {summary ? <Summary data={data} onClose={() => setSummary(false)} /> : null}
    </>
  )
}
