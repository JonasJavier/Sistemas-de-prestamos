import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

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
import { buttonClass } from '../components/classes'
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
    <label className="flex items-center gap-2 text-[13px]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-brand-700"
      />
      {label}
    </label>
  )
}

/** One part of the product (decision 116): a title, a line saying what it
 * governs, and its fields; a rule separates it from the next. */
function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-edge pt-5 first:border-t-0 first:pt-0">
      <div>
        <h3 className="text-[14.5px] font-semibold">{title}</h3>
        {hint ? <p className="mt-0.5 text-[12.5px] text-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
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
    <Group title="Cargos" hint="Lo que se cobra al desembolsar, además del interés.">
      {product.charges.length ? (
        <ul className="divide-y divide-edge overflow-hidden rounded-xl border border-edge">
          {product.charges.map((charge) => (
            <li
              key={charge.id}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5 text-[13px]"
            >
              <div className="min-w-0">
                <div
                  className={`font-semibold ${charge.is_active ? '' : 'text-muted line-through'}`}
                >
                  {charge.name} ·{' '}
                  <span className="tabular-nums">
                    {charge.basis === 'percent' ? pct(charge.value) : rd(charge.value)}
                  </span>
                </div>
                <div className="text-[12px] text-muted">
                  {MODE[charge.mode]}
                  {charge.taxed ? ' · grava ITBIS 18 %' : ' · exento de ITBIS'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {charge.is_active ? null : <Badge>Inactivo</Badge>}
                <button
                  type="button"
                  className={buttonClass('ghost', '', 'sm')}
                  onClick={() => toggle.mutate(charge)}
                >
                  {charge.is_active ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted">Sin cargos.</p>
      )}
      <form
        className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]"
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
        <div className="col-span-2 sm:col-span-2">
          <Field label="Modalidad">
            <Select value={mode} onChange={(e) => setMode(e.target.value as ProductCharge['mode'])}>
              {Object.entries(MODE).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button
          type="submit"
          variant="secondary"
          className="col-span-2 sm:col-span-1"
          disabled={!name || !value || add.isPending}
        >
          Agregar cargo
        </Button>
        <label className="col-span-2 flex items-start gap-2 text-[12.5px] text-muted sm:col-span-3">
          <input
            type="checkbox"
            checked={taxed}
            onChange={(e) => setTaxed(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-brand-700"
          />
          Grava ITBIS 18 % (el monto lo incluye). Los intereses y los gastos de cierre del servicio
          financiero son exentos; marca solo lo que revendes, como un seguro o un GPS.
        </label>
      </form>
      {add.error instanceof ApiError ? (
        <Alert tone="danger">{errorMessage(add.error.data)}</Alert>
      ) : null}
    </Group>
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
    <Group
      title="Vista previa"
      hint={`${rd(amount)} en ${installmentsText(product.min_term, request.frequency)} al ${pct(request.rate, 4)}, con lo guardado.`}
    >
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
    </Group>
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
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <Group title="Lo básico">
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
        <Check
          label="Activo: se ofrece en las solicitudes nuevas"
          checked={form.is_active}
          onChange={(v) => set('is_active', v)}
        />
      </Group>

      <Group title="Montos y plazos" hint="Los límites que acepta una solicitud de este producto.">
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
        </div>
        <div>
          <span className="text-[13px] font-medium text-ink/85">Frecuencias permitidas</span>
          <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-2">
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
        {form.allowed_frequencies.length > 1 ? (
          // The first allowed frequency is the one a new application proposes.
          <div className="max-w-xs">
            <Field label="Frecuencia que se propone primero">
              <Select
                value={form.allowed_frequencies[0]}
                onChange={(e) =>
                  set('allowed_frequencies', [
                    e.target.value,
                    ...form.allowed_frequencies.filter((f) => f !== e.target.value),
                  ])
                }
              >
                {Object.entries(FREQUENCY_TEXT)
                  .filter(([key]) => form.allowed_frequencies.includes(key))
                  .map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
              </Select>
            </Field>
          </div>
        ) : null}
      </Group>

      <Group
        title="Tasa de interés"
        hint="La tasa por defecto es la que propone el asistente de solicitud."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
      </Group>

      <Group
        title="Cobro"
        hint="Cómo se redondea la cuota, a qué se aplica cada pago y qué días se cobra."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
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
        </div>
      </Group>

      <Group
        title="Mora"
        hint="Se calcula de noche sobre las cuotas vencidas, pasados los días de gracia."
      >
        <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-3">
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
          <Field label="Tope sobre lo vencido">
            <PercentInput
              value={form.late_fee_policy.cap_pct}
              onChange={(rate) => setPolicy('cap_pct', rate)}
            />
          </Field>
        </div>
      </Group>

      <Group
        title="Garantía y documentos"
        hint="Lo que la solicitud debe reunir antes de aprobarse."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        <Field
          label="Documentos requeridos para aprobar (uno por línea)"
          error={err('required_documents')}
        >
          <Textarea
            value={form.required_documents.join('\n')}
            onChange={(e) => set('required_documents', e.target.value.split('\n'))}
          />
        </Field>
      </Group>

      {errors && !Object.keys(errors).some((k) => err(k) && k !== 'detail') ? (
        <Alert tone="danger">{errorMessage(errors)}</Alert>
      ) : null}
      <div className="-mx-4 -mb-4 flex justify-end border-t border-edge bg-surface-2/60 px-4 py-3 sm:-mx-5 sm:-mb-5 sm:px-5">
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
  // The first product opens by itself: an empty panel only asks for a click.
  const chosen = selected ?? rows[0]?.id ?? null
  const current = rows.find((p) => p.id === chosen) ?? null

  return (
    <>
      <PageHeader
        title="Productos"
        subtitle="Editar un producto no cambia los préstamos existentes: sus condiciones quedan congeladas al desembolsar."
        actions={<Button onClick={() => setSelected('new')}>Nuevo producto</Button>}
      />
      {products.isPending ? <Spinner /> : null}
      <div className="grid items-start gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <Card className="overflow-hidden !p-0 lg:sticky lg:top-20">
          <ul className="divide-y divide-edge">
            {rows.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => setSelected(product.id)}
                  aria-current={chosen === product.id ? 'true' : undefined}
                  className={`press w-full px-4 py-3 text-left text-sm outline-none focus-visible:bg-brand-50 ${
                    chosen === product.id ? 'bg-brand-100' : 'hover:bg-brand-50/60'
                  }`}
                >
                  <div
                    className={`font-medium ${chosen === product.id ? 'font-semibold text-brand-800' : ''}`}
                  >
                    {product.name}
                  </div>
                  <div className="text-[12px] text-muted">
                    {TYPES[product.type]} · {METHOD_TEXT[product.method]}{' '}
                    {!product.is_active ? <Badge>Inactivo</Badge> : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        {chosen ? (
          <div className="min-w-0 space-y-4">
            <Card className="overflow-hidden">
              <Editor
                key={chosen}
                product={current}
                onSaved={(saved) => {
                  refresh()
                  setSelected(saved.id)
                }}
              />
            </Card>
            {current ? (
              <Card className="space-y-5">
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
