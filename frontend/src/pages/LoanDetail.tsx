import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useState } from 'react'

import type { Me } from '../api/accounts'
import { ApiError } from '../api/client'
import {
  getLoan,
  getLoanCalendar,
  getLoanDocuments,
  getLoanEvents,
  listReasons,
  loanDocumentUrl,
  renewLoan,
  uploadSignedNote,
  voidLoan,
} from '../api/origination'
import { listPayments } from '../api/payments'
import { buttonClass } from '../components/classes'
import { CollectionTimeline } from '../components/CollectionTimeline'
import { MoreMenu } from '../components/MoreMenu'
import { ScheduleTable } from '../components/ScheduleTable'
import { Timeline } from '../components/Timeline'
import {
  CollectorDialog,
  DateChangeDialog,
  PayoffLetterDialog,
  LegalCaseDialog,
  RestructureDialog,
  WriteOffDialog,
} from './loan/LoanActions'
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Stat,
  Tabs,
  Textarea,
} from '../components/ui'
import {
  day,
  errorMessage,
  installmentsText,
  LOAN_STATUS,
  METHOD_TEXT,
  moment,
  pct,
  rd,
} from '../lib/format'
import { ACCESS, hasRole } from '../lib/roles'

const TABS = [
  ['resumen', 'Resumen'],
  ['calendario', 'Calendario'],
  ['pagos', 'Pagos'],
  ['gestiones', 'Gestiones'],
  ['garantias', 'Garantías y garantes'],
  ['documentos', 'Documentos'],
  ['cronologia', 'Cronología'],
] as const
type TabKey = (typeof TABS)[number][0]

const MODE_TEXT: Record<string, string> = {
  discounted: 'Descontado',
  financed: 'Financiado',
  cash: 'Cobrado en caja',
}

function VoidDialog({ number, onDone }: { number: string; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  // Doc 08 - 5, grave action: reason, note and the loan number typed back.
  const [typed, setTyped] = useState('')
  const confirmed = typed.trim().toUpperCase() === number.toUpperCase()
  const reasons = useQuery({ queryKey: ['reasons', 'void'], queryFn: () => listReasons('void') })
  const run = useMutation({
    meta: { inlineError: true },
    mutationFn: () => voidLoan(number, reason, note),
    onSuccess: onDone,
  })
  return (
    <Card className="space-y-3 border-danger-600/40">
      <h2 className="text-base font-semibold">Anular préstamo</h2>
      <p className="text-sm text-muted">
        Solo sin pagos. Revierte el desembolso y los cargos, devuelve el dinero a su origen y libera
        las garantías. Nada se borra.
      </p>
      <Field label="Motivo">
        <Select value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">Elegir…</option>
          {reasons.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.text}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Nota">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Field label={`Para confirmar, escribe el número del préstamo (${number})`}>
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      {run.error instanceof ApiError ? (
        <Alert tone="danger">{errorMessage(run.error.data)}</Alert>
      ) : null}
      <div className="flex justify-end">
        <Button
          variant="danger"
          disabled={!reason || !note.trim() || !confirmed || run.isPending}
          onClick={() => run.mutate()}
        >
          Anular
        </Button>
      </div>
    </Card>
  )
}

/** P32: header with the balance; the tabs explain any figure. */
export function LoanDetailPage({ me }: { me: Me }) {
  const { numero } = useParams({ from: '/app/prestamos/$numero' })
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<TabKey>('resumen')
  const [voiding, setVoiding] = useState(false)
  const [dialog, setDialog] = useState<
    'payoff' | 'dates' | 'collector' | 'restructure' | 'writeoff' | 'legal' | null
  >(null)
  const loan = useQuery({ queryKey: ['loan', numero], queryFn: () => getLoan(numero) })
  const payments = useQuery({
    queryKey: ['loan', numero, 'payments'],
    queryFn: () => listPayments({ loan: numero }),
    enabled: tab === 'pagos',
  })
  const calendar = useQuery({
    queryKey: ['loan', numero, 'calendar'],
    queryFn: () => getLoanCalendar(numero),
    enabled: tab === 'calendario',
  })
  const documents = useQuery({
    queryKey: ['loan', numero, 'documents'],
    queryFn: () => getLoanDocuments(numero),
    enabled: tab === 'documentos' || tab === 'resumen',
  })
  const events = useQuery({
    queryKey: ['loan', numero, 'events'],
    queryFn: () => getLoanEvents(numero),
    enabled: tab === 'cronologia',
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['loan', numero] })
  const navigate = useNavigate()
  const renewal = useMutation({
    meta: { inlineError: true },
    mutationFn: () => renewLoan(numero),
    onSuccess: (application) =>
      void navigate({ to: '/solicitudes/$id', params: { id: application.id } }),
  })
  const [signed, setSigned] = useState<File | null>(null)
  const upload = useMutation({
    meta: { inlineError: true },
    mutationFn: () => uploadSignedNote(numero, signed!),
    onSuccess: () => {
      setSigned(null)
      refresh()
    },
  })

  if (loan.isPending) return <Spinner />
  const data = loan.data
  if (!data) return <Alert tone="danger">No se encontró el préstamo.</Alert>
  const status = LOAN_STATUS[data.status]
  const terms = data.current_terms
  const active = data.status === 'active'
  const canVoid = active && hasRole(me, ACCESS.voidLoans)
  const more = [
    {
      label: 'Estado de cuenta (PDF)',
      onSelect: () =>
        window.open(
          `/api/v1/prestamos/${encodeURIComponent(numero)}/estado-de-cuenta/`,
          '_blank',
          'noopener',
        ),
    },
    ...(active && hasRole(me, ACCESS.payoffLetters)
      ? [{ label: 'Carta de saldo', onSelect: () => setDialog('payoff') }]
      : []),
    ...(active && hasRole(me, ACCESS.originate)
      ? [
          { label: 'Renovar', onSelect: () => renewal.mutate() },
          { label: 'Reestructurar', onSelect: () => setDialog('restructure') },
        ]
      : []),
    ...(active && hasRole(me, ACCESS.supervise)
      ? [
          { label: 'Cambiar fechas', onSelect: () => setDialog('dates') },
          { label: 'Cambiar cobrador', onSelect: () => setDialog('collector') },
        ]
      : []),
    ...((active || data.status === 'written_off') && !data.legal_case && hasRole(me, ['Gerente'])
      ? [{ label: 'Enviar a la vía legal', onSelect: () => setDialog('legal') }]
      : []),
    ...(active && hasRole(me, ACCESS.writeOff)
      ? [{ label: 'Castigar', onSelect: () => setDialog('writeoff'), danger: true }]
      : []),
    ...(canVoid && !voiding
      ? [{ label: 'Anular', onSelect: () => setVoiding(true), danger: true }]
      : []),
  ]
  const currentRows = (calendar.data?.installments ?? []).filter(
    (row) => row.version === (terms?.version ?? 1),
  )

  return (
    <>
      <PageHeader
        back={
          <Link to="/prestamos" className="hover:underline">
            ← Préstamos
          </Link>
        }
        documentTitle={`Préstamo ${data.number}`}
        title={
          <span className="flex flex-wrap items-center gap-2">
            Préstamo <span className="tabular-nums">{data.number}</span>
            <Badge tone={status?.tone}>{status?.label ?? data.status}</Badge>
          </span>
        }
        subtitle={
          <>
            <Link
              to="/clientes/$id"
              params={{ id: data.customer }}
              className="font-medium text-ink hover:underline"
            >
              {data.customer_name}
            </Link>{' '}
            · {data.product_name} · sucursal {data.branch_code}
            {data.collector_name ? ` · cobra ${data.collector_name}` : ''}
            {data.application ? (
              <>
                {' '}
                · solicitud{' '}
                <Link
                  to="/solicitudes/$id"
                  params={{ id: data.application }}
                  className="hover:underline"
                >
                  {data.application_number}
                </Link>
              </>
            ) : null}
          </>
        }
        actions={
          <>
            <MoreMenu items={more} />
            {(active || data.status === 'written_off') && hasRole(me, ACCESS.collect) ? (
              <Link to="/cobrar/$numero" params={{ numero }} className={buttonClass()}>
                Cobrar
              </Link>
            ) : null}
          </>
        }
      />

      {renewal.error instanceof ApiError ? (
        <Alert tone="danger">{errorMessage(renewal.error.data)}</Alert>
      ) : null}
      {data.renewed_by_number ? (
        <Alert tone="info">
          Renovado por el préstamo{' '}
          <Link
            to="/prestamos/$numero"
            params={{ numero: data.renewed_by_number }}
            className="font-semibold underline"
          >
            {data.renewed_by_number}
          </Link>
          , que lo liquidó al desembolsarse.
        </Alert>
      ) : null}
      {data.renewed_from_number ? (
        <Alert tone="info">
          Renueva el préstamo{' '}
          <Link
            to="/prestamos/$numero"
            params={{ numero: data.renewed_from_number }}
            className="font-semibold underline"
          >
            {data.renewed_from_number}
          </Link>
          {data.disbursement && Number(data.disbursement.renewal_payoff)
            ? `: le liquidó ${rd(data.disbursement.renewal_payoff)}.`
            : '.'}
        </Alert>
      ) : null}
      {data.legal_case ? (
        <Alert tone="warning">
          En vía legal: caso{' '}
          <Link
            to="/legal/$id"
            params={{ id: data.legal_case.id }}
            className="font-semibold underline"
          >
            {data.legal_case.number}
          </Link>
          .
        </Alert>
      ) : null}
      {data.status === 'written_off' ? (
        <Alert tone="warning">
          Castigado el {day(data.written_off_on)}: salió de la cartera activa. La cobranza sigue y
          lo que se cobre cuenta como recuperación.
        </Alert>
      ) : null}
      {data.status === 'voided' ? (
        <Alert tone="warning">
          Anulado el {day(data.voided_on)}: {data.void_reason_text}. {data.void_note}
        </Alert>
      ) : null}
      {data.status === 'active' && !data.promissory_note_signed_at ? (
        <Alert tone="warning">
          Pagaré firmado pendiente: súbelo escaneado en la pestaña Documentos.
        </Alert>
      ) : null}
      {voiding ? (
        <VoidDialog
          number={numero}
          onDone={() => {
            setVoiding(false)
            refresh()
          }}
        />
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Capital pendiente" value={rd(data.principal_outstanding)} emphasis />
        <Stat label="Interés por cobrar" value={rd(data.interest_outstanding)} />
        <Stat
          label={data.days_past_due > 0 ? 'Vencido desde' : 'Próximo vencimiento'}
          value={day(data.next_due_date)}
        />
        <Stat
          label="Atraso"
          value={data.days_past_due === 0 ? 'Al día' : `${data.days_past_due} días`}
          hint={
            Number(data.late_fee_outstanding) ? `mora ${rd(data.late_fee_outstanding)}` : undefined
          }
        />
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'resumen' && terms ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <h2 className="mb-2 text-base font-semibold">Condiciones (versión {terms.version})</h2>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted">Capital</dt>
              <dd className="text-right tabular-nums">{rd(terms.principal)}</dd>
              <dt className="text-muted">Método</dt>
              <dd className="text-right">{METHOD_TEXT[terms.method] ?? terms.method}</dd>
              <dt className="text-muted">Cuotas</dt>
              <dd className="text-right">
                {installmentsText(terms.installments, terms.frequency)}
              </dd>
              <dt className="text-muted">Tasa por período</dt>
              <dd className="text-right tabular-nums">{pct(terms.periodic_rate, 4)}</dd>
              <dt className="text-muted">Mora</dt>
              <dd className="text-right">
                {pct(terms.late_fee_monthly_rate)} mensual · {terms.late_fee_grace_days} días de
                gracia · tope {pct(terms.late_fee_cap_pct)}
              </dd>
              <dt className="text-muted">Aprobó</dt>
              <dd className="text-right">{terms.approved_by_name ?? '—'}</dd>
            </dl>
          </Card>
          {data.disbursement ? (
            <Card>
              <h2 className="mb-2 text-base font-semibold">Desembolso</h2>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted">Fecha</dt>
                <dd className="text-right">{day(data.disbursement.disbursed_on)}</dd>
                <dt className="text-muted">Origen</dt>
                <dd className="text-right">{data.disbursement.source_account_name}</dd>
                <dt className="text-muted">Bruto</dt>
                <dd className="text-right tabular-nums">{rd(data.disbursement.gross)}</dd>
                <dt className="text-muted">Neto entregado</dt>
                <dd className="text-right font-semibold tabular-nums">
                  {rd(data.disbursement.net)}
                </dd>
                <dt className="text-muted">Asiento</dt>
                <dd className="text-right tabular-nums">{data.disbursement.entry_number}</dd>
                <dt className="text-muted">Desembolsó</dt>
                <dd className="text-right">{data.disbursement.disbursed_by_name}</dd>
              </dl>
              {data.charges.length ? (
                <ul className="mt-3 space-y-1 border-t border-edge pt-2 text-sm">
                  {data.charges.map((charge) => (
                    <li key={charge.id} className="flex justify-between">
                      <span>
                        {charge.name} <span className="text-muted">· {MODE_TEXT[charge.mode]}</span>
                        {charge.status === 'reversed' ? ' (revertido)' : ''}
                      </span>
                      <span className="tabular-nums">{rd(charge.amount)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === 'calendario' ? (
        <Card>
          {calendar.isPending ? (
            <Spinner />
          ) : (
            <>
              <p className="mb-2 text-[12.5px] text-muted">
                Versión {terms?.version} del calendario (desde {day(terms?.effective_from)}). Cada
                cambio de fecha, abono a capital o reestructuración crea una versión nueva; ninguna
                se modifica.
              </p>
              <ScheduleTable
                principal={terms?.principal}
                rows={currentRows.map((row) => ({
                  number: row.number,
                  due_date: row.due_date,
                  original_due_date: row.original_due_date,
                  principal: row.principal_due,
                  interest: row.interest_due,
                  total: row.total_due,
                  status: row.status,
                }))}
              />
            </>
          )}
        </Card>
      ) : null}

      {tab === 'pagos' ? (
        <Card>
          {payments.isPending ? (
            <Spinner />
          ) : payments.data?.results.length ? (
            <ul className="divide-y divide-edge text-sm">
              {payments.data.results.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <Link
                      to="/recibos/$numero"
                      params={{ numero: p.number }}
                      className="font-semibold text-brand-700 hover:underline"
                    >
                      {p.number}
                    </Link>{' '}
                    <span className="text-muted">
                      · {p.kind_label} · {p.method_label} · {moment(p.paid_at)} ·{' '}
                      {p.collected_by_name}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {p.status === 'reversed' ? <Badge tone="danger">Reversado</Badge> : null}
                    <span className="tabular-nums font-medium">{rd(p.amount)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Sin pagos todavía.</p>
          )}
        </Card>
      ) : null}

      {tab === 'gestiones' ? (
        <CollectionTimeline
          loan={numero}
          customerName={data.customer_name}
          canManage={active && hasRole(me, ACCESS.manageCollections)}
        />
      ) : null}

      {dialog === 'payoff' ? (
        <PayoffLetterDialog number={numero} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === 'legal' ? (
        <LegalCaseDialog
          number={numero}
          onClose={() => setDialog(null)}
          onOpened={(id) => void navigate({ to: '/legal/$id', params: { id } })}
        />
      ) : null}
      {dialog === 'writeoff' ? (
        <WriteOffDialog
          number={numero}
          me={me}
          daysPastDue={data.days_past_due}
          onClose={() => {
            setDialog(null)
            refresh()
          }}
        />
      ) : null}
      {dialog === 'restructure' && terms ? (
        <RestructureDialog
          number={numero}
          current={{
            installments: terms.installments,
            frequency: terms.frequency,
            rate: terms.rate,
          }}
          onClose={() => {
            setDialog(null)
            refresh()
          }}
        />
      ) : null}
      {dialog === 'dates' ? (
        <DateChangeDialog number={numero} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === 'collector' ? (
        <CollectorDialog number={numero} current={data.collector} onClose={() => setDialog(null)} />
      ) : null}

      {tab === 'garantias' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <h2 className="mb-2 text-base font-semibold">Garantes</h2>
            {data.guarantors.length ? (
              <ul className="space-y-1 text-sm">
                {data.guarantors.map((g) => (
                  <li key={g.id}>
                    <Link to="/clientes/$id" params={{ id: g.id }} className="hover:underline">
                      {g.name}
                    </Link>{' '}
                    <span className="text-muted tabular-nums">· {g.document}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Sin garantes.</p>
            )}
          </Card>
          <Card>
            <h2 className="mb-2 text-base font-semibold">Bienes</h2>
            {data.collaterals.length ? (
              <ul className="space-y-1 text-sm">
                {data.collaterals.map((c) => (
                  <li key={c.id} className="flex justify-between gap-2">
                    <span>{c.description}</span>
                    <span className="text-muted tabular-nums">{rd(c.considered_value)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Sin bienes en garantía.</p>
            )}
          </Card>
        </div>
      ) : null}

      {tab === 'documentos' ? (
        <Card className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {documents.data?.documents.map((doc) => (
              <a
                key={doc.id}
                href={loanDocumentUrl(numero, doc.id)}
                target="_blank"
                rel="noopener"
                className="inline-flex h-11 items-center rounded-lg border border-edge bg-surface px-4 text-sm font-semibold hover:bg-brand-100 sm:h-9"
              >
                {doc.label} · {doc.folio}
              </a>
            )) ?? <Spinner label="Preparando documentos…" />}
          </div>
          <p className="text-[12.5px] text-muted">
            Plantillas de fábrica pendientes de validación legal por el abogado de la empresa. La
            reimpresión es idéntica al original.
          </p>
          <div className="border-t border-edge pt-3">
            <h3 className="mb-2 text-sm font-semibold">Pagaré firmado</h3>
            {data.promissory_note_signed_at ? (
              <p className="text-sm text-success-600">
                Recibido el {moment(data.promissory_note_signed_at)}.
              </p>
            ) : (
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  upload.mutate()
                }}
              >
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.heic"
                  className="text-sm"
                  onChange={(e) => setSigned(e.target.files?.[0] ?? null)}
                />
                <Button type="submit" variant="secondary" disabled={!signed || upload.isPending}>
                  Subir escaneado
                </Button>
              </form>
            )}
            {upload.error instanceof ApiError ? (
              <div className="mt-2">
                <Alert tone="danger">{errorMessage(upload.error.data)}</Alert>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {tab === 'cronologia' ? (
        <Card>
          <Timeline events={events.data ?? []} />
        </Card>
      ) : null}
    </>
  )
}
