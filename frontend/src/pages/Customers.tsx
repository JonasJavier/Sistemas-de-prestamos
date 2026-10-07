import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { phoneText } from '../lib/format'

import type { Me } from '../api/accounts'
import { listCustomers } from '../api/customers'
import {
  Badge,
  buttonClass,
  EmptyState,
  PageHeader,
  Pagination,
  rowLinkClass,
  RowList,
  SearchInput,
  Spinner,
} from '../components/ui'
import { useDebounced } from '../lib/hooks'
import { ACCESS, hasRole } from '../lib/roles'

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
      )}
    </>
  )
}
