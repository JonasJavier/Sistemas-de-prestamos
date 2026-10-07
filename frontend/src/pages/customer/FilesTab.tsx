import { PrivateFiles } from '../../components/PrivateFiles'
import { Card } from '../../components/ui'

const KINDS = [
  ['id_front', 'Cédula (frente)'],
  ['id_back', 'Cédula (dorso)'],
  ['income_proof', 'Comprobante de ingresos'],
  ['photo', 'Foto'],
  ['consent', 'Consentimiento firmado'],
  ['other', 'Otro'],
] as const

export function FilesTab({ customerId }: { customerId: string }) {
  return (
    <Card>
      <h3 className="mb-2 text-base font-semibold">Archivos privados</h3>
      <PrivateFiles owner={{ field: 'customer', id: customerId }} kinds={KINDS} />
    </Card>
  )
}
