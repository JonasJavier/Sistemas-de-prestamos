import { useQuery } from '@tanstack/react-query'

import { getMyCompany } from '../api/platform'
import { Alert, Card, PageHeader } from '../components/ui'
import { day, STATUS_BADGES } from '../lib/format'

export function SubscriptionPage() {
  const company = useQuery({ queryKey: ['my-company'], queryFn: getMyCompany })
  const data = company.data
  const badge = data ? STATUS_BADGES[data.status] : null

  return (
    <>
      <PageHeader title="Suscripción" subtitle="El plan de tu financiera y hasta cuándo está pagado." />

      {data?.status === 'trial' && typeof data.trial_days_left === 'number' ? (
        <Alert tone="info">
          Tu prueba gratis termina en <strong>{data.trial_days_left} días</strong> (
          {day(data.trial_ends_on)}).
        </Alert>
      ) : null}
      {data?.status === 'suspended' ? (
        <Alert tone="warning">
          {data.status_reason ||
            'La empresa está suspendida: puedes consultar y exportar, pero no operar.'}
        </Alert>
      ) : null}

      <Card>
        {company.isPending ? <p className="text-sm text-muted">Cargando…</p> : null}
        {data ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Estado de la cuenta</h2>
              {badge ? (
                <span
                  className={`rounded-full px-3 py-1 text-[12.5px] font-medium ${badge.classes}`}
                >
                  {badge.text}
                </span>
              ) : null}
            </div>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted">Plan</dt>
                <dd className="font-medium">{data.subscription?.plan.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted">Mensualidad</dt>
                <dd className="font-medium tabular-nums">
                  {data.subscription && Number(data.subscription.plan.monthly_price) > 0
                    ? `RD$ ${Number(data.subscription.plan.monthly_price).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`
                    : 'Gratis durante la prueba'}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Pagada hasta</dt>
                <dd className="font-medium tabular-nums">
                  {day(data.subscription?.paid_until)}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}
      </Card>

      <Card>
        <h2 className="text-base font-semibold">¿Cómo activo o renuevo mi suscripción?</h2>
        <p className="mt-1 text-sm text-muted">
          Por ahora el pago es por transferencia o depósito. Escríbenos y te enviamos los datos
          bancarios; al confirmar tu pago, activamos la cuenta el mismo día. Los planes y sus
          precios definitivos se publican antes del lanzamiento.
        </p>
      </Card>
    </>
  )
}
