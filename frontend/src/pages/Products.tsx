import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { ApiError } from '../api/client'
import {
  createCharge,
  createProduct,
  listProducts,
  simulate,
  updateCharge,
  updateProduct,
  type LoanProduct,
  type ProductCharge,
  type ProductPayload,
} from '../api/lending'
import { ScheduleTable } from '../components/ScheduleTable'
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  PercentInput,
  Select,
  Spinner,
  Textarea,
} from '../components/ui'
import { errorMessage, FREQUENCY_TEXT, installmentsText, METHOD_TEXT, pct, rd } from '../lib/format'

const TYPES: Record<LoanProduct['type'], string> = {
  personal: 'Personal',
  vehicle: 'Vehículo',
  mortgage: 'Hipotecario',
  micro: 'Microcrédito',
}

const BLANK: ProductPayload = {
  name: '',
  type: 'personal',
  method: 'fixed_payment',
  allowed_frequencies: ['monthly'],
  rate_unit: 'monthly',
  min_amount: '5000',
  max_amount: '500000',
  min_rate: '0.01',
  max_rate: '0.10',
  default_rate: '0.05',
  min_term: 3,
  max_term: 36,
  payment_rounding: 'cent',
  collect_saturdays: true,
  collect_sundays: false,
  collect_holidays: false,
  allocation_order: 'standard',
  payoff_full_current_period: true,
  payoff_future_interest_pct: '0',
  guarantee: 'none',
  min_coverage: null,
  required_documents: ['Cédula o RNC'],
  is_active: true,
  late_fee_policy: {
    grace_days: 3,
    fee_method: 'prorated_daily',
    monthly_rate: '0.05',
    fixed_amount: null,
    cap_pct: '0.10',
  },
}

function payloadOf(product: LoanProduct): ProductPayload {
  const { id: _id, charges: _charges, ...rest } = product
  return rest
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

function Charges({ product, onChange }: { product: LoanProduct; onChange: () => void }) {
  const [name, setName] = useState('')
  const [basis, setBasis] = useState<ProductCharge['basis']>('percent')
  const [value, setValue] = useState('')
  const [mode, setMode] = useState<ProductCharge['mode']>('discounted')
  const [taxed, setTaxed] = useState(false)
  const add = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      createCharge({ product: product.id, name, basis, value, mode, taxed, is_active: true }),
    onSuccess: () => {
      setName('')
      setValue('')
      setTaxed(false)
      onChange()
    },
  })
  const toggle = useMutation({
    mutationFn: (charge: ProductCharge) =>
      updateCharge(charge.id, { is_active: !charge.is_active }),
    onSuccess: onChange,
  })
  const MODE: Record<string, string> = {
    discounted: 'Descontado del desembolso',
    financed: 'Financiado',
    cash: 'Cobrado en caja',
  }
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Cargos</h3>
      {product.charges.length ? (
        <ul className="divide-y divide-edge rounded-lg border border-edge">
          {product.charges.map((charge) => (
            <li
              key={charge.id}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <span className={charge.is_active ? '' : 'text-muted line-through'}>
                {charge.name} · {charge.basis === 'percent' ? pct(charge.value) : rd(charge.value)}{' '}
                · {MODE[charge.mode]}
                {charge.taxed ? ' · grava ITBIS 18 %' : ' · exento de ITBIS'}
              </span>
              <button
                type="button"
                className="text-[12.5px] font-medium text-brand-700 hover:underline"
                onClick={() => toggle.mutate(charge)}
              >
                {charge.is_active ? 'Desactivar' : 'Activar'}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Sin cargos.</p>
      )}
      <form
        className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_130px_110px_190px_auto]"
        onSubmit={(e) => {
          e.preventDefault()
          add.mutate()
        }}
      >
        <Field label="Nombre">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Gastos de cierre"
          />
        </Field>
        <Field label="Base">
          <Select
            value={basis}
            onChange={(e) => setBasis(e.target.value as ProductCharge['basis'])}
          >
            <option value="percent">% del monto</option>
            <option value="fixed">Monto fijo</option>
          </Select>
        </Field>
        <Field label={basis === 'percent' ? 'Porcentaje' : 'Monto (RD$)'}>
          {basis === 'percent' ? (
            <PercentInput
              key={`percent-${product.charges.length}`}
              value={value}
              onChange={setValue}
              placeholder="Ej.: 2"
            />
          ) : (
            <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
          )}
        </Field>
        <Field label="Modalidad">
          <Select value={mode} onChange={(e) => setMode(e.target.value as ProductCharge['mode'])}>
            {Object.entries(MODE).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variant="secondary" disabled={!name || !value || add.isPending}>
          Agregar
        </Button>
        <label className="col-span-2 flex items-center gap-2 text-[12.5px] text-muted sm:col-span-5">
          <input
            type="checkbox"
            checked={taxed}
            onChange={(e) => setTaxed(e.target.checked)}
            className="h-4 w-4 accent-brand-700"
          />
          Grava ITBIS 18 % (el monto lo incluye). Los intereses y los gastos de cierre del servicio
          financiero son exentos; marca solo lo que revendes, como un seguro o un GPS.
        </label>
      </form>
      {add.error instanceof ApiError ? (
        <Alert tone="danger">{errorMessage(add.error.data)}</Alert>
      ) : null}
    </div>
  )
}

function Preview({ product }: { product: LoanProduct }) {
  const amount = String(
    Math.round((Number(product.min_amount) + Number(product.max_amount)) / 2 / 100) * 100,
  )
  const request = {
    product: product.id,
    amount,
    installments: product.min_term,
    frequency: product.allowed_frequencies[0],
    rate: product.default_rate ?? product.min_rate,
  }
  const quote = useQuery({
    queryKey: ['simulate', 'preview', product],
    queryFn: () => simulate(request),
    retry: false,
  })
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">
        Vista previa: {rd(amount)} en {installmentsText(product.min_term, request.frequency)} al{' '}
        {pct(request.rate, 4)}
      </h3>
      {quote.data ? (
        <ScheduleTable rows={quote.data.schedule.slice(0, 6)} />
      ) : quote.error ? (
        <p className="text-sm text-muted">Guarda condiciones válidas para ver el ejemplo.</p>
      ) : (
        <Spinner />
      )}
      {quote.data && quote.data.schedule.length > 6 ? (
        <p className="text-[12px] text-muted">…y {quote.data.schedule.length - 6} cuotas más.</p>
      ) : null}
    </div>
  )
}

function Editor({
  product,
  onSaved,
}: {
  product: LoanProduct | null
  onSaved: (p: LoanProduct) => void
}) {
  const [form, setForm] = useState<ProductPayload>(product ? payloadOf(product) : BLANK)
  const set = <K extends keyof ProductPayload>(key: K, value: ProductPayload[K]) =>
    setForm((current) => ({ ...current, [key]: value }))
  const setPolicy = (key: keyof ProductPayload['late_fee_policy'], value: string | number | null) =>
    setForm((current) => ({
      ...current,
      late_fee_policy: { ...current.late_fee_policy, [key]: value },
    }))
  const save = useMutation({
    meta: { inlineError: true },
    mutationFn: () => (product ? updateProduct(product.id, form) : createProduct(form)),
    onSuccess: onSaved,
  })
  const errors =
    save.error instanceof ApiError ? (save.error.data as Record<string, unknown>) : null
  const err = (key: string) => {
    const value = errors?.[key]
    return Array.isArray(value) ? String(value[0]) : typeof value === 'string' ? value : undefined
  }
  const interestOnly = form.method === 'interest_only' || form.method === 'open'

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Nombre" error={err('name')}>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Tipo">
          <Select
            value={form.type}
            onChange={(e) => set('type', e.target.value as LoanProduct['type'])}
          >
            {Object.entries(TYPES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Método de cálculo" error={err('method')}>
          <Select
            value={form.method}
            onChange={(e) => {
              const method = e.target.value as LoanProduct['method']
              setForm((current) => ({
                ...current,
                method,
                payment_rounding:
                  method === 'interest_only' || method === 'open'
                    ? 'cent'
                    : current.payment_rounding,
              }))
            }}
          >
            {Object.entries(METHOD_TEXT).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div>
        <span className="text-[12.5px] font-medium text-muted">Frecuencias permitidas</span>
        <div className="mt-1 flex flex-wrap gap-4">
          {Object.entries(FREQUENCY_TEXT).map(([key, label]) => (
            <Check
              key={key}
              label={label}
              checked={form.allowed_frequencies.includes(key)}
              onChange={(on) =>
                set(
                  'allowed_frequencies',
                  on
                    ? [...form.allowed_frequencies, key]
                    : form.allowed_frequencies.filter((f) => f !== key),
                )
              }
            />
          ))}
        </div>
        {err('allowed_frequencies') ? (
          <span className="text-[12.5px] text-danger-600">{err('allowed_frequencies')}</span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Monto mínimo" error={err('min_amount')}>
          <Input
            inputMode="decimal"
            value={form.min_amount}
            onChange={(e) => set('min_amount', e.target.value)}
          />
        </Field>
        <Field label="Monto máximo" error={err('max_amount')}>
          <Input
            inputMode="decimal"
            value={form.max_amount}
            onChange={(e) => set('max_amount', e.target.value)}
          />
        </Field>
        <Field label="Cuotas mínimas" error={err('min_term')}>
          <Input
            inputMode="numeric"
            value={form.min_term}
            onChange={(e) => set('min_term', Number(e.target.value))}
          />
        </Field>
        <Field label="Cuotas máximas" error={err('max_term')}>
          <Input
            inputMode="numeric"
            value={form.max_term}
            onChange={(e) => set('max_term', Number(e.target.value))}
          />
        </Field>
        <Field label="Unidad de la tasa">
          <Select
            value={form.rate_unit}
            onChange={(e) => set('rate_unit', e.target.value as LoanProduct['rate_unit'])}
          >
            <option value="per_period">Por período</option>
            <option value="monthly">Mensual</option>
            <option value="annual">Anual</option>
          </Select>
        </Field>
        <Field label="Tasa mínima" error={err('min_rate')}>
          <PercentInput value={form.min_rate} onChange={(rate) => set('min_rate', rate)} />
        </Field>
        <Field label="Tasa máxima" error={err('max_rate')}>
          <PercentInput value={form.max_rate} onChange={(rate) => set('max_rate', rate)} />
        </Field>
        <Field label="Tasa por defecto" error={err('default_rate')}>
          <PercentInput
            value={form.default_rate}
            onChange={(rate) => set('default_rate', rate || null)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Redondeo de la cuota" error={err('payment_rounding')}>
          <Select
            value={form.payment_rounding}
            disabled={interestOnly}
            onChange={(e) =>
              set('payment_rounding', e.target.value as LoanProduct['payment_rounding'])
            }
          >
            <option value="cent">Al centavo</option>
            <option value="peso">Al peso (hacia arriba)</option>
            <option value="five">A 5 (hacia arriba)</option>
            <option value="ten">A 10 (hacia arriba)</option>
          </Select>
        </Field>
        <Field label="Orden de aplicación">
          <Select
            value={form.allocation_order}
            onChange={(e) =>
              set('allocation_order', e.target.value as LoanProduct['allocation_order'])
            }
          >
            <option value="standard">Cargos → mora → interés → capital</option>
            <option value="proportional">Proporcional</option>
          </Select>
        </Field>
        <Field label="Garantía exigida">
          <Select
            value={form.guarantee}
            onChange={(e) => set('guarantee', e.target.value as LoanProduct['guarantee'])}
          >
            <option value="none">No requerida</option>
            <option value="guarantor">Garante</option>
            <option value="asset">Bien en garantía</option>
          </Select>
        </Field>
        <Field label="Cobertura mínima (×)" error={err('min_coverage')}>
          <Input
            inputMode="decimal"
            placeholder="1.50"
            value={form.min_coverage ?? ''}
            onChange={(e) => set('min_coverage', e.target.value || null)}
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-4">
        <Check
          label="Cobra sábados"
          checked={form.collect_saturdays}
          onChange={(v) => set('collect_saturdays', v)}
        />
        <Check
          label="Cobra domingos"
          checked={form.collect_sundays}
          onChange={(v) => set('collect_sundays', v)}
        />
        <Check
          label="Cobra feriados"
          checked={form.collect_holidays}
          onChange={(v) => set('collect_holidays', v)}
        />
        <Check
          label="Liquidación: interés del período en curso completo"
          checked={form.payoff_full_current_period}
          onChange={(v) => set('payoff_full_current_period', v)}
        />
        <Check label="Activo" checked={form.is_active} onChange={(v) => set('is_active', v)} />
      </div>

      <div className="rounded-lg border border-edge p-3">
        <h3 className="mb-2 text-sm font-semibold">Mora</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Field label="Días de gracia">
            <Input
              inputMode="numeric"
              value={form.late_fee_policy.grace_days}
              onChange={(e) => setPolicy('grace_days', Number(e.target.value))}
            />
          </Field>
          <Field label="Método">
            <Select
              value={form.late_fee_policy.fee_method}
              onChange={(e) => setPolicy('fee_method', e.target.value)}
            >
              <option value="prorated_daily">Prorrateada por día</option>
              <option value="full_period">% por período completo</option>
              <option value="fixed">Cargo fijo por cuota</option>
            </Select>
          </Field>
          <Field label="Tasa mensual">
            <PercentInput
              value={form.late_fee_policy.monthly_rate}
              onChange={(rate) => setPolicy('monthly_rate', rate)}
            />
          </Field>
          <Field label="Cargo fijo (RD$)">
            <Input
              inputMode="decimal"
              value={form.late_fee_policy.fixed_amount ?? ''}
              disabled={form.late_fee_policy.fee_method !== 'fixed'}
              onChange={(e) => setPolicy('fixed_amount', e.target.value || null)}
            />
          </Field>
          <Field label="Tope (sobre lo vencido)">
            <PercentInput
              value={form.late_fee_policy.cap_pct}
              onChange={(rate) => setPolicy('cap_pct', rate)}
            />
          </Field>
        </div>
      </div>

      <Field
        label="Documentos requeridos para aprobar (uno por línea)"
        error={err('required_documents')}
      >
        <Textarea
          value={form.required_documents.join('\n')}
          onChange={(e) => set('required_documents', e.target.value.split('\n'))}
        />
      </Field>

      {errors && !Object.keys(errors).some((k) => err(k) && k !== 'detail') ? (
        <Alert tone="danger">{errorMessage(errors)}</Alert>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Guardando…' : product ? 'Guardar cambios' : 'Crear producto'}
        </Button>
      </div>
    </form>
  )
}

/** P74: products, late-fee policy and charges. Loans keep their frozen terms. */
export function ProductsPage() {
  const queryClient = useQueryClient()
  const products = useQuery({ queryKey: ['products'], queryFn: listProducts })
  const [selected, setSelected] = useState<string | 'new' | null>(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['products'] })
  const rows = products.data?.results ?? []
  const current = rows.find((p) => p.id === selected) ?? null

  return (
    <>
      <PageHeader
        title="Productos"
        subtitle="Editar un producto no cambia los préstamos existentes: sus condiciones quedan congeladas al desembolsar."
        actions={<Button onClick={() => setSelected('new')}>Nuevo producto</Button>}
      />
      {products.isPending ? <Spinner /> : null}
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card className="!p-0 self-start">
          <ul className="divide-y divide-edge">
            {rows.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => setSelected(product.id)}
                  className={`w-full px-4 py-3 text-left text-sm hover:bg-surface-2 ${
                    selected === product.id ? 'bg-brand-100' : ''
                  }`}
                >
                  <div className="font-medium">{product.name}</div>
                  <div className="text-[12px] text-muted">
                    {TYPES[product.type]} · {METHOD_TEXT[product.method]}{' '}
                    {!product.is_active ? <Badge>Inactivo</Badge> : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        {selected ? (
          <div className="space-y-4">
            <Card>
              <Editor
                key={selected}
                product={current}
                onSaved={(saved) => {
                  refresh()
                  setSelected(saved.id)
                }}
              />
            </Card>
            {current ? (
              <Card className="space-y-4">
                <Charges product={current} onChange={refresh} />
                <Preview product={current} />
              </Card>
            ) : null}
          </div>
        ) : (
          <Card>
            <p className="text-sm text-muted">Elige un producto para editarlo, o crea uno nuevo.</p>
          </Card>
        )}
      </div>
    </>
  )
}
