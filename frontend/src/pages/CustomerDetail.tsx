import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { useState } from 'react'
import { usePrompt } from '../components/Dialog'

import type { Me } from '../api/accounts'
import { blockCustomer, getCustomer, unblockCustomer } from '../api/customers'
import { listApplications, listLoans } from '../api/origination'
import { ClassificationNote } from '../components/Grade'
import { Alert, Badge, Button, Card, PageHeader, Tabs } from '../components/ui'
import { buttonClass } from '../components/classes'
import { APPLICATION_STATUS, dateOf, documentText, LOAN_STATUS, phoneText, rd } from '../lib/format'
import { ACCESS, hasRole } from '../lib/roles'
import { CollateralTab } from './customer/CollateralTab'
import { FamilyTab } from './customer/FamilyTab'
import { FilesTab } from './customer/FilesTab'
import { IncomeTab } from './customer/IncomeTab'
import { PaymentsTab } from './customer/PaymentsTab'
import { MessagesTab } from './customer/MessagesTab'
import { CollectionTimeline } from '../components/CollectionTimeline'

const TABS = [
  ['resumen', 'Resumen'],
  ['ingresos', 'Ingresos'],
  ['familia', 'Familia y referencias'],
  ['garantias', 'Garantías'],
  ['archivos', 'Archivos'],
  ['prestamos', 'Préstamos y solicitudes'],
  ['pagos', 'Pagos'],
  ['cobranza', 'Cobranza'],
  ['mensajes', 'Mensajes'],
] as const

type TabKey = (typeof TABS)[number][0]

/** Every request stays in the customer's history (reference defect #22). */
function LendingTab({ customerId }: { customerId: string }) {
  const loans = useQuery({
    queryKey: ['loans', 'customer', customerId],
    queryFn: () => listLoans({ customer: customerId }),
  })
  const applications = useQuery({
    queryKey: ['applications', 'customer', customerId],
    queryFn: () => listApplications({ customer: customerId }),
  })
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <h2 className="mb-2 text-base font-semibold">Préstamos</h2>
        {loans.data?.results.length ? (
          <ul className="divide-y divide-edge text-sm">
            {loans.data.results.map((loan) => (
              <li key={loan.id} className="flex items-center justify-between gap-2 py-2">
                <Link
                  to="/prestamos/$numero"
                  params={{ numero: loan.number }}
                  className="font-medium tabular-nums text-brand-700 hover:underline"
                >
                  {loan.number}
                </Link>
                <Badge tone={LOAN_STATUS[loan.status]?.tone}>
                  {LOAN_STATUS[loan.status]?.label}
                </Badge>
                <span className="tabular-nums">{rd(loan.principal_outstanding)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Sin préstamos.</p>
        )}
      </Card>
      <Card>
        <h2 className="mb-2 text-base font-semibold">Solicitudes</h2>
        {applications.data?.results.length ? (
          <ul className="divide-y divide-edge text-sm">
            {applications.data.results.map((app) => (
              <li key={app.id} className="flex items-center justify-between gap-2 py-2">
                <Link
                  to="/solicitudes/$id"
                  params={{ id: app.id }}
                  className="font-medium tabular-nums text-brand-700 hover:underline"
                >
                  {app.number}
                </Link>
                <Badge tone={APPLICATION_STATUS[app.status]?.tone}>
                  {APPLICATION_STATUS[app.status]?.label}
                </Badge>
                <span className="text-muted">{dateOf(app.created_at)}</span>
                <span className="tabular-nums">{rd(app.amount)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Sin solicitudes.</p>
        )}
      </Card>
    </div>
  )
}

export function CustomerDetailPage({ me }: { me: Me }) {
  const [dialog, ask] = usePrompt()
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
      {dialog}
      <PageHeader
        back={
          <Link to="/clientes" className="hover:underline">
            ← Clientes
          </Link>
        }
        documentTitle={data.display_name}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {data.display_name}
            <Badge tone={data.status === 'active' ? 'brand' : 'danger'}>
              {data.status === 'active' ? 'Activo' : 'Bloqueado'}
            </Badge>
          </span>
        }
        subtitle={
          <span className="tabular-nums">
            {data.document_type === 'rnc' ? 'RNC' : 'Cédula'} {documentText(data.document_number)}
            {data.phone ? ` · ${phoneText(data.phone)}` : ''}
          </span>
        }
        actions={
          <>
            {data.status === 'active' ? (
              <Button
                variant="secondary"
                onClick={async () => {
                  const reason = await ask({
                    title: `Bloquear a ${data.display_name}`,
                    description: 'Un cliente bloqueado no recibe préstamos nuevos («no prestar»).',
                    label: 'Motivo del bloqueo',
                    type: 'textarea',
                    required: true,
                    confirmText: 'Bloquear',
                    danger: true,
                  })
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
            {hasRole(me, ACCESS.originate) && data.status === 'active' ? (
              <Link to="/solicitudes/nueva" search={{ cliente: id }} className={buttonClass()}>
                Nueva solicitud
              </Link>
            ) : null}
          </>
        }
      />

      {data.status === 'blocked' ? (
        <Alert tone="danger">
          Cliente bloqueado: {data.block_reason || 'sin motivo registrado'}.
        </Alert>
      ) : null}
      {data.classification ? <ClassificationNote value={data.classification} /> : null}

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'resumen' ? (
        <Card>
          <h2 className="mb-2 text-base font-semibold">Datos de contacto</h2>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted">Teléfono</dt>
              <dd className="font-medium tabular-nums">{phoneText(data.phone) || '—'}</dd>
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
      {tab === 'prestamos' ? <LendingTab customerId={id} /> : null}
      {tab === 'pagos' ? <PaymentsTab customerId={id} /> : null}
      {tab === 'mensajes' ? (
        <MessagesTab
          customerId={id}
          canEdit={hasRole(me, [
            'Gerente',
            'Supervisor',
            'Oficial de crédito',
            'Cajero',
            'Cobrador',
          ])}
        />
      ) : null}
      {tab === 'cobranza' ? (
        <CollectionTimeline customerId={id} customerName={data.display_name} canManage={false} />
      ) : null}
    </>
  )
}
