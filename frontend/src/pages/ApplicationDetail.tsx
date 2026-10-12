import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { usePrompt } from '../components/Dialog'

import type { Me } from '../api/accounts'
import { ApiError } from '../api/client'
import { listProducts } from '../api/lending'
import {
  getApplication,
  getApplicationEvents,
  getEvaluation,
  submitApplication,
  updateApplication,
  withdrawApplication,
  type Application,
} from '../api/origination'
import { ConditionsForm, QuoteBlock } from '../components/Conditions'
import { ArrowRightIcon } from '../components/icons'
import { Steps } from '../components/Steps'
import { ScheduleTable } from '../components/ScheduleTable'
import { Timeline } from '../components/Timeline'
import { Alert, Avatar, Badge, Button, Card, Spinner } from '../components/ui'
import { buttonClass } from '../components/classes'
import { toRequest, type Conditions } from '../lib/conditions'
import {
  APPLICATION_STATUS,
  dateOf,
  day,
  errorMessage,
  installmentsText,
  pct,
  rd,
} from '../lib/format'
import { useLiveQuote, useMedia } from '../lib/hooks'
import { ACCESS, hasRole } from '../lib/roles'
import { DecisionPanel } from './application/DecisionPanel'
import { DocumentsPanel } from './application/DocumentsPanel'
import { EvaluationPanel } from './application/EvaluationPanel'
import { GuaranteesPanel } from './application/GuaranteesPanel'

function conditionsOf(application: Application): Conditions {
  return {
    productId: application.product,
    amount: application.amount,
    installments: String(application.installments),
    frequency: application.frequency,
    rate: application.rate,
  }
}

function StatusNotice({ application }: { application: Application }) {
  switch (application.status) {
    case 'returned':
      return (
        <Alert tone="warning">
          Devuelta por {application.decided_by_name ?? 'el aprobador'}: {application.decision_note}
        </Alert>
      )
    case 'rejected':
      return (
        <Alert tone="danger">
          Rechazada por {application.decided_by_name}: {application.decision_reason_text}.{' '}
          {application.decision_note}
        </Alert>
      )
    case 'approved':
      return (
        <Alert tone="success">
          Aprobada por {application.decided_by_name} por {rd(application.approved_amount)} en{' '}
          {installmentsText(application.approved_installments ?? 0, application.approved_frequency)}{' '}
          al {pct(application.approved_rate, 4)}. Vigente hasta {day(application.valid_until)}.
          {application.decision_note ? ` Nota: ${application.decision_note}` : ''}
        </Alert>
      )
    case 'in_review':
      return (
        <Alert tone="info">
          En evaluación desde {dateOf(application.submitted_at)}; asignada a{' '}
          {application.assigned_approver_name}.
        </Alert>
      )
    case 'expired':
      return (
        <Alert tone="warning">
          La aprobación venció sin desembolsar: envíala de nuevo a evaluación.
        </Alert>
      )
    case 'disbursed':
      return (
        <Alert tone="success">
          Desembolsada como préstamo{' '}
          <Link
            to="/prestamos/$numero"
            params={{ numero: application.loan_number ?? '' }}
            className="font-semibold underline"
          >
            {application.loan_number}
          </Link>
          .
        </Alert>
      )
    default:
      return null
  }
}

/** P27 (editor) and P28 (review and decision) in one place, as the rest of
 * the wizard (decision 116): its steps lead to each part of the file. */
export function ApplicationDetailPage({ me }: { me: Me }) {
  const [dialog, ask] = usePrompt()
  const { id } = useParams({ from: '/app/solicitudes/$id' })
  const queryClient = useQueryClient()
  const application = useQuery({ queryKey: ['application', id], queryFn: () => getApplication(id) })
  const evaluation = useQuery({
    queryKey: ['application', id, 'evaluation'],
    queryFn: () => getEvaluation(id),
    retry: false,
  })
  const events = useQuery({
    queryKey: ['application', id, 'events'],
    queryFn: () => getApplicationEvents(id),
  })
  const products = useQuery({ queryKey: ['products'], queryFn: listProducts })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['application', id] })

  const data = application.data
  const [draft, setDraft] = useState<Conditions | null>(null)
  const conditions = draft ?? (data ? conditionsOf(data) : null)
  const request = useMemo(
    () => (draft && conditions ? toRequest(conditions) : null),
    [draft, conditions],
  )
  const { quote, fieldErrors, errorText } = useLiveQuote(request)
  const wide = useMedia('(min-width: 1280px)')

  const save = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      updateApplication(id, {
        product: conditions!.productId,
        amount: conditions!.amount,
        installments: Number(conditions!.installments),
        frequency: conditions!.frequency,
        rate: conditions!.rate,
      }),
    onSuccess: () => {
      setDraft(null)
      refresh()
    },
  })
  const submit = useMutation({
    meta: { inlineError: true },
    mutationFn: () => submitApplication(id),
    onSuccess: refresh,
  })
  const withdraw = useMutation({
    meta: { inlineError: true },
    mutationFn: (note: string) => withdrawApplication(id, note),
    onSuccess: refresh,
  })

  if (application.isPending) return <Spinner />
  if (!data || !conditions) return <Alert tone="danger">No se encontró la solicitud.</Alert>

  const status = APPLICATION_STATUS[data.status]
  const product = products.data?.results.find((p) => p.id === data.product)
  const failure = [submit.error, save.error, withdraw.error].find((e) => e instanceof ApiError) as
    ApiError | undefined
  const issues =
    ((failure?.data as Record<string, unknown> | undefined)?.issues as { message: string }[]) ?? []
  const canVerify =
    hasRole(me, ACCESS.originate) && ['draft', 'returned', 'in_review'].includes(data.status)
  const simulation = quote.data ?? evaluation.data?.simulation
  const schedule = simulation?.schedule
  // Where the application stands in the five steps of the wizard (decision 116).
  const current = ['approved', 'disbursed'].includes(data.status)
    ? 5
    : data.status === 'in_review'
      ? 4
      : 2
  const steps = [
    { label: 'Cliente', hint: data.customer_name, href: '#condiciones' },
    { label: 'Condiciones', hint: rd(data.approved_amount ?? data.amount), href: '#condiciones' },
    { label: 'Garantías', hint: 'Bienes y garantes', href: '#garantias' },
    { label: 'Documentos', hint: 'Cédula, ingresos', href: '#documentos' },
    {
      label: 'Revisión',
      hint: data.can.decide ? 'Te toca decidir' : (status?.label ?? ''),
      href: data.can.decide ? '#decision' : '#evaluacion',
    },
  ]
  const quoteBlock = simulation ? (
    <QuoteBlock
      data={simulation}
      frequency={conditions.frequency}
      note={draft ? 'Con los cambios sin guardar' : 'Lo que se pidió, según el producto'}
    />
  ) : null

  return (
    <>
      {dialog}
      <section className="overflow-hidden rounded-card border border-edge bg-surface shadow-sm">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-4 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex min-w-0 flex-1 basis-72 items-center gap-4">
            <Avatar name={data.customer_name} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="eyebrow">
                <Link to="/solicitudes" className="hover:text-ink">
                  Solicitudes
                </Link>{' '}
                · {data.number}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="text-[21px] leading-tight sm:text-[24px]">
                  <Link
                    to="/clientes/$id"
                    params={{ id: data.customer }}
                    className="hover:underline"
                  >
                    {data.customer_name}
                  </Link>
                </h1>
                <Badge tone={status?.tone} dot>
                  {status?.label ?? data.status}
                </Badge>
              </div>
              <p className="mt-1 flex flex-wrap gap-x-3 text-[12.5px] text-muted">
                <span>{data.product_name}</span>
                <span>Sucursal {data.branch_code}</span>
                <span>Creada por {data.created_by_name}</span>
              </p>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto [&>*]:max-sm:flex-1">
            {data.can.withdraw ? (
              <Button
                variant="secondary"
                disabled={withdraw.isPending}
                onClick={async () => {
                  const note = await ask({
                    title: 'El cliente desistió',
                    label: 'Motivo (opcional)',
                    type: 'textarea',
                    confirmText: 'Marcar como desistida',
                  })
                  if (note !== null) withdraw.mutate(note)
                }}
              >
                Desistió
              </Button>
            ) : null}
            {data.can.decide ? (
              <Button
                onClick={() =>
                  document
                    .getElementById('decision')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
              >
                Decidir
              </Button>
            ) : null}
            {data.can.submit ? (
              <Button onClick={() => submit.mutate()} disabled={submit.isPending || Boolean(draft)}>
                {submit.isPending ? 'Enviando…' : 'Enviar a aprobación'}
                <ArrowRightIcon />
              </Button>
            ) : null}
            {data.can.disburse ? (
              <Link to="/desembolsos/$id" params={{ id: data.id }} className={buttonClass()}>
                Desembolsar
                <ArrowRightIcon />
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)_320px]">
        <div className="lg:sticky lg:top-24 lg:pt-2">
          <Steps steps={steps} current={current} />
        </div>

        <div className="min-w-0 space-y-4">
          <StatusNotice application={data} />
          {data.renews_number ? (
            <Alert tone="info">
              Renovación del préstamo{' '}
              <Link
                to="/prestamos/$numero"
                params={{ numero: data.renews_number }}
                className="font-semibold underline"
              >
                {data.renews_number}
              </Link>
              : al desembolsarla se liquida con el monto nuevo y se entrega solo el neto.
            </Alert>
          ) : null}
          {data.customer_status === 'blocked' ? (
            <Alert tone="danger">El cliente está bloqueado: la solicitud no puede aprobarse.</Alert>
          ) : null}
          {failure ? (
            <Alert tone="danger">
              {errorMessage(failure.data)}
              {issues.length ? (
                <ul className="mt-1 list-disc pl-5">
                  {issues.map((issue) => (
                    <li key={issue.message}>{issue.message}</li>
                  ))}
                </ul>
              ) : null}
            </Alert>
          ) : null}

          <section
            id="condiciones"
            className="scroll-mt-24 overflow-hidden rounded-card border border-edge bg-surface shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-3.5">
              <h2 className="text-[16px] font-semibold">Condiciones solicitadas</h2>
              {data.can.edit && draft ? (
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setDraft(null)}>
                    Descartar
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => save.mutate()}
                    disabled={Boolean(fieldErrors) || save.isPending}
                  >
                    Guardar condiciones
                  </Button>
                </div>
              ) : null}
            </div>
            <div className="px-5 py-5">
              {data.can.edit ? (
                <ConditionsForm
                  products={products.data?.results ?? []}
                  value={conditions}
                  onChange={setDraft}
                  errorText={errorText}
                />
              ) : (
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-4">
                  {[
                    ['Monto', rd(data.amount)],
                    ['Plazo', installmentsText(data.installments, data.frequency)],
                    [
                      `Tasa ${data.rate_unit === 'monthly' ? 'mensual' : data.rate_unit === 'annual' ? 'anual' : 'por período'}`,
                      pct(data.rate, 4),
                    ],
                    ['Destino', data.purpose || '—'],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-muted">{label}</dt>
                      <dd className="mt-0.5 font-display text-[16px] font-semibold">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {!wide && quoteBlock ? <div className="mt-5">{quoteBlock}</div> : null}
              {schedule ? (
                <details className="mt-4 rounded-xl border border-edge bg-surface-2/60 px-4 py-3">
                  <summary className="cursor-pointer text-[13px] font-semibold">
                    Tabla de pagos estimada {draft ? '(con los cambios sin guardar)' : ''}
                  </summary>
                  <div className="mt-3">
                    <ScheduleTable rows={schedule} principal={simulation?.principal} />
                  </div>
                </details>
              ) : null}
            </div>
          </section>

          <div id="evaluacion" className="scroll-mt-24">
            <EvaluationPanel application={data} evaluation={evaluation.data} onChange={refresh} />
          </div>
          <div id="garantias" className="scroll-mt-24">
            <GuaranteesPanel application={data} onChange={refresh} />
          </div>
          <div id="documentos" className="scroll-mt-24">
            <DocumentsPanel application={data} canVerify={canVerify} onChange={refresh} />
          </div>

          {/* The decision comes after what it is decided on; «Decidir» jumps here. */}
          {data.can.decide ? (
            <div id="decision" className="scroll-mt-24">
              <DecisionPanel
                application={data}
                frequencies={product?.allowed_frequencies ?? [data.frequency]}
                onDone={refresh}
              />
            </div>
          ) : null}

          <Card>
            <h2 className="mb-3 text-[16px] font-semibold">Historial</h2>
            <Timeline events={events.data ?? []} />
          </Card>
        </div>

        {wide ? <aside className="sticky top-24">{quoteBlock}</aside> : null}
      </div>
    </>
  )
}
