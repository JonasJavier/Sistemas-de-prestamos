import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'

import { api } from '../api/client'
import { Alert, Card, PublicPage, Spinner } from '../components/ui'
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
        <Alert tone="danger">
          Este código no corresponde a ningún documento emitido con Cobradía. Si te lo presentaron
          como auténtico, desconfía.
        </Alert>
      ) : (
        <Card className="space-y-2">
          <div
            className={`text-lg font-semibold ${data.valid && !data.reversed ? 'text-success-600' : 'text-danger-600'}`}
          >
            {data.reversed
              ? 'Recibo auténtico, pero fue reversado'
              : data.valid
                ? 'Documento auténtico'
                : 'Documento revocado'}
          </div>
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted">Emitido por</dt>
            <dd>{data.company}</dd>
            <dt className="text-muted">Documento</dt>
            <dd>{data.label}</dd>
            <dt className="text-muted">Folio</dt>
            <dd className="tabular-nums">{data.folio}</dd>
            <dt className="text-muted">Fecha</dt>
            <dd>{dateOf(data.issued_at)}</dd>
            {data.amount ? (
              <>
                <dt className="text-muted">Monto</dt>
                <dd className="tabular-nums">{rd(data.amount)}</dd>
              </>
            ) : null}
            {data.fingerprint ? (
              <>
                <dt className="text-muted">Huella</dt>
                <dd className="font-mono text-[12.5px]">{data.fingerprint}</dd>
              </>
            ) : null}
          </dl>
          <p className="text-[12.5px] text-muted">
            Compara estos datos con el papel que tienes: si no coinciden, el documento fue alterado.
          </p>
        </Card>
      )}
    </PublicPage>
  )
}
