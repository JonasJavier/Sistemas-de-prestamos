import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import type { Me } from '../api/accounts'
import { listProducts } from '../api/lending'
import { ConditionsForm, QuoteSummary } from '../components/Conditions'
import { ScheduleTable } from '../components/ScheduleTable'
import { Alert, Card, PageHeader } from '../components/ui'
import { EMPTY_CONDITIONS, toRequest, type Conditions } from '../lib/conditions'
import { hasRole, useLiveQuote } from '../lib/hooks'

export function SimulatorPage({ me }: { me: Me }) {
  const products = useQuery({ queryKey: ['products'], queryFn: listProducts })
  const [conditions, setConditions] = useState<Conditions>(EMPTY_CONDITIONS)
  const request = useMemo(() => toRequest(conditions), [conditions])
  const { quote, fieldErrors, errorText } = useLiveQuote(request)
  const data = quote.data
  const canOriginate = hasRole(me, 'Gerente', 'Supervisor', 'Oficial de crédito')

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
              className="inline-flex h-11 items-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 sm:h-9"
            >
              Crear solicitud
            </Link>
          ) : null
        }
      />

      <Card>
        <ConditionsForm
          products={products.data?.results ?? []}
          value={conditions}
          onChange={setConditions}
          errorText={errorText}
        />
      </Card>

      {quote.error && !fieldErrors ? (
        <Alert tone="danger">No se pudo cotizar. Intenta de nuevo.</Alert>
      ) : null}

      {data ? (
        <>
          <QuoteSummary data={data} />
          <Card>
            <ScheduleTable rows={data.schedule} principal={data.principal} />
          </Card>
        </>
      ) : null}
    </>
  )
}
