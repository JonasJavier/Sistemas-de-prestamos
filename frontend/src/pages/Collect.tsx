import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { type ReactNode, useEffect, useMemo, useState } from 'react'

import type { Me } from '../api/accounts'
import { ApiError } from '../api/client'
import {
  collect,
  getPaymentScreen,
  previewPayment,
  type Receipt,
  requestAuthorization,
  type Approval,
  type PaymentKind,
  type PaymentMethod,
  type PaymentRequest,
  type PaymentScreen,
} from '../api/payments'
import { buttonClass } from '../components/classes'
import { ArrowsIcon, BankIcon, CashIcon, InvoiceIcon } from '../components/icons'
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
} from '../components/ui'
import {
  day,
  errorMessage,
  moment,
  nearDay,
  newIdempotencyKey,
  num,
  plural,
  rd,
  toAmount,
} from '../lib/format'
import { useDebounced, useDocumentTitle } from '../lib/hooks'
import { ACCESS, hasRole } from '../lib/roles'
import { notify } from '../lib/toast'

const METHODS: [PaymentMethod, string, ReactNode][] = [
  ['cash', 'Efectivo', <CashIcon key="cash" className="size-[18px] shrink-0" />],
  ['transfer', 'Transferencia', <ArrowsIcon key="transfer" className="size-[18px] shrink-0" />],
  ['deposit', 'Depósito', <BankIcon key="deposit" className="size-[18px] shrink-0" />],
  ['check', 'Cheque', <InvoiceIcon key="check" className="size-[18px] shrink-0" />],
]

const money = toAmount

/** The collector's phone sends where the payment happened (decision 031). */
function usePosition(enabled: boolean) {
  const [position, setPosition] = useState<{ latitude: string; longitude: string } | null>(null)
  useEffect(() => {
    if (!enabled || !('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(
      (p) =>
        setPosition({
          latitude: p.coords.latitude.toFixed(6),
          longitude: p.coords.longitude.toFixed(6),
        }),
      () => setPosition(null),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    )
  }, [enabled])
  return position
}

interface Option {
  key: string
  label: string
  kind: PaymentKind
  amount: string
  hint?: string
}

/** «¿Cuánto paga?» (decision 114): what is late, the installment (or two),
 * settling the loan, another amount and, when allowed, a capital payment. */
function optionsOf(screen: PaymentScreen): Option[] {
  const s = screen.summary
  const pending = screen.installments
  const current = pending.find((line) => line.due_date === s.current_due_date)
  const after = current ? pending[pending.indexOf(current) + 1] : undefined
  const overdue = Number(s.overdue)
  const options: Option[] = []
  if (overdue > 0)
    options.push({ key: 'overdue', label: 'Lo vencido', kind: 'regular', amount: s.overdue })
  if (Number(s.current) > 0) {
    const upTo = (overdue + Number(s.current)).toFixed(2)
    options.push({
      key: 'current',
      label: overdue > 0 ? 'Vencido + cuota' : current ? `Cuota ${current.number}` : 'Cuota actual',
      kind: 'regular',
      amount: upTo,
      hint: s.current_due_date ? `vence ${nearDay(s.current_due_date).toLowerCase()}` : undefined,
    })
    if (after && current)
      options.push({
        key: 'two',
        label: `Cuotas ${current.number} y ${after.number}`,
        kind: 'regular',
        amount: (Number(upTo) + Number(after.total)).toFixed(2),
      })
  }
  if (screen.payoff)
    options.push({
      key: 'payoff',
      label: 'Saldar el préstamo',
      kind: 'payoff',
      amount: screen.payoff.total,
    })
  if (screen.prepayment?.allowed)
    options.push({ key: 'prepayment', label: 'Abono a capital', kind: 'prepayment', amount: '' })
  // Any typed amount is «otro monto»; its card only fills a short row.
  if (options.length < 4 || options.length === 5)
    options.push({ key: 'other', label: 'Otro monto', kind: 'regular', amount: '' })
  return options
}

function ApprovalPicker({
  approvals,
  kind,
  value,
  onChange,
}: {
  approvals: Approval[]
  kind: Approval['kind']
  value: string | null
  onChange: (id: string | null) => void
}) {
  const mine = approvals.filter((a) => a.kind === kind)
  if (!mine.length) return null
  return (
    <ul className="space-y-1 text-sm">
      {mine.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
          <span>
            {a.kind_label} hasta {rd(a.amount)} ·{' '}
            {a.status === 'approved' ? (
              <Badge tone="success">Aprobada por {a.decided_by_name}</Badge>
            ) : (
              <Badge tone="warning">Esperando autorización</Badge>
            )}
          </span>
          {a.status === 'approved' ? (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={value === a.id}
                onChange={(e) => onChange(e.target.checked ? a.id : null)}
              />
              Usarla en este cobro
            </label>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

/** The big keys of a phone: the collector types the amount with the thumb. */
function Keypad({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const press = (key: string) => {
    if (key === '⌫') return onChange(value.slice(0, -1))
    if (key === '.' && value.includes('.')) return
    const [, decimals] = value.split('.')
    if (decimals !== undefined && decimals.length >= 2) return
    onChange(value === '0' && key !== '.' ? key : value + key)
  }
  return (
    <div className="grid grid-cols-3 gap-2 sm:hidden" aria-label="Teclado del monto">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => press(key)}
          aria-label={key === '⌫' ? 'Borrar' : key === '.' ? 'Punto decimal' : key}
          className={`press press-down h-[52px] rounded-xl font-display text-[22px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
            key === '.' || key === '⌫'
              ? 'text-muted'
              : 'bg-surface shadow-xs ring-1 ring-inset ring-edge'
          }`}
        >
          {key}
        </button>
      ))}
    </div>
  )
}

const SEGMENTS = [
  { key: 'late_fee', label: 'Mora', className: 'bg-danger-600' },
  { key: 'interest', label: 'Interés', className: 'bg-gold-500' },
  { key: 'principal', label: 'Capital', className: 'bg-brand-700' },
] as const

/** «Cómo se aplica» (decision 114): the payment split as one bar (late fee,
 * interest, capital) and what remains after it. */
function HowApplied({
  result,
  order,
  method,
  children,
}: {
  result: Receipt
  order: string
  method: PaymentMethod
  children?: ReactNode
}) {
  const totals = {
    late_fee: Number(result.totals.late_fee) + Number(result.totals.charges),
    interest: Number(result.totals.interest),
    principal: Number(result.totals.principal),
  }
  const sum = totals.late_fee + totals.interest + totals.principal || 1
  return (
    <div className="space-y-3">
      <div className="flex h-2.5 origin-left animate-grow-x gap-0.5 overflow-hidden rounded-full bg-surface-2">
        {SEGMENTS.map((segment) =>
          totals[segment.key] > 0 ? (
            <span
              key={segment.key}
              className={segment.className}
              style={{ width: `${(totals[segment.key] / sum) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <dl className="divide-y divide-edge text-[13.5px]">
        {SEGMENTS.map((segment) => (
          <div key={segment.key} className="flex items-center justify-between gap-3 py-2">
            <dt className="flex items-center gap-2.5">
              <span aria-hidden className={`size-2 rounded-[2px] ${segment.className}`} />
              {segment.key === 'late_fee' && Number(result.totals.charges) > 0
                ? 'Mora y cargos'
                : segment.key === 'interest'
                  ? 'Interés'
                  : segment.label}
            </dt>
            <dd className="font-semibold tabular-nums">{rd(totals[segment.key])}</dd>
          </div>
        ))}
      </dl>
      <dl className="space-y-1.5 rounded-lg bg-surface-2 px-3.5 py-3 text-[13px]">
        {Number(result.late_fee_waived) > 0 ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Mora condonada</dt>
            <dd className="tabular-nums">{rd(result.late_fee_waived)}</dd>
          </div>
        ) : null}
        {Number(result.discount) > 0 ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Descuento autorizado</dt>
            <dd className="tabular-nums">{rd(result.discount)}</dd>
          </div>
        ) : null}
        {method === 'cash' && Number(result.change) > 0 ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Cambio a devolver</dt>
            <dd className="font-bold tabular-nums text-brand-700">{rd(result.change)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Capital después</dt>
          <dd className="font-semibold tabular-nums">{rd(result.principal_after)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Saldo total después</dt>
          <dd className="font-semibold tabular-nums">{rd(result.owed_after)}</dd>
        </div>
      </dl>
      {children}
      <p className="text-[12px] leading-relaxed text-muted">
        Orden de aplicación:{' '}
        {order === 'proportional'
          ? 'proporcional entre interés y capital'
          : 'cargos, mora, interés y capital'}
        , desde la cuota más antigua. Lo que sobra adelanta cuotas.
      </p>
    </div>
  )
}

/** The 80 mm receipt as it will print (decision 114), with the torn edge. */
function ReceiptPreview({ result }: { result: Receipt }) {
  const row = (label: string, value: string, strong = false) => (
    <div className={`flex justify-between gap-3 ${strong ? 'font-bold' : ''}`}>
      <span>{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
  return (
    <div
      aria-label="Vista previa del recibo"
      className="mx-auto w-full max-w-[320px] drop-shadow-sm"
    >
      <div className="space-y-3 bg-surface px-5 pb-4 pt-5 font-mono text-[11.5px] leading-relaxed text-ink">
        <div className="text-center">
          <div className="font-display text-[14px] font-bold not-italic">
            {result.company.trade_name || result.company.name}
          </div>
          <div className="text-muted">
            RNC {result.company.rnc || '—'} · {result.branch.name}
          </div>
        </div>
        <div className="border-t border-dashed border-edge pt-2">
          {row('Recibo', 'vista previa')}
          {row('Fecha', moment(result.paid_at))}
          {row('Cliente', result.customer.name)}
          {row('Préstamo', result.loan.number)}
        </div>
        <div className="border-t border-dashed border-edge pt-2">
          {Number(result.totals.late_fee) ? row('Mora', num(result.totals.late_fee)) : null}
          {Number(result.totals.charges) ? row('Cargos', num(result.totals.charges)) : null}
          {row('Interés', num(result.totals.interest))}
          {row('Capital', num(result.totals.principal))}
          <div className="mt-1.5">{row('TOTAL', rd(result.amount), true)}</div>
          {row(result.method_label, result.collected_by ? `Cobra: ${result.collected_by}` : '')}
        </div>
        <div className="border-t border-dashed border-edge pt-2 text-center text-muted">
          Saldo: {num(result.owed_after)}
          <div className="mt-1 font-display text-[12px] font-bold text-ink">
            Cobrad<span className="text-gold-500">í</span>a
          </div>
        </div>
      </div>
      <div
        aria-hidden
        className="h-2.5"
        style={{
          background:
            'linear-gradient(-45deg, transparent 6px, var(--color-surface) 0) 0 0 / 12px 12px repeat-x, linear-gradient(45deg, transparent 6px, var(--color-surface) 0) 0 0 / 12px 12px repeat-x',
        }}
      />
    </div>
  )
}

/** P33 (and P41 on the collector's phone), «Registrar pago» (decision 114):
 * how much, how, and the exact split and receipt before confirming. */
export function CollectPage({ me }: { me: Me }) {
  const { numero } = useParams({ from: '/app/cobrar/$numero' })
  useDocumentTitle(`Cobrar ${numero}`)
  // Doc 06 - 4, rule 4: the collector collects his portfolio, never waives.
  const collector = hasRole(me, ACCESS.myRoute) && !hasRole(me, ACCESS.myCash)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const screen = useQuery({
    queryKey: ['payment-screen', numero],
    queryFn: () => getPaymentScreen(numero),
  })
  const [choice, setChoice] = useState('other')
  const [kind, setKind] = useState<PaymentKind>('regular')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [received, setReceived] = useState('')
  const [reference, setReference] = useState('')
  const [bank, setBank] = useState('')
  const [waiving, setWaiving] = useState(false)
  const [waive, setWaive] = useState('')
  const [waiveNote, setWaiveNote] = useState('')
  const [waiverApproval, setWaiverApproval] = useState<string | null>(null)
  const [discount, setDiscount] = useState('')
  const [discountApproval, setDiscountApproval] = useState<string | null>(null)
  const [mode, setMode] = useState<'reduce_term' | 'reduce_payment'>('reduce_term')
  const [key, setKey] = useState(newIdempotencyKey)
  const onRoute = screen.data?.destination?.kind === 'route'
  const position = usePosition(onRoute)
  // Without a drawer or a route, cash has nowhere to go (F5): only bank payments.
  const noCash = screen.data?.destination === null
  const shownMethod: PaymentMethod = noCash && method === 'cash' ? 'transfer' : method

  const request: PaymentRequest | null = useMemo(() => {
    const value = money(amount)
    if (!value || Number(value) <= 0) return null
    return {
      kind,
      amount: value,
      method: shownMethod,
      received: shownMethod === 'cash' && money(received) ? money(received) : null,
      reference,
      bank_account: shownMethod === 'cash' ? null : bank || null,
      waive: waiving ? money(waive) || '0' : '0',
      waive_note: waiving ? waiveNote : '',
      waiver_approval: waiving ? waiverApproval : null,
      discount: kind === 'payoff' ? money(discount) || '0' : '0',
      discount_approval: kind === 'payoff' ? discountApproval : null,
      prepayment_mode: kind === 'prepayment' ? mode : '',
      latitude: position?.latitude ?? null,
      longitude: position?.longitude ?? null,
    }
  }, [
    amount,
    kind,
    shownMethod,
    received,
    reference,
    bank,
    waiving,
    waive,
    waiveNote,
    waiverApproval,
    discount,
    discountApproval,
    mode,
    position,
  ])
  const debounced = useDebounced(request, 350)
  const preview = useQuery({
    queryKey: ['payment-preview', numero, debounced],
    queryFn: () => previewPayment(numero, debounced!),
    enabled: debounced !== null,
    retry: false,
    placeholderData: (previous) => previous,
  })
  const confirm = useMutation({
    meta: { inlineError: true },
    mutationFn: () => collect(numero, { ...request!, idempotency_key: key }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['loan', numero] })
      void queryClient.invalidateQueries({ queryKey: ['me'] })
      void queryClient.invalidateQueries({ queryKey: ['my-route'] })
      setKey(newIdempotencyKey())
      navigate({ to: '/recibos/$numero', params: { numero: result.number }, search: { nuevo: 1 } })
    },
  })
  const ask = useMutation({
    mutationFn: (body: {
      kind: 'waive_late_fee' | 'payoff_discount'
      amount: string
      note: string
    }) => requestAuthorization({ loan: numero, ...body }),
    onSuccess: () => {
      notify('Autorización pedida: el supervisor la verá en sus avisos.', 'success')
      void screen.refetch()
    },
  })

  if (screen.isPending) return <Spinner />
  if (screen.error || !screen.data) {
    return (
      <Alert tone="danger">
        {screen.error instanceof ApiError ? errorMessage(screen.error.data) : 'No disponible.'}
      </Alert>
    )
  }
  const data = screen.data
  const s = data.summary
  const previewError =
    preview.error instanceof ApiError
      ? (preview.error.data as { detail?: string; code?: string })
      : null
  const needsApproval = previewError?.code === 'needs_approval'
  const result = preview.isError ? null : preview.data
  // The breakdown on screen is the one of what is typed now, not of a moment ago.
  const settled = debounced === request && !preview.isPlaceholderData && !preview.isFetching
  const options = optionsOf(data)
  const pick = (option: Option) => {
    setChoice(option.key)
    setKind(option.kind)
    setAmount(option.amount)
    if (method === 'cash') setReceived('')
  }
  const type = (value: string) => {
    setAmount(value)
    if (kind === 'regular') setChoice('other')
  }
  const current = data.installments.find((line) => line.due_date === s.current_due_date)
  const loanLink = (
    <Link to="/prestamos/$numero" params={{ numero }} className="hover:underline">
      ← Préstamo {numero}
    </Link>
  )
  const change =
    shownMethod === 'cash' && money(received)
      ? Math.max(Number(money(received)) - Number(money(amount) || 0), 0)
      : 0

  if (data.loan.status !== 'active') {
    return (
      <>
        <PageHeader back={loanLink} title={`Cobrar ${numero}`} />
        <Alert tone="info">Este préstamo no está activo: no admite cobros.</Alert>
      </>
    )
  }

  const destination =
    data.destination === null ? (
      <Alert tone="warning">
        {collector ? 'No tienes la ruta abierta' : 'No tienes una caja abierta'}: solo puedes
        registrar transferencias, depósitos o cheques.{' '}
        {collector ? (
          <Link to="/ruta" className="font-semibold underline">
            Abrir mi ruta
          </Link>
        ) : hasRole(me, ACCESS.myCash) ? (
          <Link to="/caja" className="font-semibold underline">
            Abrir mi caja
          </Link>
        ) : null}
      </Alert>
    ) : data.destination.kind === 'cash_session' && data.destination.stale ? (
      <Alert tone="danger">
        Tu caja de un día anterior sigue abierta: ciérrala y abre la de hoy.
      </Alert>
    ) : (
      <p className="text-[12.5px] text-muted">
        El efectivo entra en <strong className="text-ink">{data.destination.label}</strong> (hoy:{' '}
        {rd(data.destination.cash)}).
      </p>
    )

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        <section className="overflow-hidden rounded-card border border-edge bg-surface shadow-sm">
          {/* Who pays and for which loan. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-edge px-5 py-4">
            <Avatar name={data.loan.customer_name} />
            <div className="min-w-0 flex-1 max-sm:basis-[calc(100%-3.25rem)]">
              <h1 className="eyebrow">
                Cobrar
                {current ? ` · cuota ${current.number}` : ''} · {numero}
              </h1>
              <Link
                to="/clientes/$id"
                params={{ id: data.loan.customer_id }}
                className="block truncate font-display text-[17px] font-semibold hover:underline"
              >
                {data.loan.customer_name}
              </Link>
              <p className="truncate text-[12.5px] text-muted tabular-nums">
                {data.loan.product_name}
                {s.current_due_date ? ` · vence ${day(s.current_due_date)}` : ''} · capital{' '}
                {rd(s.principal)}
              </p>
            </div>
            {s.days_past_due > 0 ? (
              <Badge tone={s.days_past_due > 30 ? 'danger' : 'warning'} dot>
                {plural(s.days_past_due, 'día')} de atraso
              </Badge>
            ) : (
              <Badge tone="brand" dot>
                Al día
              </Badge>
            )}
            <Link
              to="/prestamos/$numero"
              params={{ numero }}
              className="text-[13px] font-semibold text-brand-700 hover:underline"
            >
              Ver préstamo
            </Link>
          </div>

          <div className="space-y-5 px-5 py-5">
            {destination}
            {/* How much. */}
            <div className="space-y-2.5">
              <div className="text-[13px] font-medium">¿Cuánto paga?</div>
              <div
                role="radiogroup"
                aria-label="Cuánto paga"
                className={`grid grid-cols-2 gap-2 ${
                  options.length === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'
                }`}
              >
                {options.map((option) => {
                  const on = choice === option.key
                  return (
                    <button
                      key={option.key}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => pick(option)}
                      className={`press press-down relative rounded-[10px] border px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                        on
                          ? 'border-brand-700 bg-brand-50 ring-1 ring-inset ring-brand-700'
                          : 'border-edge bg-surface hover:border-brand-700/40 hover:bg-brand-50/60'
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`absolute right-2.5 top-2.5 grid size-4 place-items-center rounded-full border-2 ${
                          on ? 'border-brand-700' : 'border-edge'
                        }`}
                      >
                        {on ? <span className="size-2 rounded-full bg-brand-700" /> : null}
                      </span>
                      <span className="block truncate pr-5 text-[12px] text-muted">
                        {option.label}
                      </span>
                      <span className="mt-0.5 block whitespace-nowrap font-display text-[15px] font-bold tabular-nums">
                        {option.amount ? rd(option.amount) : '—'}
                      </span>
                      {option.hint ? (
                        <span className="block text-[11.5px] text-muted">{option.hint}</span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
              <label className="flex h-16 items-center gap-2 rounded-xl border-2 border-brand-700/70 bg-surface px-4 shadow-xs focus-within:border-brand-700 focus-within:ring-4 focus-within:ring-accent-500/15">
                <span className="font-display text-lg font-semibold text-muted">RD$</span>
                <span className="sr-only">
                  {kind === 'payoff' ? 'Saldo para saldar' : 'Monto a pagar'}
                </span>
                <input
                  inputMode="decimal"
                  aria-label={kind === 'payoff' ? 'Saldo para saldar' : 'Monto a pagar'}
                  value={amount}
                  onChange={(e) => type(e.target.value)}
                  readOnly={kind === 'payoff'}
                  placeholder="0.00"
                  className="min-w-0 flex-1 bg-transparent font-display text-[30px] font-bold tabular-nums tracking-[-0.02em] text-ink outline-none placeholder:text-muted/50"
                />
              </label>
              {kind !== 'payoff' ? <Keypad value={amount} onChange={type} /> : null}
              {kind === 'prepayment' ? (
                <p className="text-[12.5px] text-muted">
                  Reduce el capital y crea una versión nueva del calendario. Lo vencido debe estar
                  al día.
                </p>
              ) : null}
            </div>

            {/* How. */}
            <div className="space-y-2.5">
              <div className="text-[13px] font-medium">Método</div>
              <div
                role="radiogroup"
                aria-label="Método"
                className="grid grid-cols-2 gap-2 sm:grid-cols-4"
              >
                {METHODS.map(([value, label, icon]) => {
                  const on = shownMethod === value
                  const off = noCash && value === 'cash'
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={off}
                      title={off ? 'Sin caja ni ruta abierta' : undefined}
                      onClick={() => setMethod(value)}
                      className={`press press-down flex h-11 items-center justify-center gap-2 rounded-[10px] text-[13.5px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:cursor-not-allowed disabled:opacity-45 ${
                        on
                          ? 'bg-brand-950 text-on-forest shadow-sm'
                          : 'bg-surface text-ink ring-1 ring-inset ring-edge hover:bg-brand-50'
                      }`}
                    >
                      {icon}
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            {shownMethod === 'cash' ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Recibido">
                  <Input
                    inputMode="decimal"
                    value={received}
                    onChange={(e) => setReceived(e.target.value)}
                    placeholder={amount || '0.00'}
                  />
                </Field>
                <div className="space-y-1.5">
                  <div className="text-[13px] font-medium">Devuelta</div>
                  <output className="flex h-11 items-center rounded-control bg-brand-50 px-3 font-semibold text-brand-800 tabular-nums ring-1 ring-inset ring-brand-700/20 sm:h-[38px]">
                    {rd(result && settled ? Number(result.change) : change)}
                  </output>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Número de referencia">
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} />
                </Field>
                <Field label="Cuenta bancaria donde entró">
                  <Select value={bank} onChange={(e) => setBank(e.target.value)}>
                    <option value="">
                      {data.bank_accounts.length
                        ? 'Elegir…'
                        : 'No hay cuentas bancarias registradas'}
                    </option>
                    {data.bank_accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}

            {kind === 'prepayment' ? (
              <Field label="El abono…">
                <Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
                  <option value="reduce_term">Reduce el plazo (misma cuota, menos cuotas)</option>
                  <option value="reduce_payment">Reduce la cuota (mismas cuotas)</option>
                </Select>
              </Field>
            ) : null}

            {Number(s.late_fee) > 0 && !onRoute && !collector ? (
              <div className="space-y-2 rounded-[10px] border border-edge p-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={waiving}
                    onChange={(e) => setWaiving(e.target.checked)}
                  />
                  Condonar mora (hasta {rd(s.late_fee)})
                </label>
                {waiving ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Monto a condonar">
                        <Input
                          inputMode="decimal"
                          value={waive}
                          onChange={(e) => setWaive(e.target.value)}
                        />
                      </Field>
                      <Field label="Motivo">
                        <Input value={waiveNote} onChange={(e) => setWaiveNote(e.target.value)} />
                      </Field>
                    </div>
                    <p className="text-[12.5px] text-muted">
                      Tu límite por cobro:{' '}
                      {data.limits.waive_late_fee === null
                        ? 'sin límite'
                        : rd(data.limits.waive_late_fee)}
                      . La condonación aparece aparte en el recibo.
                    </p>
                    <ApprovalPicker
                      approvals={data.approvals}
                      kind="waive_late_fee"
                      value={waiverApproval}
                      onChange={setWaiverApproval}
                    />
                  </>
                ) : null}
              </div>
            ) : null}

            {kind === 'payoff' && data.payoff ? (
              <div className="space-y-2 rounded-[10px] border border-edge p-3 text-sm">
                <dl className="grid grid-cols-2 gap-1">
                  <dt className="text-muted">Capital</dt>
                  <dd className="text-right tabular-nums">{rd(data.payoff.principal)}</dd>
                  <dt className="text-muted">Interés vencido</dt>
                  <dd className="text-right tabular-nums">{rd(data.payoff.overdue_interest)}</dd>
                  <dt className="text-muted">Interés del período</dt>
                  <dd className="text-right tabular-nums">{rd(data.payoff.current_interest)}</dd>
                  <dt className="text-muted">Mora</dt>
                  <dd className="text-right tabular-nums">{rd(data.payoff.late_fees)}</dd>
                  <dt className="text-muted">Interés futuro condonado</dt>
                  <dd className="text-right tabular-nums text-success-600">
                    {rd(data.payoff.interest_waived)}
                  </dd>
                </dl>
                <Field label="Descuento adicional (con permiso)">
                  <Input
                    inputMode="decimal"
                    value={discount}
                    onChange={(e) => {
                      setDiscount(e.target.value)
                      const d = Number(money(e.target.value) || 0)
                      setAmount((Number(data.payoff!.total) - d).toFixed(2))
                    }}
                  />
                </Field>
                <ApprovalPicker
                  approvals={data.approvals}
                  kind="payoff_discount"
                  value={discountApproval}
                  onChange={setDiscountApproval}
                />
              </div>
            ) : null}
          </div>

          {confirm.error instanceof ApiError ? (
            <div className="px-5 pb-3">
              <Alert tone="danger">{errorMessage(confirm.error.data)}</Alert>
            </div>
          ) : null}
          <div className="sticky bottom-20 z-10 flex flex-wrap items-center justify-end gap-3 border-t border-edge bg-surface/95 px-5 py-3.5 backdrop-blur-sm sm:static">
            <Link
              to="/prestamos/$numero"
              params={{ numero }}
              className={buttonClass('ghost', 'max-sm:hidden')}
            >
              Cancelar
            </Link>
            <Button
              className="w-full sm:w-auto"
              disabled={
                !request || !result || !settled || previewError !== null || confirm.isPending
              }
              onClick={() => confirm.mutate()}
            >
              {confirm.isPending
                ? 'Registrando…'
                : result && settled
                  ? `Registrar pago · ${rd(result.amount)}`
                  : 'Registrar pago'}
            </Button>
          </div>
        </section>

        <details className="group rounded-card border border-edge bg-surface shadow-sm">
          <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-3.5 text-[15px] font-semibold">
            Cuotas pendientes
            <span className="text-[12.5px] font-normal text-muted">
              {plural(data.installments.length, 'cuota')}
            </span>
          </summary>
          <div className="border-t border-edge px-5 py-3">
            {data.installments.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular-nums [&_td]:whitespace-nowrap">
                  <thead className="text-left text-[12px] text-muted">
                    <tr>
                      <th className="py-1">#</th>
                      <th>Vence</th>
                      <th className="text-right">Atraso</th>
                      <th className="text-right">Mora</th>
                      <th className="hidden text-right sm:table-cell">Interés</th>
                      <th className="hidden text-right sm:table-cell">Capital</th>
                      <th className="text-right">Total RD$</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge">
                    {data.installments.map((line) => (
                      <tr key={line.id} className={line.days_late > 0 ? 'text-danger-600' : ''}>
                        <td className="py-1.5">{line.number}</td>
                        <td>{day(line.due_date)}</td>
                        <td className="text-right">
                          {line.days_late ? `${line.days_late} d` : '—'}
                        </td>
                        <td className="text-right">
                          {Number(line.late_fee) ? num(line.late_fee) : '—'}
                        </td>
                        <td className="hidden text-right sm:table-cell">{num(line.interest)}</td>
                        <td className="hidden text-right sm:table-cell">{num(line.principal)}</td>
                        <td className="text-right font-medium">{num(line.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted">No hay cuotas pendientes.</p>
            )}
          </div>
        </details>
      </div>

      <aside className="min-w-0 space-y-4 lg:sticky lg:top-24">
        <Card>
          <h2 className="mb-3 text-[15px] font-semibold">Cómo se aplica</h2>
          {!request ? (
            <p className="text-sm text-muted">
              Elige o escribe un monto: aquí verás a qué va cada peso y cómo queda el préstamo.
            </p>
          ) : previewError ? (
            <div className="space-y-2">
              <Alert tone={needsApproval ? 'warning' : 'danger'}>
                {errorMessage(previewError)}
              </Alert>
              {needsApproval ? (
                <Button
                  variant="secondary"
                  disabled={ask.isPending}
                  onClick={() =>
                    ask.mutate(
                      kind === 'payoff' && Number(money(discount) || 0) > 0
                        ? {
                            kind: 'payoff_discount',
                            amount: money(discount),
                            note: waiveNote || 'Descuento en liquidación',
                          }
                        : {
                            kind: 'waive_late_fee',
                            amount: money(waive),
                            note: waiveNote || 'Condonación de mora',
                          },
                    )
                  }
                >
                  Pedir autorización
                </Button>
              ) : null}
            </div>
          ) : !result ? (
            <Spinner label="Calculando…" />
          ) : (
            <HowApplied result={result} order={data.loan.allocation_order} method={shownMethod}>
              {result.lines.length > 1 ? (
                <details className="text-[12.5px]">
                  <summary className="cursor-pointer font-medium text-brand-700">
                    Por cuota ({result.lines.length})
                  </summary>
                  <ul className="mt-2 space-y-1 tabular-nums">
                    {result.lines.map((line) => (
                      <li key={line.number} className="flex justify-between gap-3">
                        <span className="text-muted">
                          Cuota {line.number} · {day(line.due_date)}
                        </span>
                        <span className="font-medium">{num(line.total)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </HowApplied>
          )}
        </Card>
        {result && !previewError ? (
          <div className="hidden lg:block">
            <ReceiptPreview result={result} />
          </div>
        ) : null}
      </aside>
    </div>
  )
}
