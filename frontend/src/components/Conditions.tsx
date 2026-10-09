import type { LoanProduct, Simulation } from '../api/lending'
import { FREQUENCY_TEXT, pct, RATE_UNIT_TEXT, rd } from '../lib/format'
import type { Conditions } from '../lib/conditions'
import { Field, Input, PercentInput, Select, Stat } from './ui'

/** Product + amount + term + frequency + rate, preloading product defaults. */
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
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="col-span-2">
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
        </div>
        <Field label="Monto (RD$)" error={errorText('amount')}>
          <Input
            inputMode="decimal"
            value={value.amount}
            onChange={(e) => onChange({ ...value, amount: e.target.value })}
          />
        </Field>
        <Field label="Cuotas" error={errorText('installments')}>
          <Input
            inputMode="numeric"
            value={value.installments}
            onChange={(e) => onChange({ ...value, installments: e.target.value })}
          />
        </Field>
        <Field label="Frecuencia" error={errorText('frequency')}>
          <Select
            value={value.frequency}
            onChange={(e) => onChange({ ...value, frequency: e.target.value })}
          >
            {product?.allowed_frequencies.map((f) => (
              <option key={f} value={f}>
                {FREQUENCY_TEXT[f] ?? f}
              </option>
            ))}
          </Select>
        </Field>
        <div className="col-span-2 sm:col-span-1">
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
      </div>
      {product ? (
        <p className="mt-2 text-[12.5px] text-muted">
          Rangos del producto: {rd(product.min_amount)}–{rd(product.max_amount)} ·{' '}
          {product.min_term}–{product.max_term} cuotas · tasa {pct(product.min_rate)}–
          {pct(product.max_rate)}
          {product.payment_rounding !== 'cent' ? ' · cuota redondeada hacia arriba' : ''}.
        </p>
      ) : null}
    </>
  )
}

/** Quote summary: the four figures the law of transparency asks for. */
export function QuoteSummary({ data }: { data: Simulation }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Cuota" value={rd(data.schedule[0]?.total ?? 0)} emphasis />
        <Stat label="Total intereses" value={rd(data.total_interest)} />
        <Stat label="Neto a entregar" value={rd(data.net_disbursed)} />
        <Stat label="Total a pagar" value={rd(data.total_to_pay)} />
      </div>
      <p className="text-[12.5px] text-muted">
        Tasa por período {pct(data.periodic_rate, 4)} · mensual equivalente {pct(data.monthly_rate)}{' '}
        · anual equivalente {pct(data.annual_rate)} ·{' '}
        <span className="text-ink">costo anual efectivo {pct(data.effective_annual_rate)}</span>{' '}
        (incluye cargos) · costo total {rd(data.total_cost)}
        {data.charges.length > 0
          ? ` · cargos: ${data.charges
              .map((charge) => `${charge.name} ${rd(charge.amount)}`)
              .join(', ')}`
          : ''}
      </p>
    </>
  )
}
