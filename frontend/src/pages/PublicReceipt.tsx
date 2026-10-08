import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'

import { getPublicReceipt } from '../api/payments'
import { ReceiptView } from '../components/ReceiptView'
import { Brand, Button, Spinner } from '../components/ui'
import { printArea } from '../lib/print'

/** The receipt shared by WhatsApp (decision 024): no session, only this
 * receipt, the document masked; a revoked link shows nothing. */
export function PublicReceiptPage() {
  const { token } = useParams({ from: '/r/$token' })
  const receipt = useQuery({
    queryKey: ['public-receipt', token],
    queryFn: () => getPublicReceipt(token),
    retry: false,
  })
  return (
    <main className="mx-auto min-h-screen max-w-2xl space-y-4 px-4 py-8">
      <div className="flex items-center justify-between">
        <Brand className="text-xl" />
        {receipt.data ? (
          <Button variant="secondary" onClick={() => printArea('letter')}>
            Imprimir o guardar en PDF
          </Button>
        ) : null}
      </div>
      {receipt.isPending ? (
        <Spinner />
      ) : receipt.data ? (
        <div id="print-area">
          <ReceiptView receipt={receipt.data} />
        </div>
      ) : (
        <div className="rounded-xl border border-edge bg-surface p-6 text-center">
          <h1 className="text-lg font-semibold">Este enlace no está disponible</h1>
          <p className="mt-1 text-sm text-muted">
            No existe o la financiera lo revocó. Pídele que te envíe el recibo de nuevo.
          </p>
        </div>
      )}
    </main>
  )
}
