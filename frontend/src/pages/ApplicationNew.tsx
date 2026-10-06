import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import { ApiError } from '../api/client'
import { getCustomer, type CustomerListItem } from '../api/customers'
import { listProducts } from '../api/lending'
import { createApplication } from '../api/origination'
import { ConditionsForm, QuoteSummary } from '../components/Conditions'
import { CustomerPicker } from '../components/CustomerPicker'
import { ScheduleTable } from '../components/ScheduleTable'
import { Alert, Badge, Button, Card, Field, Input, PageHeader } from '../components/ui'
import { toRequest, type Conditions } from '../lib/conditions'
import { errorMessage } from '../lib/format'
import { useLiveQuote } from '../lib/hooks'

export interface NewApplicationSearch {
  cliente?: string
  producto?: string
  monto?: string
  cuotas?: string
  frecuencia?: string
  tasa?: string
}

/** P27 step 1: customer and product, conditions with the live simulator. */
export function ApplicationNewPage() {
  const search = useSearch({ from: '/app/solicitudes/nueva' })
  const navigate = useNavigate()
  const products = useQuery({ queryKey: ['products'], queryFn: listProducts })
  const preselected = useQuery({
    queryKey: ['customer', search.cliente],
    queryFn: () => getCustomer(search.cliente!),
    enabled: Boolean(search.cliente),
  })
  const [picked, setPicked] = useState<CustomerListItem | null>(null)
  const customer = picked ?? (preselected.data as CustomerListItem | undefined) ?? null
  const [conditions, setConditions] = useState<Conditions>({
    productId: search.producto ?? '',
    amount: search.monto ?? '',
    installments: search.cuotas ?? '',
    frequency: search.frecuencia ?? '',
    rate: search.tasa ?? '',
  })
  const [purpose, setPurpose] = useState('')
  const request = useMemo(() => toRequest(conditions), [conditions])
  const { quote, fieldErrors, errorText } = useLiveQuote(request)

  const create = useMutation({
    mutationFn: () =>
      createApplication({
        customer: customer!.id,
        product: conditions.productId,
        amount: conditions.amount,
        installments: Number(conditions.installments),
        frequency: conditions.frequency,
        rate: conditions.rate || null,
        purpose,
      }),
    onSuccess: (application) =>
      navigate({ to: '/solicitudes/$id', params: { id: application.id } }),
  })
  const createError = create.error instanceof ApiError ? create.error.data : null

  return (
    <>
      <PageHeader
        back={
          <Link to="/solicitudes" className="hover:underline">
            ← Solicitudes
          </Link>
        }
        title="Nueva solicitud"
        subtitle="Elige el cliente y ajusta las condiciones: la cotización se actualiza mientras escribes."
      />

      <Card className="space-y-3">
        <h2 className="text-base font-semibold">1. Cliente</h2>
        {customer ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-edge bg-surface-2 px-3 py-2">
            <div>
              <span className="font-medium">{customer.display_name}</span>
              <span className="ml-2 text-sm text-muted tabular-nums">
                {customer.document_number}
              </span>
              {customer.status === 'blocked' ? (
                <span className="ml-2">
                  <Badge tone="danger">Bloqueado: no se podrá aprobar</Badge>
                </span>
              ) : null}
            </div>
            <Button variant="secondary" onClick={() => setPicked(null)} disabled={!picked}>
              Cambiar
            </Button>
          </div>
        ) : (
          <>
            <CustomerPicker onPick={setPicked} />
            <p className="text-[12.5px] text-muted">
              ¿No existe?{' '}
              <Link to="/clientes/nuevo" className="font-medium text-brand-700 hover:underline">
                Regístralo primero
              </Link>{' '}
              (F1: buscar antes de crear).
            </p>
          </>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-base font-semibold">2. Condiciones</h2>
        <ConditionsForm
          products={products.data?.results ?? []}
          value={conditions}
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
      </Card>

      {quote.data && !fieldErrors ? (
        <>
          <QuoteSummary data={quote.data} />
          <details className="rounded-xl border border-edge bg-surface p-4 shadow-sm">
            <summary className="cursor-pointer text-sm font-semibold">Ver tabla de pagos</summary>
            <div className="mt-3">
              <ScheduleTable rows={quote.data.schedule} principal={quote.data.principal} />
            </div>
          </details>
        </>
      ) : null}

      {createError ? <Alert tone="danger">{errorMessage(createError)}</Alert> : null}

      <div className="flex justify-end">
        <Button
          onClick={() => create.mutate()}
          disabled={!customer || !request || Boolean(fieldErrors) || create.isPending}
        >
          {create.isPending ? 'Creando…' : 'Crear borrador'}
        </Button>
      </div>
    </>
  )
}
