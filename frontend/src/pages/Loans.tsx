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

const LOAN_COLUMNS =
  'md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.1fr)] md:items-center'

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
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_180px_160px] xl:grid-cols-[1fr_180px_160px_200px]">
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
          <div className="overflow-hidden rounded-card border border-edge bg-surface shadow-sm">
            <div
              className={`${LOAN_COLUMNS} hidden gap-x-4 border-b border-edge bg-surface-2 py-2.5 pr-5 text-[12.5px] font-medium text-muted md:grid ${
                supervisor ? 'pl-12' : 'pl-5'
              }`}
            >
              <span>Préstamo</span>
              <span>Cliente</span>
              <span className="text-right">Saldo de capital</span>
              <span>Próxima cuota</span>
              <span>Estado</span>
            </div>
            <ul className="divide-y divide-edge">
              {rows.map((loan, index) => {
                const s = LOAN_STATUS[loan.status]
                const late = loan.status === 'active' && loan.days_past_due > 0
                return (
                  <li
                    key={loan.id}
                    className="flex animate-reveal items-stretch"
                    style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }}
                  >
                    {supervisor ? (
                      <label className="flex w-12 shrink-0 items-center justify-center">
                        {loan.status === 'active' ? (
                          <input
                            type="checkbox"
                            aria-label={`Seleccionar ${loan.number}`}
                            checked={selected.includes(loan.number)}
                            onChange={() => toggle(loan.number)}
                          />
                        ) : null}
                      </label>
                    ) : null}
                    <Link
                      to="/prestamos/$numero"
                      params={{ numero: loan.number }}
                      className={`press flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 pr-4 outline-none hover:bg-brand-50/60 focus-visible:bg-brand-50 md:grid ${LOAN_COLUMNS} ${
                        supervisor ? '' : 'pl-4 md:pl-5'
                      } md:pr-5`}
                    >
                      <span className="min-w-0">
                        <span className="block font-semibold tabular-nums">{loan.number}</span>
                        <span className="block truncate text-[12px] text-muted">
                          {loan.product_name}
                        </span>
                      </span>
                      <span className="min-w-0 max-md:order-first max-md:basis-full">
                        <span className="block truncate text-[13.5px] font-medium">
                          {loan.customer_name}
                        </span>
                        <span className="block truncate text-[12px] text-muted tabular-nums">
                          {loan.customer_document}
                        </span>
                      </span>
                      <span className="text-right font-display text-[15px] font-semibold tabular-nums">
                        {rd(loan.principal_outstanding)}
                      </span>
                      {/* A date already past is not «próxima»: it is the oldest one unpaid. */}
                      <span
                        className={`text-[12.5px] max-md:hidden ${late ? 'text-danger-600' : 'text-muted'}`}
                      >
                        {!loan.next_due_date
                          ? 'Sin cuotas pendientes'
                          : late
                            ? `Vencida desde ${day(loan.next_due_date)}`
                            : day(loan.next_due_date)}
                      </span>
                      <span className="flex flex-wrap gap-1.5">
                        {late ? (
                          <Badge tone={loan.days_past_due > 30 ? 'danger' : 'warning'} dot>
                            {plural(loan.days_past_due, 'día')} de atraso
                          </Badge>
                        ) : (
                          <Badge tone={s?.tone} dot>
                            {loan.status === 'active' ? 'Al día' : (s?.label ?? loan.status)}
                          </Badge>
                        )}
                      </span>
                    </Link>
                  </li>
                )
              })}
              <li className="flex flex-wrap items-center justify-between gap-2 bg-surface-2 px-5 py-3 text-sm font-semibold">
                <span>{plural(count, 'préstamo')}</span>
                <span className="tabular-nums">
                  Capital pendiente {rd(query.data?.totals.principal_outstanding)}
                </span>
              </li>
            </ul>
          </div>
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
