import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import {
  closeCash,
  getMyCash,
  getSettlement,
  moveCash,
  openCash,
  settleRoute,
  type CashSession,
  type MyCash,
  type RouteToSettle,
} from '../api/cash'
import { ApiError } from '../api/client'
import { listReasons } from '../api/origination'
import { listPayments } from '../api/payments'
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
  Stat,
  Textarea,
} from '../components/ui'
import { errorMessage, moment, rd } from '../lib/format'
import { notify } from '../lib/toast'

const METHOD_LABEL: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencias',
  deposit: 'Depósitos',
  check: 'Cheques',
}

const toMoney = (value: string) => {
  const n = Number(value.replace(/,/g, ''))
  return Number.isFinite(n) && n >= 0 ? n.toFixed(2) : ''
}

function useRefreshCash() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['my-cash'] })
    void queryClient.invalidateQueries({ queryKey: ['me'] })
  }
}

function OpenForm({ data }: { data: MyCash }) {
  const refresh = useRefreshCash()
  const [branch, setBranch] = useState(data.branches[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [from, setFrom] = useState(data.accounts[0]?.id ?? '')
  const open = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      openCash({ branch, amount: toMoney(amount) || '0', fund_from: Number(amount) ? from : null }),
    onSuccess: refresh,
  })
  return (
    <Card className="max-w-xl space-y-3">
      <h2 className="text-base font-semibold">Abrir caja</h2>
      <p className="text-sm text-muted">
        {data.last
          ? `Tu última caja (${data.last.number}) cerró con ${rd(data.last.counted)}; lo que quedó como fondo sigue en tu caja.`
          : 'Es tu primera caja: recibe el fondo inicial desde la caja general.'}
      </p>
      {data.branches.length > 1 ? (
        <Field label="Sucursal">
          <Select value={branch} onChange={(e) => setBranch(e.target.value)}>
            {data.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fondo que recibes (RD$)">
          <Input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </Field>
        <Field label="Desde">
          <Select value={from} onChange={(e) => setFrom(e.target.value)} disabled={!Number(amount)}>
            {data.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {open.error instanceof ApiError ? (
        <Alert tone="danger">{errorMessage(open.error.data)}</Alert>
      ) : null}
      <div className="flex justify-end">
        <Button onClick={() => open.mutate()} disabled={!branch || open.isPending}>
          Abrir caja
        </Button>
      </div>
    </Card>
  )
}

function MoveDialog({ data, onClose }: { data: MyCash; onClose: () => void }) {
  const refresh = useRefreshCash()
  const [incoming, setIncoming] = useState(false)
  const [account, setAccount] = useState(data.accounts[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const move = useMutation({
    meta: { inlineError: true },
    mutationFn: () => moveCash({ account, amount: toMoney(amount), incoming, note }),
    onSuccess: () => {
      refresh()
      onClose()
    },
  })
  return (
    <Modal onClose={onClose} labelledBy="move-title">
      <div className="w-full max-w-md space-y-3 rounded-xl bg-surface p-5 shadow-xl">
        <h2 id="move-title" className="text-lg font-semibold">
          Depositar o trasladar
        </h2>
        <Field label="Movimiento">
          <Select
            value={incoming ? 'in' : 'out'}
            onChange={(e) => setIncoming(e.target.value === 'in')}
          >
            <option value="out">Sale de mi caja (depósito al banco o traslado)</option>
            <option value="in">Entra a mi caja (más fondo)</option>
          </Select>
        </Field>
        <Field label={incoming ? 'Desde' : 'Hacia'}>
          <Select value={account} onChange={(e) => setAccount(e.target.value)}>
            {data.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Monto">
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Nota (número de depósito, quién lo llevó…)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {move.error instanceof ApiError ? (
          <Alert tone="danger">{errorMessage(move.error.data)}</Alert>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => move.mutate()}
            disabled={!account || !toMoney(amount) || move.isPending}
          >
            Registrar
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function SettleDialog({ route, onClose }: { route: RouteToSettle; onClose: () => void }) {
  const refresh = useRefreshCash()
  const detail = useQuery({
    queryKey: ['settlement', route.id],
    queryFn: () => getSettlement(route.id),
  })
  const reasons = useQuery({
    queryKey: ['reasons', 'cash_difference'],
    queryFn: () => listReasons('cash_difference'),
  })
  const [delivered, setDelivered] = useState('')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const expected = Number(detail.data?.expected ?? route.expected)
  const diff = toMoney(delivered) ? Number(toMoney(delivered)) - expected : 0
  const settle = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      settleRoute(route.id, { delivered: toMoney(delivered), reason: diff ? reason : null, note }),
    onSuccess: () => {
      notify('Rendición recibida.', 'success')
      refresh()
      onClose()
    },
  })
  return (
    <Modal onClose={onClose} labelledBy="settle-title">
      <div className="max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-xl bg-surface p-5 shadow-xl">
        <h2 id="settle-title" className="text-lg font-semibold">
          Rendición de {route.collector_name}
        </h2>
        {detail.data ? (
          <ul className="max-h-48 divide-y divide-edge overflow-y-auto text-sm">
            {detail.data.payments.map((p) => (
              <li key={p.number} className="flex justify-between gap-2 py-1">
                <span>
                  {p.number} · {p.customer_name} <span className="text-muted">({p.method})</span>
                </span>
                <span className="tabular-nums">{rd(p.amount)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Spinner />
        )}
        <Stat label="Efectivo que debe entregar" value={rd(expected)} emphasis />
        <Field label="Efectivo contado">
          <Input
            inputMode="decimal"
            value={delivered}
            onChange={(e) => setDelivered(e.target.value)}
          />
        </Field>
        {diff ? (
          <>
            <Alert tone="warning">
              {diff < 0 ? 'Faltan' : 'Sobran'} {rd(Math.abs(diff))}: se justifica y se avisa al
              supervisor.
            </Alert>
            <Field label="Motivo">
              <Select value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">Elegir…</option>
                {reasons.data?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.text}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Explicación">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </>
        ) : null}
        {settle.error instanceof ApiError ? (
          <Alert tone="danger">{errorMessage(settle.error.data)}</Alert>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => settle.mutate()}
            disabled={
              !toMoney(delivered) || (diff !== 0 && (!reason || !note.trim())) || settle.isPending
            }
          >
            Confirmar recepción
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function CloseDialog({
  data,
  session,
  onClose,
}: {
  data: MyCash
  session: CashSession
  onClose: () => void
}) {
  const refresh = useRefreshCash()
  const reasons = useQuery({
    queryKey: ['reasons', 'cash_difference'],
    queryFn: () => listReasons('cash_difference'),
  })
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [returnAmount, setReturnAmount] = useState('')
  const [returnTo, setReturnTo] = useState(data.accounts.find((a) => a.kind === 'cash')?.id ?? '')
  const counted = data.denominations.reduce(
    (total, d) => total + Number(d) * (Number(counts[d]) || 0),
    0,
  )
  const expected = Number(session.expected)
  const diff = Math.round((counted - expected) * 100) / 100
  const close = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      closeCash({
        counts: Object.fromEntries(
          data.denominations.map((d) => [d, Number(counts[d]) || 0]).filter(([, q]) => q),
        ),
        reason: diff ? reason : null,
        note,
        return_to: Number(returnAmount) ? returnTo : null,
        return_amount: toMoney(returnAmount) || '0',
      }),
    onSuccess: () => {
      notify('Caja cerrada: queda pendiente de aprobación del supervisor.', 'success')
      refresh()
      onClose()
    },
  })
  return (
    <Modal onClose={onClose} labelledBy="close-title">
      <div className="max-h-[92vh] w-full max-w-xl space-y-3 overflow-y-auto rounded-xl bg-surface p-5 shadow-xl">
        <h2 id="close-title" className="text-lg font-semibold">
          Arqueo y cierre de {session.number}
        </h2>
        <p className="text-sm text-muted">Cuenta el efectivo por denominación.</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          {data.denominations.map((d) => (
            <label key={d} className="flex items-center justify-between gap-2 text-sm">
              <span className="w-16 tabular-nums">
                {Number(d) >= 50 ? 'Billete' : 'Moneda'} {d}
              </span>
              <input
                inputMode="numeric"
                aria-label={`Cantidad de ${d}`}
                value={counts[d] ?? ''}
                onChange={(e) => setCounts({ ...counts, [d]: e.target.value.replace(/\D/g, '') })}
                className="h-10 w-20 rounded-lg border border-edge bg-surface px-2 text-right tabular-nums"
              />
            </label>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Esperado" value={rd(expected)} />
          <Stat label="Contado" value={rd(counted)} emphasis />
          <Stat
            label="Diferencia"
            value={rd(diff)}
            hint={diff < 0 ? 'faltante' : diff > 0 ? 'sobrante' : 'cuadra'}
          />
        </div>
        {diff ? (
          <>
            <Field label="Motivo de la diferencia">
              <Select value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">Elegir…</option>
                {reasons.data?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.text}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Explicación">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Trasladar al cerrar (RD$)">
            <Input
              inputMode="decimal"
              value={returnAmount}
              onChange={(e) => setReturnAmount(e.target.value)}
              placeholder="0.00"
            />
          </Field>
          <Field label="Hacia">
            <Select
              value={returnTo}
              onChange={(e) => setReturnTo(e.target.value)}
              disabled={!Number(returnAmount)}
            >
              {data.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="text-[12.5px] text-muted">
          Lo que no se traslada queda en tu caja como fondo de mañana:{' '}
          {rd(Math.max(counted - (Number(returnAmount) || 0), 0))}.
        </p>
        {close.error instanceof ApiError ? (
          <Alert tone="danger">{errorMessage(close.error.data)}</Alert>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => close.mutate()}
            disabled={(diff !== 0 && (!reason || !note.trim())) || close.isPending}
          >
            Cerrar caja
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** P50: my drawer — open it with a fund, see the day, receive the collectors,
 * count and close (F7). */
export function MyCashPage() {
  const cash = useQuery({ queryKey: ['my-cash'], queryFn: getMyCash })
  const [dialog, setDialog] = useState<'move' | 'close' | null>(null)
  const [settling, setSettling] = useState<RouteToSettle | null>(null)
  const session = cash.data?.session ?? null
  const payments = useQuery({
    queryKey: ['payments', 'session', session?.id],
    queryFn: () => listPayments({ cash_session: session!.id }),
    enabled: Boolean(session),
  })
  if (cash.isPending) return <Spinner />
  const data = cash.data
  if (!data) return <Alert tone="danger">No se pudo cargar tu caja.</Alert>
  const stale = session && session.business_date < data.today

  return (
    <>
      <PageHeader
        title="Mi caja"
        subtitle={
          session
            ? `${session.number} · ${session.branch_name} · abierta ${moment(session.opened_at)}`
            : 'Sin caja abierta'
        }
        actions={
          session ? <Button onClick={() => setDialog('close')}>Arqueo y cierre</Button> : null
        }
      />
      {!session ? (
        <OpenForm data={data} />
      ) : (
        <>
          {stale ? (
            <Alert tone="danger">
              Esta caja es de un día anterior: ciérrala hoy (decisión 025) antes de seguir cobrando.
            </Alert>
          ) : null}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Esperado en caja" value={rd(session.expected)} emphasis />
            <Stat
              label="Fondo de apertura"
              value={rd(Number(session.carried_over) + Number(session.funded_amount))}
            />
            {Object.entries(session.by_method).map(([method, total]) => (
              <Stat
                key={method}
                label={`${METHOD_LABEL[method] ?? method} (${total.count})`}
                value={rd(total.amount)}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setDialog('move')}>
              Depositar o trasladar
            </Button>
          </div>

          <Card className="space-y-2">
            <h2 className="text-base font-semibold">Rendiciones por recibir</h2>
            {data.routes_to_settle.length ? (
              <ul className="divide-y divide-edge text-sm">
                {data.routes_to_settle.map((route) => (
                  <li
                    key={route.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <span>
                      <strong>{route.collector_name}</strong> · {route.payments} cobro(s)
                      {route.business_date < data.today ? (
                        <Badge tone="danger">de un día anterior</Badge>
                      ) : null}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="tabular-nums">{rd(route.expected)}</span>
                      <Button variant="secondary" onClick={() => setSettling(route)}>
                        Recibir
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Ningún cobrador tiene efectivo pendiente.</p>
            )}
          </Card>

          <Card className="space-y-2">
            <h2 className="text-base font-semibold">Movimientos de efectivo</h2>
            {session.movements?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-[12px] uppercase text-muted">
                    <tr>
                      <th className="py-1">Hora</th>
                      <th>Tipo</th>
                      <th>Detalle</th>
                      <th className="text-right">Entra</th>
                      <th className="text-right">Sale</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge">
                    {session.movements.map((m, i) => (
                      <tr key={i}>
                        <td className="py-1.5 whitespace-nowrap">
                          {new Date(m.at).toLocaleTimeString('es-DO', { timeStyle: 'short' })}
                        </td>
                        <td className="whitespace-nowrap">{m.kind}</td>
                        <td className="max-w-xs truncate text-muted" title={m.description}>
                          {m.description}
                        </td>
                        <td className="text-right tabular-nums">{m.in ? rd(m.in) : ''}</td>
                        <td className="text-right tabular-nums">{m.out ? rd(m.out) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState>Aún no hay movimientos en esta caja.</EmptyState>
            )}
          </Card>

          <Card className="space-y-2">
            <h2 className="text-base font-semibold">Recibos de esta caja</h2>
            {payments.data?.results.length ? (
              <ul className="divide-y divide-edge text-sm">
                {payments.data.results.map((p) => (
                  <li key={p.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                    <Link
                      to="/recibos/$numero"
                      params={{ numero: p.number }}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {p.number}
                    </Link>
                    <span className="text-muted">
                      {p.customer_name} · {p.method_label}
                      {p.status === 'reversed' ? ' · reversado' : ''}
                    </span>
                    <span className="tabular-nums">{rd(p.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Sin cobros todavía.</p>
            )}
          </Card>
          {dialog === 'move' ? <MoveDialog data={data} onClose={() => setDialog(null)} /> : null}
          {dialog === 'close' ? (
            <CloseDialog data={data} session={session} onClose={() => setDialog(null)} />
          ) : null}
          {settling ? <SettleDialog route={settling} onClose={() => setSettling(null)} /> : null}
        </>
      )}
    </>
  )
}
