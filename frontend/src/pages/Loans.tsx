import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'

import type { Me } from '../api/accounts'
import { ApiError } from '../api/client'
import { listLoans } from '../api/origination'
import { assignCollector, listCollectors } from '../api/routes'
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Pagination,
  rowLinkClass,
  RowList,
  SearchInput,
  Select,
  Spinner,
} from '../components/ui'
import { day, errorMessage, LOAN_STATUS, rd, plural } from '../lib/format'
import { useDebounced } from '../lib/hooks'
import { ACCESS, hasRole } from '../lib/roles'
import { notify } from '../lib/toast'

export interface LoansSearch {
  /** A collector's id, or «none» for the loans without one (P45). */
  cobrador?: string
}

/** P31: loans with filters; the totals respect the filters (doc 07 - 5).
 * Supervisors assign the portfolio to collectors from here (P45). */
export function LoansPage({ me }: { me: Me }) {
  const search = useSearch({ from: '/app/prestamos' })
  const navigate = useNavigate({ from: '/prestamos' })
  const queryClient = useQueryClient()
  const supervisor = hasRole(me, ACCESS.supervise)
  const [status, setStatus] = useState('active')
  const [tramo, setTramo] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<string[]>([])
  const [target, setTarget] = useState('')
  const collector = search.cobrador ?? ''
  const term = useDebounced(q.trim(), 300)
  const query = useQuery({
    queryKey: ['loans', status, term, page, collector, tramo],
    queryFn: () => listLoans({ status, q: term, page, collector, tramo }),
    placeholderData: keepPreviousData,
  })
  const collectors = useQuery({
    queryKey: ['collectors'],
    queryFn: listCollectors,
    enabled: supervisor,
  })
  const assign = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      assignCollector({ loans: selected, collector: target === 'none' ? null : target }),
    onSuccess: (result) => {
      notify(
        `${plural(result.changed, 'préstamo reasignado', 'préstamos reasignados')}.`,
        'success',
      )
      setSelected([])
      void queryClient.invalidateQueries({ queryKey: ['loans'] })
      void queryClient.invalidateQueries({ queryKey: ['routes'] })
    },
  })
  const rows = query.data?.results ?? []
  const count = query.data?.count ?? 0
  const toggle = (number: string) =>
    setSelected((current) =>
      current.includes(number) ? current.filter((n) => n !== number) : [...current, number],
    )

  return (
    <>
      <PageHeader
        title="Préstamos"
        subtitle="Cartera de tu alcance, por número, cliente o cédula."
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_180px_160px] lg:grid-cols-[1fr_180px_160px_200px]">
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
        <Select
          aria-label="Atraso"
          value={tramo}
          onChange={(e) => {
            setTramo(e.target.value)
            setPage(1)
          }}
        >
          <option value="">Con y sin atraso</option>
          <option value="al_dia">Al día</option>
          <option value="atraso">En atraso</option>
        </Select>
        {supervisor ? (
          <Select
            aria-label="Cobrador"
            value={collector}
            onChange={(e) => {
              setPage(1)
              setSelected([])
              void navigate({ search: e.target.value ? { cobrador: e.target.value } : {} })
            }}
          >
            <option value="">Todos los cobradores</option>
            <option value="none">Sin cobrador</option>
            {collectors.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        ) : null}
      </div>
      {supervisor && selected.length ? (
        <div className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-brand-700/40 bg-brand-100 px-4 py-2 text-sm">
          <span className="font-semibold">{plural(selected.length, 'seleccionado')}</span>
          <Select aria-label="Asignar a" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Asignar a…</option>
            <option value="none">Quitar el cobrador</option>
            {collectors.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Button onClick={() => assign.mutate()} disabled={!target || assign.isPending}>
            Asignar
          </Button>
          <Button variant="secondary" onClick={() => setSelected([])}>
            Cancelar
          </Button>
          {assign.error instanceof ApiError ? (
            <Alert tone="danger">{errorMessage(assign.error.data)}</Alert>
          ) : null}
        </div>
      ) : null}
      {query.isPending ? (
        <Spinner />
      ) : rows.length > 0 ? (
        <>
          <RowList>
            {rows.map((loan) => {
              const s = LOAN_STATUS[loan.status]
              return (
                <li key={loan.id} className="flex items-stretch">
                  {supervisor && loan.status === 'active' ? (
                    <label className="flex items-center pl-4">
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar ${loan.number}`}
                        checked={selected.includes(loan.number)}
                        onChange={() => toggle(loan.number)}
                      />
                    </label>
                  ) : null}
                  <Link
                    to="/prestamos/$numero"
                    params={{ numero: loan.number }}
                    className={`${rowLinkClass} flex-1`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold tabular-nums">{loan.number}</span>
                        <Badge tone={s?.tone}>{s?.label ?? loan.status}</Badge>
                        {loan.status === 'active' && loan.days_past_due > 0 ? (
                          <Badge tone="danger">{loan.days_past_due} días de atraso</Badge>
                        ) : null}
                      </div>
                      <div className="truncate text-sm">
                        {loan.customer_name}{' '}
                        <span className="text-muted tabular-nums">· {loan.customer_document}</span>
                      </div>
                      <div className="text-[12.5px] text-muted">{loan.product_name}</div>
                    </div>
                    <div className="sm:text-right">
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
