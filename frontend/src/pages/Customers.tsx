import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import type { Me } from '../api/accounts'
import { findInOtherBranches, grantBranchAccess, listCustomers } from '../api/customers'
import { usePrompt } from '../components/Dialog'
import { phoneText } from '../lib/format'
import {
  Badge,
  EmptyState,
  PageHeader,
  Pagination,
  rowLinkClass,
  RowList,
  SearchInput,
  Spinner,
} from '../components/ui'
import { buttonClass } from '../components/classes'
import { useDebounced } from '../lib/hooks'
import { ACCESS, hasRole } from '../lib/roles'

const GRANT_ROLES = ['Supervisor', 'Oficial de crédito', 'Cajero']

/** A document typed that is not in the user's branches: offer the logged,
 * same-day access of decision 033 (needs a reason). */
function OtherBranch({ document }: { document: string }) {
  const navigate = useNavigate()
  const [dialog, ask] = usePrompt()
  const hits = useQuery({
    queryKey: ['other-branch', document],
    queryFn: () => findInOtherBranches(document),
  })
  const grant = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => grantBranchAccess(id, note),
    onSuccess: (_data, { id }) => navigate({ to: '/clientes/$id', params: { id } }),
  })
  if (!hits.data?.length) return null
  return (
    <div className="space-y-2 rounded-xl border border-info-700/30 bg-info-700/5 p-4">
      {dialog}
      <p className="text-sm">Este documento es de un cliente de otra sucursal:</p>
      {hits.data.map((hit) => (
        <div key={hit.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>
            <strong>{hit.display_name}</strong> · {hit.document} · {hit.branch_name}
          </span>
          <button
            type="button"
            className={buttonClass('secondary')}
            disabled={grant.isPending}
            onClick={async () => {
              const note = await ask({
                title: `Atender a ${hit.display_name}`,
                label: 'Motivo',
                description:
                  'El acceso dura hasta el fin del día y queda registrado en la auditoría.',
                required: true,
                confirmText: 'Atender',
              })
              if (note) grant.mutate({ id: hit.id, note })
            }}
          >
            Atender aquí
          </button>
        </div>
      ))}
    </div>
  )
}

/** P11: customers, searchable by name, document or phone. */
export function CustomersPage({ me }: { me: Me }) {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const term = useDebounced(q.trim(), 300)
  const canCreate = hasRole(me, ACCESS.originate)
  const customers = useQuery({
    queryKey: ['customers', term, page],
    queryFn: () => listCustomers({ q: term, page }),
    placeholderData: keepPreviousData,
  })
  const rows = customers.data?.results ?? []
  const digits = term.replace(/\D/g, '')
  const lookOtherBranches =
    customers.data !== undefined &&
    rows.length === 0 &&
    digits.length >= 9 &&
    me.roles.some((role) => GRANT_ROLES.includes(role))

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle="Personas y empresas, con su expediente y sus garantías."
        actions={
          canCreate ? (
            <Link to="/clientes/nuevo" className={buttonClass()}>
              Nuevo cliente
            </Link>
          ) : null
        }
      />
      <SearchInput
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setPage(1)
        }}
        placeholder="Buscar por nombre, cédula, RNC o teléfono…"
      />
      {customers.isPending ? (
        <Spinner />
      ) : rows.length > 0 ? (
        <>
          <RowList>
            {rows.map((customer) => (
              <li key={customer.id}>
                <Link to="/clientes/$id" params={{ id: customer.id }} className={rowLinkClass}>
                  <div className="min-w-0">
                    <div className="truncate font-semibold">
                      {customer.display_name}
                      {customer.kind === 'company' ? (
                        <span className="ml-2 text-[12.5px] font-normal text-muted">Empresa</span>
                      ) : null}
                    </div>
                    <div className="text-[12.5px] text-muted tabular-nums">
                      {customer.document_number /* masked by the API (doc 06 - 7) */} ·{' '}
                      {phoneText(customer.phone) || 'sin teléfono'} · Sucursal{' '}
                      {customer.branch_code}
                    </div>
                  </div>
                  <Badge tone={customer.status === 'active' ? 'brand' : 'danger'}>
                    {customer.status === 'active' ? 'Activo' : 'Bloqueado'}
                  </Badge>
                </Link>
              </li>
            ))}
          </RowList>
          <Pagination page={page} count={customers.data?.count ?? 0} onChange={setPage} />
        </>
      ) : (
        <>
          {lookOtherBranches ? <OtherBranch document={digits} /> : null}
          <EmptyState
            action={
              canCreate && !term ? (
                <Link to="/clientes/nuevo" className={buttonClass()}>
                  Crear el primer cliente
                </Link>
              ) : null
            }
          >
            {term ? `Ningún cliente coincide con «${term}».` : 'Aún no hay clientes.'}
          </EmptyState>
        </>
      )}
    </>
  )
}
