import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  closeCash,
  getMyCash,
  getSettlement,
  moveCash,
  openCash,
  receiveHandover,
  settleRoute,
  type CashSession,
  type MyCash,
  type RouteToSettle,
} from '../api/cash'
import type { Me } from '../api/accounts'
import { ApiError } from '../api/client'
import { listReasons } from '../api/origination'
import { PaymentList } from '../components/PaymentList'
import { CashDifferences } from '../components/CashDifferences'
import { ExpenseDialog } from '../components/ExpenseDialog'
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
  Texture,
} from '../components/ui'
import { ArrowsIcon, InvoiceIcon } from '../components/icons'
import { amountValue, errorMessage, moment, num, plural, rd, toAmount } from '../lib/format'
import { notify } from '../lib/toast'

const METHOD_LABEL: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencias',
  deposit: 'Depósitos',
  check: 'Cheques',
}

/** A drawer never takes a negative amount. */
const toMoney = (value: string) => (amountValue(value) >= 0 ? toAmount(value) : '')

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
      openCash({
        branch,
        amount: toMoney(amount) || '0',
        fund_from: amountValue(amount) ? from : null,
      }),
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
          <Select
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            disabled={!amountValue(amount)}
          >
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
      <div className="w-full max-w-md space-y-3 rounded-2xl bg-surface p-5 shadow-xl">
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
  const [partial, setPartial] = useState(false)
  const [delivered, setDelivered] = useState('')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const expected = Number(detail.data?.expected ?? route.expected)
  const diff = !partial && toMoney(delivered) ? Number(toMoney(delivered)) - expected : 0
  const handover = useMutation({
    meta: { inlineError: true },
    mutationFn: () => receiveHandover(route.id, toMoney(delivered)),
    onSuccess: (result) => {
      notify(`Entrega parcial recibida; el cobrador sigue con ${rd(result.carried)}.`, 'success')
      refresh()
      onClose()
    },
  })
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
      <div className="max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-2xl bg-surface p-5 shadow-xl">
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
        {detail.data?.handovers.length ? (
          <p className="text-[12.5px] text-muted">
            Ya dejó{' '}
            {detail.data.handovers
              .map((h) => `${rd(h.amount)} (${moment(h.at)}, ${h.received_by_name ?? '—'})`)
              .join(' · ')}
            .
          </p>
        ) : null}
        <div role="radiogroup" aria-label="Tipo de entrega" className="grid grid-cols-2 gap-2">
          {[
            { value: false, label: 'Rendición final', hint: 'Cierra la ruta del día' },
            { value: true, label: 'Entrega parcial', hint: 'La ruta sigue abierta' },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              role="radio"
              aria-checked={partial === option.value}
              onClick={() => setPartial(option.value)}
              className={`rounded-lg border px-3 py-2 text-left text-sm ${
                partial === option.value
                  ? 'border-brand-700 bg-brand-100 font-medium'
                  : 'border-edge hover:bg-surface-2'
              }`}
            >
              {option.label}
              <span className="block text-[12px] font-normal text-muted">{option.hint}</span>
            </button>
          ))}
        </div>
        <Stat
          label={partial ? 'Efectivo que lleva' : 'Efectivo que debe entregar'}
          value={rd(expected)}
          emphasis
        />
        <Field label={partial ? 'Efectivo que deja ahora' : 'Efectivo contado'}>
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
        {handover.error instanceof ApiError ? (
          <Alert tone="danger">{errorMessage(handover.error.data)}</Alert>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          {partial ? (
            <Button
              onClick={() => handover.mutate()}
              disabled={
                !toMoney(delivered) || Number(toMoney(delivered)) > expected || handover.isPending
              }
            >
              Recibir entrega parcial
            </Button>
          ) : (
            <Button
              onClick={() => settle.mutate()}
              disabled={
                !toMoney(delivered) || (diff !== 0 && (!reason || !note.trim())) || settle.isPending
              }
            >
              Confirmar recepción
            </Button>
          )}
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
        return_to: amountValue(returnAmount) ? returnTo : null,
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
      <div className="max-h-[92vh] w-full max-w-xl space-y-3 overflow-y-auto rounded-2xl bg-surface p-5 shadow-xl">
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
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Stat label="Esperado" value={rd(expected)} />
          <Stat label="Contado" value={rd(counted)} emphasis />
          <Stat
            label="Diferencia"
            value={rd(diff)}
            danger={diff !== 0}
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
              disabled={!amountValue(returnAmount)}
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
          {rd(Math.max(counted - amountValue(returnAmount), 0))}.
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

/** Fund + in − out = expected (F7, decision 116): the figure of the drawer in
 * big with the sum under it, and what came in by each method beside it. */
function DrawerFigures({ session, live }: { session: CashSession; live: boolean }) {
  const movements = session.movements ?? []
  const sum = (key: 'in' | 'out') => movements.reduce((total, m) => total + Number(m[key] ?? 0), 0)
  // The opening fund is the session's first line in: it is shown on its own.
  const fund = Number(session.carried_over) + Number(session.funded_amount)
  const incoming = sum('in') - Number(session.funded_amount)
  const methods = Object.entries(session.by_method)
  const [units, cents = '00'] = rd(session.expected).replace('RD$ ', '').split('.')
  return (
    <section className="relative grid overflow-hidden rounded-[18px] border border-edge bg-surface shadow-sm md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <Texture tone="sand" />
      <div className="relative px-5 py-5 sm:px-7 md:border-r md:border-edge">
        {/* Label and figure alone in their box: what reads the drawer reads just these. */}
        <div>
          <span className="flex items-center gap-2 text-[13px] font-medium text-muted">
            <span
              aria-hidden
              className={`size-[7px] shrink-0 rounded-full bg-brand-700 ${live ? 'animate-live' : ''}`}
            />
            Esperado en caja
          </span>
          <div className="mt-1 flex items-baseline gap-1.5 font-display tracking-[-0.035em]">
            <span className="text-[18px] font-semibold text-muted sm:text-[22px]">RD$</span>
            <span className="text-[40px] leading-[1.05] font-bold tabular-nums sm:text-[52px]">
              {units}
            </span>
            <span className="text-lg font-semibold text-muted sm:text-2xl">.{cents}</span>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-edge pt-3 text-[12.5px]">
          <div>
            <dt className="text-muted">Fondo de apertura</dt>
            <dd className="font-semibold tabular-nums">{rd(fund)}</dd>
          </div>
          <div>
            <dt className="text-muted">+ Entradas</dt>
            <dd className="font-semibold tabular-nums text-success-600">{rd(incoming)}</dd>
          </div>
          <div>
            <dt className="text-muted">− Salidas</dt>
            <dd className="font-semibold tabular-nums">{rd(sum('out'))}</dd>
          </div>
        </dl>
        {Number(session.carried_over) ? (
          <p className="mt-2 text-[12px] text-muted">
            {rd(session.carried_over)} de la caja anterior + {rd(session.funded_amount)} recibido.
          </p>
        ) : null}
      </div>
      <div className="relative border-t border-edge px-5 py-5 sm:px-7 md:border-t-0">
        <div className="eyebrow mb-2">Cobrado en esta caja</div>
        {methods.length ? (
          <ul className="divide-y divide-edge text-[13.5px]">
            {methods.map(([method, total]) => (
              <li key={method} className="flex items-center justify-between gap-3 py-2">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`size-2 rounded-full ${method === 'cash' ? 'bg-brand-700' : 'bg-info-700'}`}
                  />
                  {METHOD_LABEL[method] ?? method}
                  <span className="text-[12px] text-muted">{plural(total.count, 'cobro')}</span>
                </span>
                <span className="font-semibold tabular-nums">{rd(total.amount)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted">Sin cobros todavía.</p>
        )}
        <p className="mt-2 text-[12px] text-muted">Solo el efectivo entra al cajón.</p>
      </div>
    </section>
  )
}

/** P50: my drawer — open it with a fund, see the day, receive the collectors,
 * count and close (F7). */
export function MyCashPage({ me }: { me: Me }) {
  const cash = useQuery({ queryKey: ['my-cash'], queryFn: getMyCash })
  const [dialog, setDialog] = useState<'move' | 'close' | 'petty' | null>(null)
  const [settling, setSettling] = useState<RouteToSettle | null>(null)
  const session = cash.data?.session ?? null
  if (cash.isPending) return <Spinner />
  const data = cash.data
  if (!data) return <Alert tone="danger">No se pudo cargar tu caja.</Alert>
  const stale = session && session.business_date < data.today

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            Mi caja
            {session ? (
              <Badge tone={stale ? 'danger' : 'brand'} dot>
                {stale ? 'De un día anterior' : 'Abierta'}
              </Badge>
            ) : (
              <Badge dot>Cerrada</Badge>
            )}
          </span>
        }
        documentTitle="Mi caja"
        subtitle={
          session
            ? `${session.number} · ${session.branch_name} · abierta ${moment(session.opened_at)}`
            : 'Sin caja abierta. Ábrela con su fondo para cobrar y desembolsar en efectivo.'
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
              Esta caja es de un día anterior: ciérrala con su arqueo y abre la de hoy. Hasta
              entonces no cobra, no desembolsa ni recibe rendiciones.
            </Alert>
          ) : null}
          <DrawerFigures session={session} live={!stale} />
          {stale ? null : (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setDialog('move')}>
                <ArrowsIcon className="size-[18px] shrink-0" />
                Depositar o trasladar
              </Button>
              <Button variant="secondary" onClick={() => setDialog('petty')}>
                <InvoiceIcon className="size-[18px] shrink-0" />
                Gasto menor
              </Button>
            </div>
          )}

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 space-y-4">
              <section className="overflow-hidden rounded-card border border-edge bg-surface shadow-sm">
                <h2 className="px-5 py-3.5 text-[16px] font-semibold">Movimientos de efectivo</h2>
                {session.movements?.length ? (
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Hora</th>
                          <th>Tipo</th>
                          <th className="hidden sm:table-cell">Detalle</th>
                          <th className="hidden text-right sm:table-cell">Entra</th>
                          <th className="hidden text-right sm:table-cell">Sale</th>
                          {/* A phone has room for one signed amount, not two columns. */}
                          <th className="text-right sm:hidden">RD$</th>
                        </tr>
                      </thead>
                      <tbody>
                        {session.movements.map((m, i) => (
                          <tr key={i} className="align-top">
                            <td className="whitespace-nowrap text-muted">
                              {new Date(m.at).toLocaleTimeString('es-DO', { timeStyle: 'short' })}
                            </td>
                            <td>
                              <div className="whitespace-nowrap font-medium">{m.kind}</div>
                              {/* On a phone the detail goes under the type, not off screen. */}
                              <div className="text-[12px] text-muted sm:hidden">
                                {m.description}
                              </div>
                            </td>
                            <td className="hidden text-muted sm:table-cell" title={m.description}>
                              <div className="max-w-[18rem] truncate">{m.description}</div>
                            </td>
                            <td className="hidden whitespace-nowrap text-right font-medium text-success-600 sm:table-cell">
                              {m.in ? rd(m.in) : ''}
                            </td>
                            <td className="hidden whitespace-nowrap text-right font-medium sm:table-cell">
                              {m.out ? rd(m.out) : ''}
                            </td>
                            <td
                              className={`whitespace-nowrap text-right font-medium sm:hidden ${m.out ? 'text-danger-600' : 'text-success-600'}`}
                            >
                              {m.in ? `+${num(m.in)}` : `−${num(m.out)}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="px-5 pb-5">
                    <EmptyState>Aún no hay movimientos en esta caja.</EmptyState>
                  </div>
                )}
              </section>

              <Card className="space-y-2">
                <h2 className="text-[16px] font-semibold">Recibos de esta caja</h2>
                <PaymentList
                  filter={{ cash_session: session.id }}
                  queryKey={['payments', 'session', session.id]}
                  describe={(p) => `${p.customer_name} · ${p.method_label}`}
                  empty="Sin cobros todavía."
                />
              </Card>
            </div>

            <aside className="space-y-4">
              <section
                className={`relative overflow-hidden rounded-card px-5 py-4 shadow-sm ${
                  data.routes_to_settle.length
                    ? 'bg-brand-950 text-on-forest'
                    : 'border border-edge bg-surface'
                }`}
              >
                {data.routes_to_settle.length ? <Texture tone="forest" /> : null}
                <div className="relative">
                  <h2
                    className={`flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] ${
                      data.routes_to_settle.length ? 'text-brand-200' : 'text-muted'
                    }`}
                  >
                    <span aria-hidden className="size-1.5 rounded-full bg-gold-500" />
                    Rendiciones por recibir
                  </h2>
                  {data.routes_to_settle.length ? (
                    <ul className="mt-2 divide-y divide-white/10">
                      {data.routes_to_settle.map((route) => (
                        <li
                          key={route.id}
                          className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                        >
                          <span className="min-w-0">
                            <span className="block font-semibold">{route.collector_name}</span>
                            <span className="block text-[12px] text-brand-200">
                              {plural(route.payments, 'cobro')}
                              {route.business_date < data.today ? ' · de un día anterior' : ''}
                            </span>
                          </span>
                          <span className="flex items-center gap-3">
                            <span className="font-display text-[17px] font-bold tabular-nums">
                              {rd(route.expected)}
                            </span>
                            <button
                              type="button"
                              disabled={Boolean(stale)}
                              title={stale ? 'Primero cierra la caja del día anterior' : undefined}
                              onClick={() => setSettling(route)}
                              className="press press-down h-9 rounded-control bg-forest-accent px-3.5 text-[13px] font-semibold text-on-forest-accent disabled:opacity-50"
                            >
                              Recibir
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-[13px] text-muted">
                      Ningún cobrador tiene efectivo pendiente.
                    </p>
                  )}
                </div>
              </section>
              <CashDifferences me={me} mineOnly />
            </aside>
          </div>

          {dialog === 'move' ? <MoveDialog data={data} onClose={() => setDialog(null)} /> : null}
          {dialog === 'petty' ? (
            <ExpenseDialog
              kind="expense"
              fromDrawer
              branchId={session.branch}
              onClose={() => setDialog(null)}
            />
          ) : null}
          {dialog === 'close' ? (
            <CloseDialog data={data} session={session} onClose={() => setDialog(null)} />
          ) : null}
          {settling ? <SettleDialog route={settling} onClose={() => setSettling(null)} /> : null}
        </>
      )}
    </>
  )
}
