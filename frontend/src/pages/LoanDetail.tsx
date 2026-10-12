import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { useState } from 'react'

import type { Me } from '../api/accounts'
import { ApiError } from '../api/client'
import {
  getLoan,
  getLoanCalendar,
  getLoanDocuments,
  getLoanEvents,
  loanDocumentUrl,
  uploadSignedNote,
} from '../api/origination'
import { PaymentList } from '../components/PaymentList'
import { buttonClass } from '../components/classes'
import { CollectionTimeline } from '../components/CollectionTimeline'
import { MoreMenu } from '../components/MoreMenu'
import { LoanCalendar } from '../components/LoanCalendar'
import { CollectIcon } from '../components/icons'
import { Timeline } from '../components/Timeline'
import { useLoanMenu } from './loan/useLoanMenu'
import {
  Alert,
  Badge,
  Button,
  Card,
  FilePicker,
  Avatar,
  Spinner,
  Stat,
  Tabs,
} from '../components/ui'
import {
  day,
  errorMessage,
  installmentsText,
  LOAN_STATUS,
  METHOD_TEXT,
  moment,
  pct,
  plural,
  rd,
} from '../lib/format'
import { useDocumentTitle } from '../lib/hooks'
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

/** P32: header with the balance; the tabs explain any figure. */
export function LoanDetailPage({ me }: { me: Me }) {
  const { numero } = useParams({ from: '/app/prestamos/$numero' })
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<TabKey>('resumen')
  const loan = useQuery({ queryKey: ['loan', numero], queryFn: () => getLoan(numero) })
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
  const menu = useLoanMenu(me, loan.data)
  useDocumentTitle(`Préstamo ${numero}`)
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
  return (
    <>
      <section className="flex flex-wrap items-center gap-x-5 gap-y-4 rounded-card border border-edge bg-surface px-4 py-4 shadow-sm sm:px-6 sm:py-5">
        <div className="flex min-w-0 flex-1 basis-72 items-center gap-4">
          <Avatar name={data.customer_name} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="eyebrow">
              <Link to="/prestamos" className="hover:text-ink">
                Préstamos
              </Link>{' '}
              · <span className="tabular-nums">{data.number}</span>
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h1 className="text-[21px] leading-tight sm:text-[24px]">
                <Link to="/clientes/$id" params={{ id: data.customer }} className="hover:underline">
                  {data.customer_name}
                </Link>
              </h1>
              <Badge tone={status?.tone} dot>
                {status?.label ?? data.status}
              </Badge>
              {active && data.days_past_due > 0 ? (
                <Badge tone={data.days_past_due > 30 ? 'danger' : 'warning'} dot>
                  {plural(data.days_past_due, 'día')} de atraso
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-muted">
              <span>{data.product_name}</span>
              <span>Sucursal {data.branch_code}</span>
              <span>
                {data.collector_name ? `Cobra ${data.collector_name}` : 'Paga en oficina'}
              </span>
              {data.application ? (
                <span>
                  Solicitud{' '}
                  <Link
                    to="/solicitudes/$id"
                    params={{ id: data.application }}
                    className="hover:text-ink hover:underline"
                  >
                    {data.application_number}
                  </Link>
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto [&>*]:max-sm:flex-1">
          <MoreMenu items={menu.items} />
          {(active || data.status === 'written_off') && hasRole(me, ACCESS.collect) ? (
            <Link to="/cobrar/$numero" params={{ numero }} className={buttonClass()}>
              <CollectIcon className="size-[18px] shrink-0" />
              Cobrar
            </Link>
          ) : null}
        </div>
      </section>

      {menu.error}
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
      {menu.dialogs}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Capital pendiente" value={rd(data.principal_outstanding)} emphasis />
        <Stat label="Interés por cobrar" value={rd(data.interest_outstanding)} />
        <Stat
          label={data.days_past_due > 0 ? 'Vencido desde' : 'Próximo vencimiento'}
          value={day(data.next_due_date)}
          danger={data.days_past_due > 0}
        />
        <Stat
          label="Atraso"
          value={data.days_past_due === 0 ? 'Al día' : `${data.days_past_due} días`}
          danger={data.days_past_due > 0}
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
        <div className="overflow-hidden rounded-card border border-edge bg-surface shadow-sm">
          {calendar.isPending ? (
            <div className="p-5">
              <Spinner />
            </div>
          ) : (
            <LoanCalendar rows={calendar.data?.installments ?? []} terms={terms ?? null} />
          )}
        </div>
      ) : null}

      {tab === 'pagos' ? (
        <Card>
          <PaymentList
            filter={{ loan: numero }}
            queryKey={['loan', numero, 'payments']}
            describe={(p) =>
              [p.kind_label, p.method_label, moment(p.paid_at), p.collected_by_name]
                .filter(Boolean)
                .join(' · ')
            }
          />
        </Card>
      ) : null}

      {tab === 'gestiones' ? (
        <CollectionTimeline
          loan={numero}
          customerName={data.customer_name}
          canManage={active && hasRole(me, ACCESS.manageCollections)}
        />
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
            {documents.data?.documents
              .filter((doc) => doc.kind === 'pledge_contract' || doc.kind === 'mortgage_contract')
              .map((doc) => (
                <a
                  key={`${doc.id}-docx`}
                  href={`/api/v1/prestamos/${encodeURIComponent(numero)}/contratos/${doc.kind}/docx/`}
                  className="inline-flex h-11 items-center rounded-lg border border-dashed border-edge bg-surface px-4 text-sm font-semibold hover:bg-brand-100 sm:h-9"
                >
                  {doc.label} · DOCX editable
                </a>
              ))}
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
                <FilePicker
                  file={signed}
                  onPick={setSigned}
                  accept=".pdf,.jpg,.jpeg,.png,.heic"
                  label="Elegir el pagaré escaneado"
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
