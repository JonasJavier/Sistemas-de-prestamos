import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'

import { ApiError } from '../api/client'
import { listProducts, simulate, type Simulation } from '../api/lending'
import { Alert, Card, Field, Input } from '../components/ui'

const FREQUENCY_TEXT: Record<string, string> = {
  daily: 'Diaria',
  interdaily: 'Interdiaria',
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
}

const selectClasses =
  'h-11 w-full rounded-lg border border-edge bg-surface px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent-500 sm:h-9'

const rd = (value: string | number) =>
  `RD$ ${Number(value).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`

const pct = (value: string) => `${(Number(value) * 100).toFixed(2).replace(/\.00$/, '')}%`

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

export function SimulatorPage() {
  const products = useQuery({ queryKey: ['products'], queryFn: listProducts })
  const [productId, setProductId] = useState('')
  const [amount, setAmount] = useState('')
  const [installments, setInstallments] = useState('')
  const [frequency, setFrequency] = useState('')
  const [rate, setRate] = useState('')

  const product = products.data?.results.find((p) => p.id === productId)

  // Picking a product preloads its defaults.
  useEffect(() => {
    if (!product) return
    setFrequency(product.allowed_frequencies[0] ?? '')
    setRate(product.default_rate ?? '')
    setInstallments(String(product.min_term))
  }, [product])

  const request = useMemo(
    () =>
      productId && amount && installments && frequency
        ? {
            product: productId,
            amount,
            installments: Number(installments),
            frequency,
            rate: rate || undefined,
          }
        : null,
    [productId, amount, installments, frequency, rate],
  )
  const debounced = useDebounced(request, 350)

  const quote = useQuery<Simulation, Error>({
    queryKey: ['simulate', debounced],
    queryFn: () => simulate(debounced!),
    enabled: debounced !== null,
    retry: false,
    placeholderData: (previous) => previous,
  })

  const fieldErrors =
    quote.error instanceof ApiError && quote.error.status === 400
      ? (quote.error.data as Record<string, string[] | string>)
      : null
  const errorText = (key: string) => {
    const value = fieldErrors?.[key]
    return Array.isArray(value) ? value[0] : value
  }

  const data = quote.data

  return (
    <>
      <h1 className="text-xl font-semibold">Simulador</h1>
      <p className="-mt-2 text-sm text-muted">
        Cotiza en vivo: el servidor calcula, nada se guarda hasta crear la solicitud.
      </p>

      <Card>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="col-span-2">
            <Field label="Producto">
              <select
                className={selectClasses}
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              >
                <option value="">Elegir…</option>
                {products.data?.results
                  .filter((p) => p.is_active)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
          <Field label="Monto (RD$)" error={errorText('amount')}>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Cuotas" error={errorText('installments')}>
            <Input
              inputMode="numeric"
              value={installments}
              onChange={(e) => setInstallments(e.target.value)}
            />
          </Field>
          <Field label="Frecuencia" error={errorText('frequency')}>
            <select
              className={selectClasses}
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
            >
              {product?.allowed_frequencies.map((f) => (
                <option key={f} value={f}>
                  {FREQUENCY_TEXT[f] ?? f}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={`Tasa (${product?.rate_unit === 'monthly' ? 'mensual' : product?.rate_unit === 'annual' ? 'anual' : 'por período'})`}
            error={errorText('rate')}
          >
            <Input
              inputMode="decimal"
              placeholder="0.10 = 10%"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </Field>
        </div>
        {product ? (
          <p className="mt-2 text-[12.5px] text-muted">
            Rangos del producto: {rd(product.min_amount)}–{rd(product.max_amount)} ·{' '}
            {product.min_term}–{product.max_term} cuotas · tasa {pct(product.min_rate)}–
            {pct(product.max_rate)}.
          </p>
        ) : null}
      </Card>

      {quote.error && !fieldErrors ? (
        <Alert tone="danger">No se pudo cotizar. Intenta de nuevo.</Alert>
      ) : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="!p-4">
              <div className="text-[12.5px] text-muted">Cuota</div>
              <div className="font-display text-xl font-bold text-brand-700 tabular-nums">
                {rd(data.schedule[0]?.total ?? 0)}
              </div>
            </Card>
            <Card className="!p-4">
              <div className="text-[12.5px] text-muted">Total intereses</div>
              <div className="font-display text-xl font-bold tabular-nums">
                {rd(data.total_interest)}
              </div>
            </Card>
            <Card className="!p-4">
              <div className="text-[12.5px] text-muted">Neto a entregar</div>
              <div className="font-display text-xl font-bold tabular-nums">
                {rd(data.net_disbursed)}
              </div>
            </Card>
            <Card className="!p-4">
              <div className="text-[12.5px] text-muted">Total a pagar</div>
              <div className="font-display text-xl font-bold tabular-nums">
                {rd(data.total_to_pay)}
              </div>
            </Card>
          </div>

          <Card>
            <p className="mb-3 text-[12.5px] text-muted">
              Tasa por período {pct(data.periodic_rate)} · mensual equivalente{' '}
              {pct(data.monthly_rate)} · anual equivalente {pct(data.annual_rate)}
              {data.charges.length > 0
                ? ` · cargos: ${data.charges
                    .map((charge) => `${charge.name} ${rd(charge.amount)}`)
                    .join(', ')}`
                : ''}
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge text-left text-[12.5px] text-muted">
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">Vence</th>
                  <th className="py-2 pr-3 text-right">Capital</th>
                  <th className="py-2 pr-3 text-right">Interés</th>
                  <th className="py-2 text-right">Cuota</th>
                </tr>
              </thead>
              <tbody>
                {data.schedule.map((row) => (
                  <tr key={row.number} className="border-b border-edge/60 last:border-0">
                    <td className="py-1.5 pr-3 tabular-nums">{row.number}</td>
                    <td className="py-1.5 pr-3 tabular-nums">
                      {new Date(`${row.due_date}T00:00:00`).toLocaleDateString('es-DO')}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{rd(row.principal)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{rd(row.interest)}</td>
                    <td className="py-1.5 text-right font-medium tabular-nums">{rd(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      ) : null}
    </>
  )
}
