import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'

import { api } from '../api/client'
import { Card, Outcome, PublicPage, Spinner } from '../components/ui'
import { dateOf, rd } from '../lib/format'

interface Verification {
  valid: boolean
  detail?: string
  company?: string
  kind?: 'document' | 'receipt'
  label?: string
  folio?: string
  issued_at?: string
  fingerprint?: string
  legal_status?: string
  amount?: string
  reversed?: boolean
}

/** P91 · Verificar documento (decision 098): what a QR proves, publicly. */
export function VerifyPage() {
  const { token } = useParams({ from: '/v/$token' })
  const check = useQuery({
    queryKey: ['verify', token],
    queryFn: () => api<Verification>(`/api/v1/publico/verificar/${encodeURIComponent(token)}/`),
    retry: false,
  })
  const data = check.data
  return (
    <PublicPage subtitle="Verificación de documentos">
      {check.isPending ? (
        <Spinner />
      ) : !data ? (
        <Card>
          <Outcome tone="danger" title="Código desconocido">
            Este código no corresponde a ningún documento emitido con Cobradía. Si te lo presentaron
            como auténtico, desconfía.
          </Outcome>
        </Card>
      ) : (
        <Card className="space-y-4">
          <Outcome
            tone={data.valid && !data.reversed ? 'success' : data.reversed ? 'warning' : 'danger'}
            title={
              data.reversed
                ? 'Recibo auténtico, pero fue reversado'
                : data.valid
                  ? 'Documento auténtico'
                  : 'Documento revocado'
            }
          >
            Emitido por {data.company}.
          </Outcome>
          <dl className="divide-y divide-edge rounded-xl border border-edge text-[13.5px]">
            {[
              ['Documento', data.label],
              ['Folio', data.folio],
              ['Fecha', dateOf(data.issued_at)],
              ...(data.amount ? [['Monto', rd(data.amount)]] : []),
            ].map(([term, value]) => (
              <div key={term} className="flex justify-between gap-4 px-4 py-2.5">
                <dt className="text-muted">{term}</dt>
                <dd className="text-right font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
            {data.fingerprint ? (
              <div className="px-4 py-2.5">
                <dt className="text-muted">Huella</dt>
                <dd className="mt-0.5 break-all font-mono text-[12px]">{data.fingerprint}</dd>
              </div>
            ) : null}
          </dl>
          <p className="text-center text-[12.5px] text-muted">
            Compara estos datos con el papel que tienes: si no coinciden, el documento fue alterado.
          </p>
        </Card>
      )}
    </PublicPage>
  )
}
