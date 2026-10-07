import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { listLoans } from '../api/origination'
import {
  Badge,
  EmptyState,
  PageHeader,
  Pagination,
  rowLinkClass,
  RowList,
  SearchInput,
  Select,
  Spinner,
} from '../components/ui'
import { day, LOAN_STATUS, rd } from '../lib/format'
import { useDebounced } from '../lib/hooks'

/** P31: loans with filters; the totals respect the filters (doc 07 - 5). */
export function LoansPage() {
  const [status, setStatus] = useState('active')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const term = useDebounced(q.trim(), 300)
  const query = useQuery({
    queryKey: ['loans', status, term, page],
    queryFn: () => listLoans({ status, q: term, page }),
    placeholderData: keepPreviousData,
  })
  const rows = query.data?.results ?? []
  const count = query.data?.count ?? 0

  return (
    <>
      <PageHeader
        title="Préstamos"
        subtitle="Cartera de tu alcance, por número, cliente o cédula."
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_220px]">
        <SearchInput
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(1)
          }}
          placeholder="Buscar por número, cliente o cédula…"
        />
        <Select
          aria-label="Estado"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
        >
          <option value="">Todos los estados</option>
          {Object.entries(LOAN_STATUS).map(([key, value]) => (
            <option key={key} value={key}>
              {value.label}
            </option>
          ))}
        </Select>
      </div>
      {query.isPending ? (
        <Spinner />
      ) : rows.length > 0 ? (
        <>
          <RowList>
            {rows.map((loan) => {
              const s = LOAN_STATUS[loan.status]
              return (
                <li key={loan.id}>
                  <Link
                    to="/prestamos/$numero"
                    params={{ numero: loan.number }}
                    className={rowLinkClass}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold tabular-nums">{loan.number}</span>
                        <Badge tone={s?.tone}>{s?.label ?? loan.status}</Badge>
                      </div>
                      <div className="truncate text-sm">
                        {loan.customer_name}{' '}
                        <span className="text-muted tabular-nums">· {loan.customer_document}</span>
                      </div>
                      <div className="text-[12.5px] text-muted">{loan.product_name}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-display font-bold tabular-nums">
                        {rd(loan.principal_outstanding)}
                      </div>
                      <div className="text-[12.5px] text-muted">
                        {loan.next_due_date
                          ? `Próxima cuota ${day(loan.next_due_date)}`
                          : 'Sin cuotas pendientes'}
                      </div>
                    </div>
                  </Link>
                </li>
              )
            })}
            <li className="flex flex-wrap items-center justify-between gap-2 bg-surface-2 px-4 py-3 text-sm font-semibold">
              <span>
                {count} préstamo{count === 1 ? '' : 's'}
              </span>
              <span className="tabular-nums">
                Capital pendiente {rd(query.data?.totals.principal_outstanding)}
              </span>
            </li>
          </RowList>
          <Pagination page={page} count={count} onChange={setPage} />
        </>
      ) : (
        <EmptyState>
          {term ? `Ningún préstamo coincide con «${term}».` : 'No hay préstamos con estos filtros.'}
        </EmptyState>
      )}
    </>
  )
}
