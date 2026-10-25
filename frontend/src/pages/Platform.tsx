import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import {
  getPlatformDashboard,
  listCompanies,
  type CompanyStatus,
  type PlatformCompany,
} from '../api/platform'
import { Kpi } from '../components/Kpi'
import { SearchIcon } from '../components/icons'
import { tableRowClass } from '../components/classes'
import {
  Badge,
  Card,
  EmptyState,
  Input,
  LoadError,
  PageHeader,
  Pagination,
  Segmented,
  Spinner,
  Table,
} from '../components/ui'
import { day, pct, STATUS_BADGES, whole } from '../lib/format'
import { useDebounced } from '../lib/hooks'

/** PT2 (decision 091): companies, conversion, payments due and usage
 * counts; never a customer, a loan or an amount of a company. */
function PlatformDashboard() {
  const board = useQuery({ queryKey: ['platform-dashboard'], queryFn: getPlatformDashboard })
  const data = board.data
  if (board.isError) return <LoadError error={board.error} />
  if (!data) return <Spinner />
  const c = data.companies
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Empresas activas"
          value={String(c.active_paid)}
          hint={`${c.active} activas · ${c.suspended} suspendidas`}
          help={data.definitions.active}
        />
        <Kpi
          label="En prueba"
          value={String(c.trial)}
          hint={`${data.trials_ending.length} terminan en 7 días`}
          tone={data.trials_ending.length ? 'warn' : undefined}
        />
        <Kpi
          label={`Conversión de la prueba (${data.conversion.days} días)`}
          value={pct(data.conversion.rate, 0)}
          hint={`${data.conversion.converted} de ${data.conversion.ended} pruebas terminadas`}
          help={data.definitions.conversion}
        />
        <Kpi
          label={`Uso (${data.usage.days} días)`}
          value={`${data.usage.totals.active_users} usuarios`}
          hint={`${data.usage.totals.active_loans} préstamos activos · ${data.usage.totals.payments} cobros`}
          help={data.definitions.usage}
        />
      </div>
      {data.pending_proofs.length ? (
        <Card className="space-y-2 ring-2 ring-inset ring-gold-500/50">
          <h2 className="text-base font-semibold">
            Comprobantes por confirmar
            <span className="ml-2 rounded-full bg-gold-100 px-2 py-0.5 text-[11px] font-bold text-gold-800">
              {data.pending_proofs.length}
            </span>
          </h2>
          <ul className="divide-y divide-edge text-sm">
            {data.pending_proofs.map((row) => (
              <li key={row.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                <Link
                  to="/plataforma/empresas/$id"
                  params={{ id: row.company }}
                  className="font-medium hover:underline"
                >
                  {row.name}
                </Link>
                <span className="text-muted tabular-nums">
                  {row.plan} · {row.period === 'annual' ? 'anual' : 'mensual'} · RD${' '}
                  {whole(row.amount)} · {day(row.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="space-y-2">
          <h2 className="text-base font-semibold">Pruebas que terminan pronto</h2>
          {data.trials_ending.length ? (
            <ul className="divide-y divide-edge text-sm">
              {data.trials_ending.map((row) => (
                <li key={row.id} className="flex justify-between gap-2 py-1.5">
                  <Link
                    to="/plataforma/empresas/$id"
                    params={{ id: row.id }}
                    className="truncate font-medium hover:underline"
                  >
                    {row.name}
                  </Link>
                  <span className="shrink-0 text-muted tabular-nums">{day(row.trial_ends_on)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Ninguna termina en los próximos 7 días.</p>
          )}
        </Card>
        <Card className="space-y-2">
          <h2 className="text-base font-semibold">Pagos por vencer o vencidos</h2>
          {data.payments_due.length ? (
            <ul className="divide-y divide-edge text-sm">
              {data.payments_due.map((row) => (
                <li key={row.id} className="flex justify-between gap-2 py-1.5">
                  <Link
                    to="/plataforma/empresas/$id"
                    params={{ id: row.id }}
                    className="truncate font-medium hover:underline"
                  >
                    {row.name} <span className="font-normal text-muted">· {row.plan}</span>
                  </Link>
                  <span
                    className={`shrink-0 tabular-nums ${row.overdue ? 'text-danger-600' : 'text-muted'}`}
                  >
                    {row.paid_until ? `hasta ${day(row.paid_until)}` : 'sin pago'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nada por vencer esta semana.</p>
          )}
        </Card>
        <Card className="space-y-2">
          <h2 className="text-base font-semibold">Registros recientes</h2>
          {data.recent.length ? (
            <ul className="divide-y divide-edge text-sm">
              {data.recent.map((row) => (
                <li key={row.id} className="flex justify-between gap-2 py-1.5">
                  <Link
                    to="/plataforma/empresas/$id"
                    params={{ id: row.id }}
                    className="truncate font-medium hover:underline"
                  >
                    {row.name}
                  </Link>
                  <span className="shrink-0 text-muted tabular-nums">
                    {STATUS_BADGES[row.status].text} · {day(row.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Todavía no se registra ninguna financiera.</p>
          )}
        </Card>
      </div>
    </div>
  )
}

const STATUS_OPTIONS = [
  { value: '', label: 'Todas' },
  { value: 'trial', label: 'En prueba' },
  { value: 'active', label: 'Activas' },
  { value: 'suspended', label: 'Suspendidas' },
  { value: 'closed', label: 'Cerradas' },
] as const

type StatusFilter = CompanyStatus | ''

/** PT1 (decision 122): the list, searchable and filtered; each row opens
 * the company's file, where every action lives. */
export function PlatformPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('')
  const [page, setPage] = useState(1)
  const query = useDebounced(search.trim(), 250)
  const companies = useQuery({
    queryKey: ['platform-companies', { page, query, status }],
    queryFn: () => listCompanies({ page, search: query || undefined, status: status || undefined }),
  })

  return (
    <>
      <PageHeader
        title="Tablero de la plataforma"
        subtitle="Empresas, prueba, suscripciones y uso agregado. Nunca datos de clientes ni montos de una empresa."
      />
      <PlatformDashboard />

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[17px] font-semibold">Empresas</h2>
        <div className="relative min-w-[16rem] flex-1 sm:max-w-sm">
          <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-muted">
            <SearchIcon className="size-4" />
          </span>
          <Input
            type="search"
            placeholder="Buscar por nombre, RNC o correo"
            aria-label="Buscar empresa"
            className="pl-9"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
        </div>
        <Segmented
          label="Estado"
          options={STATUS_OPTIONS}
          value={status}
          onChange={(value) => {
            setStatus(value)
            setPage(1)
          }}
        />
      </div>

      {companies.isPending ? <Spinner /> : null}
      {companies.isError ? <LoadError error={companies.error} /> : null}
      {companies.data ? (
        companies.data.results.length ? (
          <>
            <Table
              label="Empresas"
              columns="minmax(0,1.6fr) 7rem minmax(0,1fr) 8rem 6rem 7rem"
              head={[
                { label: 'Empresa' },
                { label: 'Estado' },
                { label: 'Plan' },
                { label: 'Prueba · pagada hasta' },
                { label: 'Usuarios', align: 'right' },
                { label: 'Registro', align: 'right' },
              ]}
              footer={
                <>
                  <span className="text-muted">{companies.data.count} en total</span>
                  <Pagination page={page} count={companies.data.count} onChange={setPage} />
                </>
              }
            >
              {companies.data.results.map((company) => (
                <CompanyRow key={company.id} company={company} />
              ))}
            </Table>
          </>
        ) : (
          <EmptyState>
            {query || status
              ? 'Ninguna empresa coincide con la búsqueda.'
              : 'Cuando una financiera se registre aparecerá aquí.'}
          </EmptyState>
        )
      ) : null}
    </>
  )
}

function CompanyRow({ company }: { company: PlatformCompany }) {
  const badge = STATUS_BADGES[company.status]
  const until =
    company.status === 'trial'
      ? `prueba hasta ${day(company.trial_ends_on)}`
      : company.subscription?.paid_until
        ? `pagada hasta ${day(company.subscription.paid_until)}`
        : 'sin pago'
  return (
    <li>
      <Link
        to="/plataforma/empresas/$id"
        params={{ id: company.id }}
        className={`${tableRowClass} w-full`}
      >
        <div className="min-w-0 basis-full md:basis-auto">
          <div className="truncate font-semibold">{company.trade_name || company.legal_name}</div>
          <div className="truncate text-[12px] text-muted">
            {company.legal_name}
            {company.rnc ? ` · RNC ${company.rnc}` : ''}
          </div>
        </div>
        <span>
          <Badge tone={company.status}>{badge.text}</Badge>
        </span>
        <span className="truncate text-muted md:text-ink">
          {company.subscription?.plan.name ?? '—'}
        </span>
        <span className="text-[12.5px] text-muted tabular-nums md:text-[13px]">{until}</span>
        <span className="tabular-nums md:text-right">
          {company.users_count}
          <span className="md:hidden"> {company.users_count === 1 ? 'usuario' : 'usuarios'}</span>
        </span>
        <span className="text-muted tabular-nums md:text-right">
          <span className="md:hidden">desde el </span>
          {day(company.created_at)}
        </span>
      </Link>
    </li>
  )
}
