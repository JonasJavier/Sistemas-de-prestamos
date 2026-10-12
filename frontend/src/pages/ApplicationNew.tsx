import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import { ApiError } from '../api/client'
import { getCustomer, type CustomerListItem } from '../api/customers'
import { listProducts } from '../api/lending'
import { createApplication } from '../api/origination'
import { ArrowRightIcon } from '../components/icons'
import { ConditionsForm, QuoteBlock } from '../components/Conditions'
import { CustomerPicker } from '../components/CustomerPicker'
import { ScheduleTable } from '../components/ScheduleTable'
import { Steps } from '../components/Steps'
import { Alert, Avatar, Badge, Button, Field, Input, Spinner } from '../components/ui'
import { startingConditions, toRequest, type Conditions } from '../lib/conditions'
import { documentText, errorMessage } from '../lib/format'
import { useDocumentTitle, useLiveQuote, useMedia } from '../lib/hooks'

export interface NewApplicationSearch {
  cliente?: string
  producto?: string
  monto?: string
  cuotas?: string
  frecuencia?: string
  tasa?: string
}

const STEPS = [
  { label: 'Cliente', hint: 'Quién pide el préstamo' },
  { label: 'Condiciones', hint: 'Monto, plazo y tasa' },
  { label: 'Garantías', hint: 'Bienes y garantes' },
  { label: 'Documentos', hint: 'Cédula, ingresos' },
  { label: 'Revisión', hint: 'Enviar a decisión' },
]

/** P27, the new application as a guided task (decision 115): who, then the
 * conditions with «Así queda» recomputed live by the server. Guarantees,
 * documents and the review follow on the draft itself. */
export function ApplicationNewPage() {
  useDocumentTitle('Nueva solicitud')
  const search = useSearch({ from: '/app/solicitudes/nueva' })
  const navigate = useNavigate()
  const products = useQuery({ queryKey: ['products'], queryFn: listProducts })
  const preselected = useQuery({
    queryKey: ['customer', search.cliente],
    queryFn: () => getCustomer(search.cliente!),
    enabled: Boolean(search.cliente),
  })
  const [picked, setPicked] = useState<CustomerListItem | null>(null)
  const [changing, setChanging] = useState(false)
  const customer = changing
    ? null
    : (picked ?? (preselected.data as CustomerListItem | undefined) ?? null)
  const [conditions, setConditions] = useState<Conditions>({
    productId: search.producto ?? '',
    amount: search.monto ?? '',
    installments: search.cuotas ?? '',
    frequency: search.frecuencia ?? '',
    rate: search.tasa ?? '',
  })
  // Until the officer picks one, the first active product with its defaults
  // (the amount stays empty: it must be typed, never assumed).
  const starting = useMemo(
    () => ({ ...startingConditions(products.data?.results ?? []), amount: '' }),
    [products.data],
  )
  const value = useMemo(
    () => (conditions.productId ? conditions : { ...starting, amount: conditions.amount }),
    [conditions, starting],
  )
  const [purpose, setPurpose] = useState('')
  const request = useMemo(() => toRequest(value), [value])
  const { quote, fieldErrors, errorText } = useLiveQuote(request)

  const create = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      createApplication({
        customer: customer!.id,
        product: value.productId,
        amount: value.amount,
        installments: Number(value.installments),
        frequency: value.frequency,
        rate: value.rate || null,
        purpose,
      }),
    onSuccess: (application) =>
      navigate({ to: '/solicitudes/$id', params: { id: application.id } }),
  })
  const createError = create.error instanceof ApiError ? create.error.data : null
  const step = customer ? 1 : 0
  const ready = Boolean(customer && request && quote.data && !fieldErrors)
  const wide = useMedia('(min-width: 1280px)')

  return (
    <>
      <div className="flex items-start justify-between gap-3 lg:hidden">
        <div className="min-w-0">
          <p className="text-[12.5px] text-muted">
            Paso {step + 1} de {STEPS.length}
            {customer ? ` · ${customer.display_name}` : ''}
          </p>
          <h1 className="text-[24px] leading-tight">{STEPS[step].label}</h1>
        </div>
        <Link
          to="/solicitudes"
          aria-label="Salir sin guardar"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-lg text-muted ring-1 ring-edge"
        >
          ×
        </Link>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)_340px]">
        <div className="lg:sticky lg:top-24 lg:pt-2">
          <Steps
            steps={STEPS.map((s, i) =>
              i === 0 && customer ? { ...s, hint: customer.display_name } : s,
            )}
            current={step}
          />
        </div>

        <section className="min-w-0 overflow-hidden rounded-card border border-edge bg-surface shadow-sm">
          <div className="border-b border-edge px-5 py-4 sm:px-6">
            <p className="eyebrow max-lg:hidden">
              Paso {step + 1} de {STEPS.length}
            </p>
            <h2 className="mt-1 text-[22px] font-bold tracking-[-0.02em] max-lg:hidden sm:text-[24px]">
              {customer ? 'Condiciones del préstamo' : '¿Para quién es el préstamo?'}
            </h2>
            {customer ? (
              <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-muted lg:mt-2">
                <Avatar name={customer.display_name} size="sm" />
                <span>
                  Para <strong className="text-ink">{customer.display_name}</strong> ·{' '}
                  <span className="tabular-nums">{documentText(customer.document_number)}</span>
                </span>
                {customer.status === 'blocked' ? (
                  <Badge tone="danger" dot>
                    Bloqueado: no se podrá aprobar
                  </Badge>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="px-5 py-5 sm:px-6">
            {!customer ? (
              <div className="space-y-3">
                {search.cliente && preselected.isPending && !changing ? (
                  <Spinner />
                ) : (
                  <>
                    <CustomerPicker
                      onPick={(c) => {
                        setPicked(c)
                        setChanging(false)
                      }}
                    />
                    <p className="text-[12.5px] text-muted">
                      ¿No existe?{' '}
                      <Link
                        to="/clientes/nuevo"
                        className="font-medium text-brand-700 hover:underline"
                      >
                        Regístralo primero
                      </Link>
                      : así evitamos clientes duplicados.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                <ConditionsForm
                  products={products.data?.results ?? []}
                  value={value}
                  onChange={setConditions}
                  errorText={errorText}
                />
                <Field label="Destino del préstamo (opcional)">
                  <Input
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    placeholder="Capital de trabajo, compra de motor…"
                  />
                </Field>
                {/* On a desktop «Así queda» stands at the right; here, under the form. */}
                {!wide && quote.data && !fieldErrors ? (
                  <QuoteBlock data={quote.data} frequency={value.frequency} />
                ) : null}
                {quote.data && !fieldErrors ? (
                  <details className="rounded-xl border border-edge bg-surface-2/60 px-4 py-3">
                    <summary className="cursor-pointer text-[13px] font-semibold">
                      Ver la tabla de pagos completa
                    </summary>
                    <div className="mt-3">
                      <ScheduleTable rows={quote.data.schedule} principal={quote.data.principal} />
                    </div>
                  </details>
                ) : null}
                {createError ? <Alert tone="danger">{errorMessage(createError)}</Alert> : null}
              </div>
            )}
          </div>

          <div className="sticky bottom-20 flex flex-wrap items-center justify-between gap-3 border-t border-edge bg-surface/95 px-5 py-3.5 backdrop-blur-sm sm:static sm:px-6">
            {customer ? (
              <button
                type="button"
                onClick={() => {
                  setPicked(null)
                  setChanging(true)
                }}
                className="text-[13.5px] font-semibold text-muted hover:text-ink"
              >
                ← Cambiar cliente
              </button>
            ) : (
              <Link
                to="/solicitudes"
                className="text-[13.5px] font-semibold text-muted hover:text-ink"
              >
                Cancelar
              </Link>
            )}
            <Button
              onClick={() => create.mutate()}
              disabled={!ready || create.isPending}
              className="max-sm:flex-1"
            >
              {create.isPending ? 'Guardando…' : 'Continuar: garantías'}
              <ArrowRightIcon />
            </Button>
          </div>
        </section>

        {wide ? (
          <aside className="sticky top-24">
            {customer && quote.data && !fieldErrors ? (
              <QuoteBlock
                data={quote.data}
                frequency={value.frequency}
                note="La solicitud la aprueba un decisor antes del desembolso"
              />
            ) : (
              <div className="relative overflow-hidden rounded-block bg-brand-950 px-5 py-6 text-on-forest">
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-200">
                  Así queda
                </div>
                <p className="mt-3 text-[13.5px] text-brand-200">
                  {customer
                    ? 'Escribe el monto: la cuota, el total y las primeras fechas aparecen aquí.'
                    : 'Elige el cliente y las condiciones: aquí verás la cuota y lo que costará.'}
                </p>
              </div>
            )}
          </aside>
        ) : null}
      </div>
    </>
  )
}
