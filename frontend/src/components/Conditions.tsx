import type { ReactNode } from 'react'

import type { LoanProduct, Simulation } from '../api/lending'
import { day, FREQUENCY_TEXT, pct, plural, RATE_UNIT_TEXT, rd, whole } from '../lib/format'
import type { Conditions } from '../lib/conditions'
import { Field, PercentInput, Segmented, Select, Texture } from './ui'

/** Round amounts a person asks for, inside the product's range (decision 115). */
const NICE = [
  5_000, 10_000, 15_000, 25_000, 50_000, 75_000, 100_000, 150_000, 200_000, 300_000, 500_000,
  1_000_000,
]

function quickAmounts(product: LoanProduct | undefined): number[] {
  if (!product) return []
  const inside = NICE.filter(
    (n) => n >= Number(product.min_amount) && n <= Number(product.max_amount),
  )
  // Most loans sit near the low end of a product: the first five round ones.
  return inside.slice(0, 5)
}

const FREQUENCY_SHORT: Record<string, string> = {
  daily: 'diaria',
  interdaily: 'interdiaria',
  weekly: 'semanal',
  biweekly: 'quincenal',
  monthly: 'mensual',
}

/** Product, a big amount with round shortcuts, the frequency side by side,
 * the installments with − and + and the rate (decision 115). */
export function ConditionsForm({
  products,
  value,
  onChange,
  errorText,
  lockProduct = false,
}: {
  products: LoanProduct[]
  value: Conditions
  onChange: (next: Conditions) => void
  errorText: (key: string) => string | undefined
  lockProduct?: boolean
}) {
  const product = products.find((p) => p.id === value.productId)
  const pickProduct = (id: string) => {
    const next = products.find((p) => p.id === id)
    onChange({
      ...value,
      productId: id,
      frequency: next?.allowed_frequencies[0] ?? '',
      rate: next?.default_rate ?? '',
      installments: next ? String(next.min_term) : '',
    })
  }
  const installments = Number(value.installments) || 0
  const step = (delta: number) => {
    const min = product?.min_term ?? 1
    const max = product?.max_term ?? 999
    const next = Math.min(Math.max((installments || min) + delta, min), max)
    onChange({ ...value, installments: String(next) })
  }
  const frequencies = Object.keys(FREQUENCY_TEXT).filter((key) =>
    product?.allowed_frequencies.includes(key),
  )
  const amountError = errorText('amount')
  return (
    <div className="space-y-5">
      <Field label="Producto" error={errorText('product')}>
        <Select
          value={value.productId}
          disabled={lockProduct}
          onChange={(e) => pickProduct(e.target.value)}
        >
          <option value="">Elegir…</option>
          {products
            .filter((p) => p.is_active)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </Select>
      </Field>

      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-[13px] font-medium">Monto</span>
          {product ? (
            <span className="text-[12px] text-muted">
              Entre {rd(product.min_amount)} y {rd(product.max_amount)}
            </span>
          ) : null}
        </div>
        <label
          className={`flex h-16 items-center gap-2 rounded-xl border-2 bg-surface px-4 shadow-xs focus-within:ring-4 focus-within:ring-accent-500/15 ${
            amountError ? 'border-danger-600' : 'border-edge focus-within:border-brand-700'
          }`}
        >
          <span className="font-display text-lg font-semibold text-muted">RD$</span>
          <input
            inputMode="decimal"
            aria-label="Monto (RD$)"
            aria-invalid={Boolean(amountError)}
            value={value.amount}
            onChange={(e) => onChange({ ...value, amount: e.target.value })}
            placeholder="0"
            className="min-w-0 flex-1 bg-transparent font-display text-[30px] font-bold tabular-nums tracking-[-0.02em] text-ink outline-none placeholder:text-muted/50"
          />
        </label>
        {amountError ? <p className="text-[12.5px] text-danger-600">{amountError}</p> : null}
        {quickAmounts(product).length ? (
          <div className="flex flex-wrap gap-1.5">
            {quickAmounts(product).map((amount) => {
              const on = Number(value.amount) === amount
              return (
                <button
                  key={amount}
                  type="button"
                  onClick={() => onChange({ ...value, amount: String(amount) })}
                  className={`press press-down h-8 rounded-full px-3 text-[12.5px] font-semibold tabular-nums ring-1 ring-inset ${
                    on
                      ? 'bg-brand-100 text-brand-800 ring-brand-700/40'
                      : 'bg-surface text-ink ring-edge hover:bg-brand-50'
                  }`}
                >
                  RD$ {whole(amount)}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>

      {frequencies.length ? (
        <div className="space-y-2">
          <div className="text-[13px] font-medium">Frecuencia de pago</div>
          <Segmented
            label="Frecuencia de pago"
            value={value.frequency}
            onChange={(frequency) => onChange({ ...value, frequency })}
            options={frequencies.map((key) => ({ value: key, label: FREQUENCY_TEXT[key] }))}
            className="w-full [&>button]:flex-1"
          />
          {errorText('frequency') ? (
            <p className="text-[12.5px] text-danger-600">{errorText('frequency')}</p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Número de cuotas" error={errorText('installments')}>
          <div className="flex h-11 items-center rounded-control border border-edge bg-surface shadow-xs sm:h-[38px]">
            <button
              type="button"
              aria-label="Una cuota menos"
              onClick={() => step(-1)}
              className="press press-down grid h-full w-11 place-items-center text-lg text-muted hover:text-ink"
            >
              −
            </button>
            <input
              inputMode="numeric"
              aria-label="Cuotas"
              value={value.installments}
              onChange={(e) => onChange({ ...value, installments: e.target.value })}
              className="h-full min-w-0 flex-1 bg-transparent text-center font-semibold tabular-nums outline-none"
            />
            <button
              type="button"
              aria-label="Una cuota más"
              onClick={() => step(1)}
              className="press press-down grid h-full w-11 place-items-center text-lg text-muted hover:text-ink"
            >
              +
            </button>
          </div>
        </Field>
        <Field
          label={`Tasa ${RATE_UNIT_TEXT[product?.rate_unit ?? 'per_period']}`}
          error={errorText('rate')}
        >
          <PercentInput
            key={value.productId}
            value={value.rate}
            onChange={(rate) => onChange({ ...value, rate })}
          />
        </Field>
      </div>
      {product ? (
        <p className="text-[12.5px] text-muted">
          {product.min_term}–{product.max_term} cuotas · tasa {pct(product.min_rate)}–
          {pct(product.max_rate)}
          {product.payment_rounding !== 'cent' ? ' · cuota redondeada hacia arriba' : ''}.
        </p>
      ) : null}
    </div>
  )
}

/** «Así queda» (decision 115): the installment in big, what it costs in all
 * and the first installments, on forest, recomputed by the server as the
 * conditions change (the same quote as the simulator). */
export function QuoteBlock({
  data,
  frequency,
  note,
}: {
  data: Simulation
  frequency: string
  note?: ReactNode
}) {
  const first = data.schedule[0]
  const last = data.schedule.at(-1)
  const [units, cents = '00'] = rd(first?.total ?? 0)
    .replace('RD$ ', '')
    .split('.')
  return (
    <section
      aria-label="Así queda"
      className="relative overflow-hidden rounded-block bg-brand-950 text-on-forest shadow-lg"
    >
      <Texture tone="forest" />
      <div className="relative space-y-4 px-5 py-5">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-200">
            <span aria-hidden className="size-1.5 rounded-full bg-gold-500" />
            Así queda
          </div>
          <div className="mt-2 text-[13px] text-brand-200">
            Cuota {FREQUENCY_SHORT[frequency] ?? ''}
          </div>
          <div className="flex items-baseline gap-1.5 font-display tracking-[-0.03em]">
            <span className="text-[18px] font-semibold text-brand-200">RD$</span>
            <span className="text-[40px] leading-tight font-bold tabular-nums">{units}</span>
            <span className="text-[18px] font-semibold text-brand-200">.{cents}</span>
          </div>
        </div>
        <dl className="divide-y divide-white/10 border-t border-white/10 text-[13px]">
          {(
            [
              ['Total a pagar', rd(data.total_to_pay)],
              ['Interés total', rd(data.total_interest)],
              ['Neto a entregar', rd(data.net_disbursed)],
              ['Cuotas', `${data.schedule.length} · ${FREQUENCY_SHORT[frequency] ?? frequency}`],
              ['Última cuota', last ? day(last.due_date) : '—'],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 py-2">
              <dt className="text-brand-200">{label}</dt>
              <dd className="font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="rounded-xl bg-black/15 px-3.5 py-3 ring-1 ring-inset ring-white/10">
          <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-brand-200">
            Primeras cuotas
          </div>
          <ol className="space-y-1 text-[12.5px] tabular-nums">
            {data.schedule.slice(0, 4).map((row) => (
              <li key={row.number} className="grid grid-cols-[18px_1fr_auto] gap-2">
                <span className="text-brand-200">{row.number}</span>
                <span>{day(row.due_date)}</span>
                <span className="font-semibold">{rd(row.total)}</span>
              </li>
            ))}
          </ol>
        </div>
        <p className="text-[11.5px] leading-relaxed text-brand-200">
          Tasa por período {pct(data.periodic_rate, 4)} · costo anual efectivo{' '}
          {pct(data.effective_annual_rate)} (incluye cargos)
          {data.charges.length
            ? ` · cargos: ${data.charges.map((c) => `${c.name} ${rd(c.amount)}`).join(', ')}`
            : ''}
          . {note}
        </p>
      </div>
    </section>
  )
}

/** Quote summary for a narrow place (a dialog): the four figures the law of
 * transparency asks for. */
export function QuoteSummary({ data }: { data: Simulation }) {
  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl bg-surface-2 px-4 py-3 text-[13px]">
        <dt className="text-muted">Cuota</dt>
        <dd className="text-right font-semibold tabular-nums">
          {rd(data.schedule[0]?.total ?? 0)}
        </dd>
        <dt className="text-muted">Total intereses</dt>
        <dd className="text-right tabular-nums">{rd(data.total_interest)}</dd>
        <dt className="text-muted">Neto a entregar</dt>
        <dd className="text-right tabular-nums">{rd(data.net_disbursed)}</dd>
        <dt className="text-muted">Total a pagar</dt>
        <dd className="text-right font-semibold tabular-nums">{rd(data.total_to_pay)}</dd>
      </dl>
      <p className="text-[12px] text-muted">
        Tasa por período {pct(data.periodic_rate, 4)} · mensual {pct(data.monthly_rate)} · anual{' '}
        {pct(data.annual_rate)} · costo anual efectivo {pct(data.effective_annual_rate)} (incluye
        cargos) · {plural(data.schedule.length, 'cuota')}
      </p>
    </div>
  )
}
