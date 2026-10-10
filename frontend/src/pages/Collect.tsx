import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'

import type { Me } from '../api/accounts'
import { ApiError } from '../api/client'
import {
  collect,
  getPaymentScreen,
  previewPayment,
  requestAuthorization,
  type Approval,
  type PaymentKind,
  type PaymentMethod,
  type PaymentRequest,
  type PaymentScreen,
} from '../api/payments'
import { buttonClass } from '../components/classes'
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Stat,
} from '../components/ui'
import { day, errorMessage, newIdempotencyKey, num, rd, toAmount } from '../lib/format'
import { useDebounced } from '../lib/hooks'
import { ACCESS, hasRole } from '../lib/roles'
import { notify } from '../lib/toast'

const METHODS: [PaymentMethod, string][] = [
  ['cash', 'Efectivo'],
  ['transfer', 'Transferencia'],
  ['deposit', 'Depósito'],
  ['check', 'Cheque'],
]

const KINDS: [PaymentKind, string][] = [
  ['regular', 'Cobro'],
  ['payoff', 'Liquidar'],
  ['prepayment', 'Abono a capital'],
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

function QuickAmounts({
  screen,
  onPick,
}: {
  screen: PaymentScreen
  onPick: (kind: PaymentKind, amount: string) => void
}) {
  const s = screen.summary
  const options: { label: string; hint: string; kind: PaymentKind; amount: string }[] = []
  if (Number(s.overdue) > 0)
    options.push({ label: 'Lo vencido', hint: rd(s.overdue), kind: 'regular', amount: s.overdue })
  if (Number(s.current) > 0) {
    const upTo = (Number(s.overdue) + Number(s.current)).toFixed(2)
    options.push({
      label: Number(s.overdue) > 0 ? 'Vencido + cuota actual' : 'Cuota actual',
      hint: `${rd(upTo)} · vence ${day(s.current_due_date)}`,
      kind: 'regular',
      amount: upTo,
    })
  }
  if (screen.payoff)
    options.push({
      label: 'Liquidar',
      hint: rd(screen.payoff.total),
      kind: 'payoff',
      amount: screen.payoff.total,
    })
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {options.map((option, index) => (
        <button
          key={option.label}
          type="button"
          onClick={() => onPick(option.kind, option.amount)}
          className={`rounded-xl border border-edge bg-surface px-3 py-2 text-left shadow-sm outline-none hover:border-brand-700/50 hover:bg-brand-100 focus-visible:ring-2 focus-visible:ring-accent-500 sm:px-4 sm:py-3 ${
            options.length === 3 && index === 2 ? 'col-span-2 sm:col-span-1' : ''
          }`}
        >
          <div className="text-sm font-semibold">{option.label}</div>
          <div className="text-[12.5px] text-muted tabular-nums">{option.hint}</div>
        </button>
      ))}
    </div>
  )
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

/** P33 (and P41 on the collector's phone): what is owed today, the
 * breakdown before confirming, and the receipt after. */
export function CollectPage({ me }: { me: Me }) {
  const { numero } = useParams({ from: '/app/cobrar/$numero' })
  // Doc 06 - 4, rule 4: the collector collects his portfolio, never waives.
  const collector = hasRole(me, ACCESS.myRoute) && !hasRole(me, ACCESS.myCash)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const screen = useQuery({
    queryKey: ['payment-screen', numero],
    queryFn: () => getPaymentScreen(numero),
  })
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
      navigate({ to: '/recibos/$numero', params: { numero: result.number } })
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
  const withFees = Boolean(result?.lines.some((line) => Number(line.late_fee)))
  // The breakdown on screen is the one of what is typed now, not of a moment ago.
  const settled = debounced === request && !preview.isPlaceholderData && !preview.isFetching
  const pick = (next: PaymentKind, value: string) => {
    setKind(next)
    setAmount(value)
    if (method === 'cash') setReceived('')
  }
  const loanLink = (
    <Link to="/prestamos/$numero" params={{ numero }} className="hover:underline">
      ← Préstamo {numero}
    </Link>
  )

  if (data.loan.status !== 'active') {
    return (
      <>
        <PageHeader back={loanLink} title={`Cobrar ${numero}`} />
        <Alert tone="info">Este préstamo no está activo: no admite cobros.</Alert>
      </>
    )
  }

  return (
    <>
      <PageHeader
        back={loanLink}
        documentTitle={`Cobrar ${numero}`}
        title={
          <span className="flex flex-wrap items-center gap-2">
            Cobrar <span className="tabular-nums">{numero}</span>
            {s.days_past_due > 0 ? (
              <Badge tone="danger">{s.days_past_due} días de atraso</Badge>
            ) : (
              <Badge tone="success">Al día</Badge>
            )}
          </span>
        }
        subtitle={
          <>
            <Link
              to="/clientes/$id"
              params={{ id: data.loan.customer_id }}
              className="font-medium text-ink hover:underline"
            >
              {data.loan.customer_name}
            </Link>{' '}
            · {data.loan.customer_document} · {data.loan.product_name}
          </>
        }
      />

      {data.destination === null ? (
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
          El efectivo entra en <strong>{data.destination.label}</strong> (hoy:{' '}
          {rd(data.destination.cash)}).
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Vencido" value={rd(s.overdue)} danger={Number(s.overdue) > 0} />
        <Stat label="Mora al día" value={rd(s.late_fee)} />
        <Stat
          label="Cuota en curso"
          value={rd(s.current)}
          hint={s.current_due_date ? `vence ${day(s.current_due_date)}` : undefined}
        />
        <Stat label="Saldo de capital" value={rd(s.principal)} />
      </div>

      <QuickAmounts screen={data} onPick={pick} />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <Card className="space-y-4">
          <div role="radiogroup" aria-label="Tipo de cobro" className="flex flex-wrap gap-2">
            {KINDS.filter(([k]) => k !== 'prepayment' || data.prepayment?.allowed).map(
              ([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={kind === value}
                  onClick={() => pick(value, value === 'payoff' ? (data.payoff?.total ?? '') : '')}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                    kind === value
                      ? 'border-brand-700 bg-brand-700 text-on-brand'
                      : 'border-edge bg-surface hover:bg-brand-100'
                  }`}
                >
                  {label}
                </button>
              ),
            )}
          </div>
          {kind === 'prepayment' ? (
            <p className="text-[12.5px] text-muted">
              Reduce el capital y crea una versión nueva del calendario. Lo vencido debe estar al
              día.
            </p>
          ) : null}

          <Field label={kind === 'payoff' ? 'Saldo para saldar' : 'Monto a pagar'}>
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              readOnly={kind === 'payoff'}
              className="h-14 w-full rounded-lg border border-edge bg-surface px-3 text-2xl font-semibold tabular-nums text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              placeholder="0.00"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Medio de pago">
              <Select
                value={shownMethod}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              >
                {METHODS.map(([value, label]) => (
                  <option key={value} value={value} disabled={noCash && value === 'cash'}>
                    {noCash && value === 'cash' ? `${label} (sin caja abierta)` : label}
                  </option>
                ))}
              </Select>
            </Field>
            {shownMethod === 'cash' ? (
              <Field label="Recibido">
                <Input
                  inputMode="decimal"
                  value={received}
                  onChange={(e) => setReceived(e.target.value)}
                  placeholder={amount || '0.00'}
                />
              </Field>
            ) : (
              <Field label="Número de referencia">
                <Input value={reference} onChange={(e) => setReference(e.target.value)} />
              </Field>
            )}
          </div>
          {shownMethod !== 'cash' ? (
            <Field label="Cuenta bancaria donde entró">
              <Select value={bank} onChange={(e) => setBank(e.target.value)}>
                <option value="">
                  {data.bank_accounts.length ? 'Elegir…' : 'No hay cuentas bancarias registradas'}
                </option>
                {data.bank_accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {kind === 'prepayment' ? (
            <Field label="El abono…">
              <Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
                <option value="reduce_term">Reduce el plazo (misma cuota, menos cuotas)</option>
                <option value="reduce_payment">Reduce la cuota (mismas cuotas)</option>
              </Select>
            </Field>
          ) : null}

          {Number(s.late_fee) > 0 && !onRoute && !collector ? (
            <div className="space-y-2 rounded-lg border border-edge p-3">
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
            <div className="space-y-2 rounded-lg border border-edge p-3 text-sm">
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
        </Card>

        <Card className="space-y-3">
          <h2 className="text-base font-semibold">Desglose del cobro</h2>
          {!request ? (
            <p className="text-sm text-muted">
              Escribe un monto o elige uno de arriba: aquí verás a qué cuotas va cada peso.
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
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular-nums [&_td]:whitespace-nowrap">
                  <thead className="text-left text-[12px] text-muted">
                    <tr>
                      <th className="py-1">Cuota</th>
                      {withFees ? <th className="text-right">Mora</th> : null}
                      <th className="text-right">Interés</th>
                      <th className="text-right">Capital</th>
                      <th className="text-right">Total RD$</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge">
                    {result.lines.map((line) => (
                      <tr key={line.number}>
                        <td className="py-1.5">
                          {line.number}{' '}
                          <span className="text-[12px] text-muted">{day(line.due_date)}</span>
                        </td>
                        {withFees ? (
                          <td className="text-right">
                            {Number(line.late_fee) ? num(line.late_fee) : '—'}
                          </td>
                        ) : null}
                        <td className="text-right">
                          {Number(line.interest) ? num(line.interest) : '—'}
                        </td>
                        <td className="text-right">
                          {Number(line.principal) ? num(line.principal) : '—'}
                        </td>
                        <td className="text-right font-medium">{num(line.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <dl className="grid grid-cols-2 gap-1 border-t border-edge pt-2 text-sm">
                {Number(result.late_fee_waived) > 0 ? (
                  <>
                    <dt className="text-muted">Mora condonada</dt>
                    <dd className="text-right tabular-nums">{rd(result.late_fee_waived)}</dd>
                  </>
                ) : null}
                {Number(result.discount) > 0 ? (
                  <>
                    <dt className="text-muted">Descuento autorizado</dt>
                    <dd className="text-right tabular-nums">{rd(result.discount)}</dd>
                  </>
                ) : null}
                <dt className="font-semibold">Total del recibo</dt>
                <dd className="text-right font-semibold tabular-nums">{rd(result.amount)}</dd>
                {shownMethod === 'cash' && Number(result.change) > 0 ? (
                  <>
                    <dt className="text-muted">Cambio a devolver</dt>
                    <dd className="text-right text-lg font-bold tabular-nums text-brand-700">
                      {rd(result.change)}
                    </dd>
                  </>
                ) : null}
                <dt className="text-muted">Capital después</dt>
                <dd className="text-right tabular-nums">{rd(result.principal_after)}</dd>
                <dt className="text-muted">Saldo total después</dt>
                <dd className="text-right tabular-nums">{rd(result.owed_after)}</dd>
              </dl>
            </>
          )}
          {confirm.error instanceof ApiError ? (
            <Alert tone="danger">{errorMessage(confirm.error.data)}</Alert>
          ) : null}
          <div className="sticky bottom-20 -mx-2 flex justify-end rounded-xl bg-surface/95 p-2 shadow-sm sm:static sm:mx-0 sm:bg-transparent sm:p-0 sm:shadow-none">
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
                  ? `Confirmar cobro de ${rd(result.amount)}`
                  : 'Confirmar cobro'}
            </Button>
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="mb-2 text-base font-semibold">Cuotas pendientes</h2>
        {data.installments.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums [&_td]:whitespace-nowrap">
              <thead className="text-left text-[12px] text-muted">
                <tr>
                  <th className="py-1">#</th>
                  <th>Vence</th>
                  <th className="text-right">Atraso</th>
                  <th className="text-right">Mora</th>
                  {/* On a phone the total is what matters; the split is in the breakdown. */}
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
                    <td className="text-right">{line.days_late ? `${line.days_late} d` : '—'}</td>
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
        <p className="mt-2 text-[12.5px] text-muted">
          Orden de aplicación:{' '}
          {data.loan.allocation_order === 'proportional'
            ? 'proporcional entre interés y capital'
            : 'cargos → mora → interés → capital'}
          , empezando por la cuota más antigua.{' '}
          <Link
            to="/prestamos/$numero"
            params={{ numero }}
            className={buttonClass('secondary', 'ml-1', 'sm')}
          >
            Ver el préstamo
          </Link>
        </p>
      </Card>
    </>
  )
}
