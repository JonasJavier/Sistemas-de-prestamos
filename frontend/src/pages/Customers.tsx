import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState, type MouseEvent } from 'react'

import type { Me } from '../api/accounts'
import {
  type CustomerListItem,
  type CustomerState,
  findInOtherBranches,
  getCustomerSummary,
  grantBranchAccess,
  listCustomers,
} from '../api/customers'
import { getLoanCalendar } from '../api/origination'
import { listCollectors } from '../api/routes'
import { usePrompt } from '../components/Dialog'
import { ChevronRightIcon, PlusIcon } from '../components/icons'
import {
  Avatar,
  Badge,
  EmptyState,
  PAGE_SIZE,
  PageHeader,
  Pagination,
  SearchInput,
  Segmented,
  Select,
  Spinner,
  Texture,
} from '../components/ui'
import { buttonClass } from '../components/classes'
import { monthYear, nearDay, phoneText, plural, rd, short, whole } from '../lib/format'
import { customerState, routeOf } from '../lib/customers'
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
    <div className="space-y-2 rounded-xl border border-info-700/30 bg-info-100 p-4">
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

const COLUMNS =
  'grid grid-cols-[minmax(0,1.7fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1.05fr)_20px] items-center gap-x-4'

/** The quick view of a customer (decision 115): balance, the progress of the
 * loan due soonest, the next installment and the two actions. */
function QuickView({ customer, me }: { customer: CustomerListItem; me: Me }) {
  const p = customer.portfolio
  const state = customerState(customer)
  const calendar = useQuery({
    queryKey: ['loan-calendar', p?.loan],
    queryFn: () => getLoanCalendar(p!.loan!),
    enabled: Boolean(p?.loan),
  })
  const rows = calendar.data?.installments ?? []
  const version = Math.max(0, ...rows.map((row) => row.version))
  const current = rows.filter((row) => row.version === version && row.status !== 'superseded')
  const paid = current.filter((row) => row.status === 'paid').length
  const collects = hasRole(me, ACCESS.collect)
  return (
    <aside
      aria-label={`Vista rápida de ${customer.display_name}`}
      className="sticky top-24 hidden self-start overflow-hidden rounded-card border border-edge bg-surface shadow-sm xl:block"
    >
      <div key={customer.id} className="animate-fade">
        <div className="relative border-b border-edge px-5 pb-[18px] pt-5">
          <Texture tone="sand" />
          <div className="relative flex items-center gap-3.5">
            <Avatar name={customer.display_name} size="lg" />
            <div className="min-w-0">
              <div className="truncate font-display text-[17px] font-semibold leading-tight">
                {customer.display_name}
              </div>
              <div className="mt-0.5 truncate text-[12.5px] text-muted tabular-nums">
                {customer.document_number}
                {customer.phone ? ` · ${phoneText(customer.phone)}` : ''}
              </div>
            </div>
          </div>
          <div className="relative mt-3 flex flex-wrap gap-1.5">
            <Badge tone={state.tone} dot>
              {state.label}
            </Badge>
            <Badge>Cliente desde {monthYear(customer.created_at)}</Badge>
          </div>
        </div>
        {p?.active_loans ? (
          <div className="border-b border-edge px-5 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12.5px] text-muted">Saldo de capital</span>
              <span className="font-display text-[26px] font-bold tracking-[-0.02em]">
                RD$ {whole(p.balance)}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Cuotas pagadas"
              aria-valuemin={0}
              aria-valuemax={current.length || 1}
              aria-valuenow={paid}
              className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-edge"
            >
              <div
                className="h-full origin-left animate-grow-x rounded-full bg-brand-700"
                style={{ width: current.length ? `${(paid / current.length) * 100}%` : '0%' }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[12px] text-muted">
              <span>
                {calendar.data ? `${paid} de ${current.length} cuotas` : 'Cuotas…'}
                {p.active_loans > 1 ? ` · ${plural(p.active_loans, 'préstamo')}` : ''}
              </span>
              <span className="tabular-nums">{p.loan}</span>
            </div>
          </div>
        ) : null}
        <dl className="divide-y divide-edge px-5 text-[13px]">
          {[
            [
              'Próxima cuota',
              p?.next_due
                ? `${nearDay(p.next_due)}${p.next_amount ? ` · ${rd(p.next_amount)}` : ''}`
                : '—',
            ],
            ['Teléfono', phoneText(customer.phone) || '—'],
            ['Zona', customer.zone || '—'],
            ['Cobro', routeOf(customer)],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 py-2.5">
              <dt className="text-muted">{label}</dt>
              <dd className="truncate text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="grid grid-cols-2 gap-2 p-5 pt-3">
          <Link
            to="/clientes/$id"
            params={{ id: customer.id }}
            className={buttonClass('secondary', 'w-full')}
          >
            Ver ficha
          </Link>
          {collects && p?.loan ? (
            <Link
              to="/cobrar/$numero"
              params={{ numero: p.loan }}
              className={buttonClass('primary', 'w-full')}
            >
              Registrar pago
            </Link>
          ) : null}
        </div>
      </div>
    </aside>
  )
}

/** P20, the customers (decision 115): filters by state with their counts,
 * by collector, a readable table and a quick view that spares opening the
 * file. On a phone, one card per customer. */
export function CustomersPage({ me }: { me: Me }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [state, setState] = useState<CustomerState>('')
  const [collector, setCollector] = useState('')
  const [page, setPage] = useState(1)
  const [picked, setPicked] = useState<string | null>(null)
  const term = useDebounced(q.trim(), 300)
  const canCreate = hasRole(me, ACCESS.originate)
  const assigns = hasRole(me, ACCESS.assignAgents)
  const customers = useQuery({
    queryKey: ['customers', term, state, collector, page],
    queryFn: () =>
      listCustomers({ q: term, estado: state, cobrador: collector || undefined, page }),
    placeholderData: keepPreviousData,
  })
  const summary = useQuery({
    queryKey: ['customers-summary', term, collector],
    queryFn: () => getCustomerSummary({ q: term, cobrador: collector || undefined }),
    placeholderData: keepPreviousData,
  })
  const collectors = useQuery({
    queryKey: ['collectors'],
    queryFn: listCollectors,
    enabled: assigns,
  })
  const rows = customers.data?.results ?? []
  const selected = rows.find((row) => row.id === picked) ?? rows[0]
  const digits = term.replace(/\D/g, '')
  const lookOtherBranches =
    customers.data !== undefined &&
    rows.length === 0 &&
    digits.length >= 9 &&
    me.roles.some((role) => GRANT_ROLES.includes(role))
  const s = summary.data
  const reset = () => setPage(1)

  // A desktop row shows its quick view with a click; the name and the chevron
  // open the file. Without the quick view (narrower screens) the row opens it.
  const pick = (event: MouseEvent, id: string) => {
    if ((event.target as HTMLElement).closest('a')) return
    if (window.matchMedia('(min-width: 1280px)').matches) setPicked(id)
    else void navigate({ to: '/clientes/$id', params: { id } })
  }

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle={
          s
            ? `${plural(s.todos, 'cliente')} · ${plural(s.loans, 'préstamo activo', 'préstamos activos')} · ${short(s.principal)} de capital`
            : 'Personas y empresas, con su expediente y sus garantías.'
        }
        inline
        actions={
          canCreate ? (
            <Link
              to="/clientes/nuevo"
              aria-label="Nuevo cliente"
              className={buttonClass('primary', 'max-sm:size-11 max-sm:px-0')}
            >
              <PlusIcon />
              <span className="hidden sm:inline">Nuevo cliente</span>
            </Link>
          ) : null
        }
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <Segmented
          label="Estado"
          value={state}
          onChange={(value) => {
            setState(value)
            reset()
          }}
          options={[
            { value: '', label: 'Todos', count: s?.todos },
            { value: 'al_dia', label: 'Al día', count: s?.al_dia },
            { value: 'atraso', label: 'En atraso', count: s?.atraso },
            { value: 'sin_prestamo', label: 'Sin préstamo', count: s?.sin_prestamo },
          ]}
        />
        <div className="hidden flex-1 lg:block" />
        <SearchInput
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            reset()
          }}
          placeholder="Buscar por nombre, cédula, RNC o teléfono…"
          className="w-full max-sm:order-first sm:w-auto sm:min-w-64 sm:flex-1 lg:max-w-72 lg:flex-none"
        />
        {assigns && collectors.data?.length ? (
          <label className="relative flex items-center">
            <span className="pointer-events-none absolute left-3 text-[13px] text-muted">
              Cobrador:
            </span>
            <Select
              aria-label="Cobrador"
              value={collector}
              onChange={(e) => {
                setCollector(e.target.value)
                reset()
              }}
              className="pl-[5.4rem] font-medium"
            >
              <option value="">Todos</option>
              <option value="oficina">Paga en oficina</option>
              {collectors.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name ?? 'Sin nombre'}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
      </div>
      {customers.isPending ? (
        <Spinner />
      ) : rows.length > 0 ? (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-3">
            {/* The table of a desktop. */}
            <div className="hidden overflow-hidden rounded-card border border-edge bg-surface shadow-sm md:block">
              <div
                className={`${COLUMNS} border-b border-edge bg-surface-2 px-5 py-2.5 text-[12.5px] font-medium text-muted`}
              >
                <span>Cliente</span>
                <span>Zona · ruta</span>
                <span className="text-right">Saldo</span>
                <span>Próxima cuota</span>
                <span>Estado</span>
                <span />
              </div>
              <ul className="divide-y divide-edge">
                {rows.map((customer, index) => {
                  const p = customer.portfolio
                  const chip = customerState(customer)
                  const on = selected?.id === customer.id
                  return (
                    <li
                      key={customer.id}
                      className="animate-reveal"
                      style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }}
                    >
                      <div
                        aria-current={on ? 'true' : undefined}
                        onClick={(event) => pick(event, customer.id)}
                        className={`${COLUMNS} cursor-pointer px-5 py-2.5 transition-colors ${
                          on ? 'xl:bg-brand-50' : 'hover:bg-brand-50/60'
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <Avatar name={customer.display_name} size="sm" />
                          <span className="min-w-0">
                            <Link
                              to="/clientes/$id"
                              params={{ id: customer.id }}
                              className="block truncate rounded text-[13.5px] font-semibold outline-none hover:text-brand-700 hover:underline focus-visible:ring-2 focus-visible:ring-accent-500"
                            >
                              {customer.display_name}
                            </Link>
                            <span className="block truncate text-[12px] text-muted tabular-nums">
                              {customer.document_number}
                            </span>
                          </span>
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px]">{customer.zone || '—'}</span>
                          <span className="block truncate text-[12px] text-muted">
                            {routeOf(customer)}
                          </span>
                        </span>
                        <span className="text-right text-[13.5px] font-semibold whitespace-nowrap tabular-nums">
                          {p?.active_loans ? `RD$ ${whole(p.balance)}` : '—'}
                        </span>
                        <span className="min-w-0 whitespace-nowrap">
                          <span className="block text-[13px]">
                            {p?.next_due ? nearDay(p.next_due) : '—'}
                          </span>
                          {p?.next_amount ? (
                            <span className="block text-[12px] text-muted tabular-nums">
                              RD$ {whole(p.next_amount)}
                            </span>
                          ) : null}
                        </span>
                        <span>
                          <Badge tone={chip.tone} dot>
                            {chip.label}
                          </Badge>
                        </span>
                        <Link
                          to="/clientes/$id"
                          params={{ id: customer.id }}
                          aria-hidden
                          tabIndex={-1}
                          className="grid size-6 place-items-center rounded text-muted hover:text-ink"
                        >
                          <ChevronRightIcon className="size-4 shrink-0" />
                        </Link>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
            {/* One card per customer on a phone. */}
            <ul className="space-y-2.5 md:hidden">
              {rows.map((customer) => {
                const p = customer.portfolio
                const chip = customerState(customer)
                return (
                  <li key={customer.id}>
                    <Link
                      to="/clientes/$id"
                      params={{ id: customer.id }}
                      className="press press-down flex items-center gap-3 rounded-card border border-edge bg-surface px-3.5 py-3 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                    >
                      <Avatar name={customer.display_name} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold">
                          {customer.display_name}
                        </span>
                        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-muted">
                          <Badge tone={chip.tone} dot>
                            {chip.label}
                          </Badge>
                          <span className="truncate">{customer.zone}</span>
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-[14px] font-semibold tabular-nums">
                          {p?.active_loans ? `RD$ ${whole(p.balance)}` : '—'}
                        </span>
                        <span className="block text-[12px] text-muted">
                          {p?.next_due ? nearDay(p.next_due) : ''}
                        </span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
            {(customers.data?.count ?? 0) > PAGE_SIZE ? (
              <div className="rounded-card md:border md:border-edge md:bg-surface md:px-5 md:py-3 md:shadow-sm">
                <Pagination page={page} count={customers.data?.count ?? 0} onChange={setPage} />
              </div>
            ) : null}
          </div>
          {selected ? <QuickView customer={selected} me={me} /> : null}
        </div>
      ) : (
        <>
          {lookOtherBranches ? <OtherBranch document={digits} /> : null}
          <EmptyState
            action={
              canCreate && !term && !state && !collector ? (
                <Link to="/clientes/nuevo" className={buttonClass()}>
                  Crear el primer cliente
                </Link>
              ) : null
            }
          >
            {term
              ? `Ningún cliente coincide con «${term}».`
              : state || collector
                ? 'Ningún cliente con ese filtro.'
                : 'Aún no hay clientes.'}
          </EmptyState>
        </>
      )}
    </>
  )
}
