import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { useState } from 'react'

import { blockCustomer, getCustomer, unblockCustomer } from '../api/customers'
import { Alert, Button, Card } from '../components/ui'
import { CollateralTab } from './customer/CollateralTab'
import { FamilyTab } from './customer/FamilyTab'
import { FilesTab } from './customer/FilesTab'
import { IncomeTab } from './customer/IncomeTab'

const TABS = [
  ['resumen', 'Resumen'],
  ['ingresos', 'Ingresos'],
  ['familia', 'Familia y referencias'],
  ['garantias', 'Garantías'],
  ['archivos', 'Archivos'],
] as const

type TabKey = (typeof TABS)[number][0]

export function CustomerDetailPage() {
  const { id } = useParams({ from: '/app/clientes/$id' })
  const [tab, setTab] = useState<TabKey>('resumen')
  const queryClient = useQueryClient()
  const customer = useQuery({ queryKey: ['customer', id], queryFn: () => getCustomer(id) })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['customer', id] })
  const block = useMutation({
    mutationFn: (reason: string) => blockCustomer(id, reason),
    onSuccess: refresh,
  })
  const unblock = useMutation({ mutationFn: () => unblockCustomer(id), onSuccess: refresh })

  const data = customer.data
  if (customer.isPending) return <p className="text-sm text-muted">Cargando…</p>
  if (!data) return <Alert tone="danger">No se encontró el cliente.</Alert>

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link to="/clientes" className="text-[12.5px] text-muted hover:underline">
            ← Clientes
          </Link>
          <h1 className="text-xl font-semibold">{data.display_name}</h1>
          <p className="text-sm text-muted tabular-nums">
            {data.document_type === 'rnc' ? 'RNC' : 'Documento'}: {data.document_number}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-[12.5px] font-medium ${
              data.status === 'active'
                ? 'bg-brand-100 text-brand-800'
                : 'bg-danger-600/15 text-danger-600'
            }`}
          >
            {data.status === 'active' ? 'Activo' : 'Bloqueado'}
          </span>
          {data.status === 'active' ? (
            <Button
              variant="secondary"
              onClick={() => {
                const reason = window.prompt('Motivo del bloqueo («no prestar»):')
                if (reason) block.mutate(reason)
              }}
              disabled={block.isPending}
            >
              Bloquear
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => unblock.mutate()}
              disabled={unblock.isPending}
            >
              Desbloquear
            </Button>
          )}
        </div>
      </div>

      {data.status === 'blocked' ? (
        <Alert tone="danger">
          Cliente bloqueado: {data.block_reason || 'sin motivo registrado'}.
        </Alert>
      ) : null}

      <nav className="flex gap-1 overflow-x-auto border-b border-edge">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
              tab === key
                ? 'border-brand-700 text-brand-700'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'resumen' ? (
        <Card>
          <h2 className="mb-2 text-base font-semibold">Datos de contacto</h2>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted">Teléfono</dt>
              <dd className="font-medium tabular-nums">{data.phone}</dd>
            </div>
            <div>
              <dt className="text-muted">Correo</dt>
              <dd className="font-medium">{data.email || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted">Dirección</dt>
              <dd className="font-medium">{data.address_line || '—'}</dd>
            </div>
          </dl>
        </Card>
      ) : null}
      {tab === 'ingresos' ? <IncomeTab customerId={id} /> : null}
      {tab === 'familia' ? <FamilyTab customerId={id} /> : null}
      {tab === 'garantias' ? <CollateralTab customerId={id} /> : null}
      {tab === 'archivos' ? <FilesTab customerId={id} /> : null}
    </>
  )
}
