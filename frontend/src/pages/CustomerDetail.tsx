import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { useState } from 'react'

import type { Me } from '../api/accounts'
import { blockCustomer, getCustomer, unblockCustomer } from '../api/customers'
import {
  getLoan,
  getLoanCalendar,
  listApplications,
  listLoans,
  type Loan,
  type LoanListItem,
} from '../api/origination'
import { CollectionTimeline } from '../components/CollectionTimeline'
import { usePrompt } from '../components/Dialog'
import { GradeBadge, ScoreFactors } from '../components/Grade'
import { CollectIcon, PlusIcon } from '../components/icons'
import { LoanCalendar } from '../components/LoanCalendar'
import { MoreMenu, type MoreItem } from '../components/MoreMenu'
import { PaymentList } from '../components/PaymentList'
import { Alert, Avatar, Badge, Card, EmptyState, Spinner, Stat, Tabs } from '../components/ui'
import { buttonClass } from '../components/classes'
import {
  APPLICATION_STATUS,
  dateOf,
  day,
  documentText,
  FREQUENCY_TEXT,
  installmentsText,
  LOAN_STATUS,
  moment,
  monthYear,
  nearDay,
  pct,
  phoneText,
  plural,
  rd,
} from '../lib/format'
import { useDocumentTitle } from '../lib/hooks'
import { ACCESS, hasRole } from '../lib/roles'
import { useLoanMenu } from './loan/useLoanMenu'
import { CollateralTab } from './customer/CollateralTab'
import { FamilyTab } from './customer/FamilyTab'
import { FilesTab } from './customer/FilesTab'
import { IncomeTab } from './customer/IncomeTab'
import { MessagesTab } from './customer/MessagesTab'

const TABS = [
  ['calendario', 'Calendario'],
  ['pagos', 'Pagos'],
  ['garantias', 'Garantías'],
  ['familia', 'Familia'],
  ['ingresos', 'Ingresos'],
  ['archivos', 'Archivos'],
  ['mensajes', 'Mensajes'],
  ['cobranza', 'Cobranza'],
  ['solicitudes', 'Solicitudes'],
] as const

type TabKey = (typeof TABS)[number][0]

/** Every request stays in the customer's history (reference defect #22). */
function ApplicationsCard({ customerId }: { customerId: string }) {
  const applications = useQuery({
    queryKey: ['applications', 'customer', customerId],
    queryFn: () => listApplications({ customer: customerId }),
  })
  return (
    <Card>
      {applications.data?.results.length ? (
        <ul className="divide-y divide-edge text-sm">
          {applications.data.results.map((app) => (
            <li key={app.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <Link
                to="/solicitudes/$id"
                params={{ id: app.id }}
                className="font-medium tabular-nums text-brand-700 hover:underline"
              >
                {app.number}
              </Link>
              <Badge tone={APPLICATION_STATUS[app.status]?.tone} dot>
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
  )
}

/** The loan picked first: the active one due soonest, else the latest. */
function firstLoan(loans: LoanListItem[]) {
  const active = loans
    .filter((loan) => loan.status === 'active')
    .sort((a, b) => (a.next_due_date ?? '9').localeCompare(b.next_due_date ?? '9'))
  return active[0] ?? loans[0]
}

/** «Este préstamo»: how it was given and who looks after it. */
function LoanFacts({ loan }: { loan: Loan }) {
  const terms = loan.current_terms
  const rows: [string, string][] = [
    ['Monto desembolsado', loan.disbursement ? rd(loan.disbursement.gross) : rd(loan.principal)],
    ['Desembolso', day(loan.disbursed_on)],
    ['Plazo', terms ? installmentsText(terms.installments, terms.frequency) : '—'],
    ['Tasa por período', terms ? pct(terms.periodic_rate, 2) : '—'],
    ['Cobrador', loan.collector_name ?? 'Paga en oficina'],
    ['Originó', loan.officer_name ?? '—'],
  ]
  return (
    <Card className="!p-0">
      <div className="flex items-center justify-between gap-3 border-b border-edge px-5 py-3.5">
        <h2 className="text-[15px] font-semibold">Este préstamo</h2>
        <Link
          to="/prestamos/$numero"
          params={{ numero: loan.number }}
          className="text-[12.5px] font-semibold text-brand-700 hover:underline"
        >
          Abrir →
        </Link>
      </div>
      <dl className="divide-y divide-edge px-5 text-[13px]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 py-2.5">
            <dt className="text-muted">{label}</dt>
            <dd className="truncate text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

/** The guarantees of the loan in short: goods and co-signers. */
function LoanGuarantees({ loan }: { loan: Loan }) {
  if (!loan.collaterals.length && !loan.guarantors.length) return null
  return (
    <Card className="!p-0">
      <h2 className="border-b border-edge px-5 py-3.5 text-[15px] font-semibold">Garantías</h2>
      <ul className="divide-y divide-edge px-5 text-[13px]">
        {loan.collaterals.map((c) => (
          <li key={c.id} className="py-2.5">
            <div className="font-medium">{c.description}</div>
            <div className="text-[12px] text-muted">Valor considerado {rd(c.considered_value)}</div>
          </li>
        ))}
        {loan.guarantors.map((g) => (
          <li key={g.id} className="py-2.5">
            <Link to="/clientes/$id" params={{ id: g.id }} className="font-medium hover:underline">
              {g.name}
            </Link>
            <div className="text-[12px] text-muted tabular-nums">Garante · {g.document}</div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** The loan's actions as a list (decision 115); the destructive ones in red. */
function ActionList({ items }: { items: MoreItem[] }) {
  if (!items.length) return null
  return (
    <Card className="!p-1.5">
      <ul>
        {items.map((item) => (
          <li key={item.label}>
            <button
              type="button"
              onClick={item.onSelect}
              className={`press flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-left text-[13.5px] font-medium outline-none hover:bg-brand-50 focus-visible:bg-brand-50 ${
                item.danger ? 'text-danger-600 hover:bg-danger-100' : ''
              }`}
            >
              <span className={item.danger ? '' : 'text-muted'}>{item.icon}</span>
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** P21, the customer's file (decision 115): who they are, their loans as
 * tabs, the four figures of the loan in view, its calendar and everything
 * else of the file, with the loan's actions at the right. */
export function CustomerDetailPage({ me }: { me: Me }) {
  const [dialog, ask] = usePrompt()
  const { id } = useParams({ from: '/app/clientes/$id' })
  const [tab, setTab] = useState<TabKey>('calendario')
  const [picked, setPicked] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const customer = useQuery({ queryKey: ['customer', id], queryFn: () => getCustomer(id) })
  const loans = useQuery({
    queryKey: ['loans', 'customer', id],
    queryFn: () => listLoans({ customer: id }),
  })
  const list = loans.data?.results ?? []
  const number = picked ?? firstLoan(list)?.number
  const loan = useQuery({
    queryKey: ['loan', number],
    queryFn: () => getLoan(number!),
    enabled: Boolean(number),
  })
  const calendar = useQuery({
    queryKey: ['loan', number, 'calendar'],
    queryFn: () => getLoanCalendar(number!),
    enabled: Boolean(number) && tab === 'calendario',
  })
  const menu = useLoanMenu(me, loan.data)
  useDocumentTitle(customer.data?.display_name)

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['customer', id] })
  const block = useMutation({
    mutationFn: (reason: string) => blockCustomer(id, reason),
    onSuccess: refresh,
  })
  const unblock = useMutation({ mutationFn: () => unblockCustomer(id), onSuccess: refresh })

  const data = customer.data
  if (customer.isPending) return <Spinner />
  if (!data) return <Alert tone="danger">No se encontró el cliente.</Alert>

  const l = loan.data
  const active = l?.status === 'active'
  const terms = l?.current_terms
  const nextRow = calendar.data?.installments.find(
    (row) => row.version === (terms?.version ?? 1) && !['paid', 'superseded'].includes(row.status),
  )
  const collects = hasRole(me, ACCESS.collect) && (active || l?.status === 'written_off')
  const customerMenu: MoreItem[] = hasRole(me, ACCESS.decide)
    ? [
        data.status === 'active'
          ? {
              label: 'Bloquear cliente',
              danger: true,
              onSelect: async () => {
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
              },
            }
          : { label: 'Desbloquear cliente', onSelect: () => unblock.mutate() },
      ]
    : []
  const state =
    data.status === 'blocked'
      ? { label: 'Bloqueado', tone: 'danger' }
      : !list.some((x) => x.status === 'active')
        ? { label: 'Sin préstamo activo', tone: 'neutral' }
        : list.some((x) => x.status === 'active' && x.days_past_due > 0)
          ? { label: 'En atraso', tone: 'warning' }
          : { label: 'Al día', tone: 'brand' }

  return (
    <>
      {dialog}
      <section className="overflow-hidden rounded-card border border-edge bg-surface shadow-sm">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-4 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex min-w-0 flex-1 basis-72 items-center gap-4">
            <Avatar name={data.display_name} size="xl" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <h1 className="text-[21px] leading-tight sm:text-[26px]">{data.display_name}</h1>
                <Badge tone={state.tone} dot>
                  {state.label}
                </Badge>
                {data.classification?.grade === 'A' ? (
                  <Badge tone="gold">★ {data.classification.label}</Badge>
                ) : data.classification ? (
                  <GradeBadge grade={data.classification.grade} label={data.classification.label} />
                ) : null}
              </div>
              <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-muted tabular-nums sm:text-[13px]">
                <span>
                  {data.document_type === 'rnc' ? 'RNC' : 'Cédula'}{' '}
                  {documentText(data.document_number)}
                </span>
                {data.phone ? <span>{phoneText(data.phone)}</span> : null}
                {data.address_line ? <span className="truncate">{data.address_line}</span> : null}
                <span>Cliente desde {monthYear(data.created_at)}</span>
              </p>
            </div>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto [&>a]:max-sm:flex-1 [&>a]:max-sm:px-2">
            <MoreMenu items={customerMenu} compact />
            {hasRole(me, ACCESS.originate) && data.status === 'active' ? (
              <Link
                to="/solicitudes/nueva"
                search={{ cliente: id }}
                className={buttonClass(collects ? 'secondary' : 'primary')}
              >
                <PlusIcon />
                Nueva solicitud
              </Link>
            ) : null}
            {collects && l ? (
              <Link to="/cobrar/$numero" params={{ numero: l.number }} className={buttonClass()}>
                <CollectIcon className="size-[18px] shrink-0" />
                Registrar pago
              </Link>
            ) : null}
          </div>
        </div>
        {list.length ? (
          <div
            role="tablist"
            aria-label="Préstamos del cliente"
            className="flex gap-1 overflow-x-auto border-t border-edge px-3 [scrollbar-width:none] sm:px-4"
          >
            {list.map((x) => {
              const on = x.number === number
              const status = LOAN_STATUS[x.status]
              return (
                <button
                  key={x.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setPicked(x.number)}
                  className={`press -mb-px flex shrink-0 items-center gap-2 border-b-2 px-2.5 py-3 text-[13px] whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                    on
                      ? 'border-brand-700 font-semibold text-ink'
                      : 'border-transparent text-muted hover:text-ink'
                  }`}
                >
                  <span className="tabular-nums">{x.number}</span>
                  <span className="hidden sm:inline">· {x.product_name}</span>
                  <Badge tone={status?.tone}>{status?.label ?? x.status}</Badge>
                </button>
              )
            })}
          </div>
        ) : null}
      </section>

      {data.status === 'blocked' ? (
        <Alert tone="danger">
          Cliente bloqueado: {data.block_reason || 'sin motivo registrado'}.
        </Alert>
      ) : null}
      {menu.error}
      {menu.dialogs}

      {l ? (
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          <Stat
            label="Saldo de capital"
            value={rd(l.principal_outstanding)}
            hint={
              Number(l.interest_outstanding)
                ? `Interés por cobrar ${rd(l.interest_outstanding)}`
                : 'Sin interés vencido'
            }
          />
          <Stat
            label={`Cuota ${terms ? (FREQUENCY_TEXT[terms.frequency] ?? '').toLowerCase() : ''}`}
            value={nextRow ? rd(nextRow.total_due) : '—'}
            hint={terms ? `${pct(terms.periodic_rate, 2)} por período` : undefined}
          />
          <Stat
            label={l.days_past_due > 0 ? 'Vencida desde' : 'Próxima cuota'}
            value={l.next_due_date ? nearDay(l.next_due_date) : '—'}
            hint={
              nextRow && terms
                ? `Cuota ${nextRow.number} de ${terms.installments}`
                : l.status !== 'active'
                  ? (LOAN_STATUS[l.status]?.label ?? '')
                  : undefined
            }
          />
          <Stat
            label="Atraso"
            value={plural(l.days_past_due, 'día')}
            danger={l.days_past_due > 0}
            hint={
              Number(l.late_fee_outstanding)
                ? `Mora pendiente ${rd(l.late_fee_outstanding)}`
                : l.days_past_due
                  ? 'Cuotas vencidas sin pagar'
                  : 'Al día con sus cuotas'
            }
          />
        </div>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <div className="rounded-card border border-edge bg-surface px-3 shadow-sm sm:px-4">
            <Tabs tabs={TABS} value={tab} onChange={setTab} />
            {tab === 'calendario' ? (
              <div className="-mx-3 sm:-mx-4">
                {!number ? (
                  <div className="p-5">
                    <EmptyState>Este cliente aún no tiene préstamos.</EmptyState>
                  </div>
                ) : calendar.isPending ? (
                  <div className="p-5">
                    <Spinner />
                  </div>
                ) : (
                  <LoanCalendar rows={calendar.data?.installments ?? []} terms={terms ?? null} />
                )}
              </div>
            ) : null}
            {tab === 'pagos' ? (
              <div className="py-3">
                <PaymentList
                  filter={number ? { loan: number } : { customer: id }}
                  queryKey={['payments', 'customer', id, number ?? '']}
                  describe={(p) =>
                    [`Préstamo ${p.loan_number}`, p.kind_label, p.method_label, moment(p.paid_at)]
                      .filter(Boolean)
                      .join(' · ')
                  }
                />
              </div>
            ) : null}
          </div>
          {tab === 'garantias' ? <CollateralTab customerId={id} /> : null}
          {tab === 'familia' ? <FamilyTab customerId={id} /> : null}
          {tab === 'ingresos' ? <IncomeTab customerId={id} /> : null}
          {tab === 'archivos' ? <FilesTab customerId={id} /> : null}
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
              canInvite={hasRole(me, ['Gerente', 'Supervisor', 'Oficial de crédito', 'Cajero'])}
            />
          ) : null}
          {tab === 'cobranza' ? (
            <CollectionTimeline
              customerId={id}
              customerName={data.display_name}
              canManage={false}
            />
          ) : null}
          {tab === 'solicitudes' ? <ApplicationsCard customerId={id} /> : null}
        </div>
        <aside className="space-y-4">
          {l ? <LoanFacts loan={l} /> : null}
          {l ? <LoanGuarantees loan={l} /> : null}
          <ActionList items={menu.items} />
          {data.classification ? (
            <Card>
              <h2 className="mb-1 text-[15px] font-semibold">Clasificación</h2>
              <p className="mb-3 text-[12.5px] text-muted">
                {data.classification.score ? `${data.classification.score} puntos · ` : ''}
                cómo se calculó
              </p>
              <ScoreFactors factors={data.classification.factors} />
            </Card>
          ) : null}
          <Card>
            <h2 className="mb-2 text-[15px] font-semibold">Contacto</h2>
            <dl className="space-y-1.5 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Teléfono</dt>
                <dd className="font-medium tabular-nums">{phoneText(data.phone) || '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Correo</dt>
                <dd className="truncate font-medium">{data.email || '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Dirección</dt>
                <dd className="truncate text-right font-medium">{data.address_line || '—'}</dd>
              </div>
            </dl>
          </Card>
        </aside>
      </div>
    </>
  )
}
