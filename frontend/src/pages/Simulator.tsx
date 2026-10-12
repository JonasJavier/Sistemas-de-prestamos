import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import type { Me } from '../api/accounts'
import { listProducts, type LoanProduct } from '../api/lending'
import { ConditionsForm, QuoteBlock } from '../components/Conditions'
import { ScheduleTable } from '../components/ScheduleTable'
import { Alert, Card, EmptyState, PageHeader, Spinner } from '../components/ui'
import { buttonClass } from '../components/classes'
import { startingConditions, toRequest, type Conditions } from '../lib/conditions'
import { useLiveQuote } from '../lib/hooks'
import { ACCESS, hasRole } from '../lib/roles'

export function SimulatorPage({ me }: { me: Me }) {
  const products = useQuery({ queryKey: ['products'], queryFn: listProducts })
  if (products.isPending) return <Spinner />
  return <Simulator me={me} products={products.data?.results ?? []} />
}

function Simulator({ me, products }: { me: Me; products: LoanProduct[] }) {
  const [conditions, setConditions] = useState<Conditions>(() => startingConditions(products))
  const request = useMemo(() => toRequest(conditions), [conditions])
  const { quote, fieldErrors, errorText } = useLiveQuote(request)
  const data = quote.data
  const canOriginate = hasRole(me, ACCESS.originate)

  return (
    <>
      <PageHeader
        title="Simulador"
        subtitle="Cotiza en vivo: el servidor calcula y nada se guarda hasta crear la solicitud."
        actions={
          canOriginate && data && !fieldErrors ? (
            <Link
              to="/solicitudes/nueva"
              search={{
                producto: conditions.productId,
                monto: conditions.amount,
                cuotas: conditions.installments,
                frecuencia: conditions.frequency,
                tasa: conditions.rate,
              }}
              className={buttonClass()}
            >
              Crear solicitud
            </Link>
          ) : null
        }
      />

      {products.length === 0 ? (
        <EmptyState>
          No hay productos activos. {me.is_manager ? 'Crea uno en Ajustes › Productos.' : ''}
        </EmptyState>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-4">
            <Card>
              <ConditionsForm
                products={products}
                value={conditions}
                onChange={setConditions}
                errorText={errorText}
              />
            </Card>
            {quote.error && !fieldErrors ? (
              <Alert tone="danger">No se pudo cotizar. Intenta de nuevo.</Alert>
            ) : null}
            {data ? (
              <Card>
                <h2 className="mb-3 text-[16px] font-semibold">Tabla de pagos</h2>
                <ScheduleTable rows={data.schedule} principal={data.principal} />
              </Card>
            ) : null}
          </div>
          <aside className="lg:sticky lg:top-24">
            {data && !fieldErrors ? (
              <QuoteBlock
                data={data}
                frequency={conditions.frequency}
                note="Una cotización: nada se guarda hasta crear la solicitud"
              />
            ) : null}
          </aside>
        </div>
      )}
    </>
  )
}
