import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

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
import { ConditionsForm } from '../components/Conditions'
import { ScheduleTable } from '../components/ScheduleTable'
import { Timeline } from '../components/Timeline'
import { Alert, Badge, Button, buttonClass, Card, PageHeader, Spinner } from '../components/ui'
import { toRequest, type Conditions } from '../lib/conditions'
import { APPLICATION_STATUS, dateOf, day, errorMessage, installmentsText, pct, rd } from '../lib/format'
import { useLiveQuote } from '../lib/hooks'
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
          {installmentsText(application.approved_installments ?? 0, application.approved_frequency)} al{' '}
          {pct(application.approved_rate, 4)}. Vigente hasta {day(application.valid_until)}.
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
        <Alert tone="warning">La aprobación venció sin desembolsar: envíala de nuevo a evaluación.</Alert>
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

/** P27 (editor) and P28 (review and decision) in one place. */
export function ApplicationDetailPage({ me }: { me: Me }) {
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

  const save = useMutation({
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
  const submit = useMutation({ mutationFn: () => submitApplication(id), onSuccess: refresh })
  const withdraw = useMutation({
    mutationFn: (note: string) => withdrawApplication(id, note),
    onSuccess: refresh,
  })

  if (application.isPending) return <Spinner />
  if (!data || !conditions) return <Alert tone="danger">No se encontró la solicitud.</Alert>

  const status = APPLICATION_STATUS[data.status]
  const product = products.data?.results.find((p) => p.id === data.product)
  const failure = [submit.error, save.error, withdraw.error].find((e) => e instanceof ApiError) as
    | ApiError
    | undefined
  const issues =
    ((failure?.data as Record<string, unknown> | undefined)?.issues as { message: string }[]) ?? []
  const canVerify =
    hasRole(me, ACCESS.originate) &&
    ['draft', 'returned', 'in_review'].includes(data.status)
  const schedule = quote.data?.schedule ?? evaluation.data?.simulation.schedule

  return (
    <>
      <PageHeader
        back={
          <Link to="/solicitudes" className="hover:underline">
            ← Solicitudes
          </Link>
        }
        documentTitle={`Solicitud ${data.number}`}
        title={
          <span className="flex flex-wrap items-center gap-2">
            Solicitud <span className="tabular-nums">{data.number}</span>
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
            · {data.product_name} · sucursal {data.branch_code} · creada por {data.created_by_name}
          </>
        }
        actions={
          <>
            {data.can.withdraw ? (
              <Button
                variant="secondary"
                disabled={withdraw.isPending}
                onClick={() => {
                  const note = window.prompt('¿Por qué desiste el cliente? (opcional)')
                  if (note !== null) withdraw.mutate(note)
                }}
              >
                Desistió
              </Button>
            ) : null}
            {data.can.submit ? (
              <Button onClick={() => submit.mutate()} disabled={submit.isPending || Boolean(draft)}>
                {submit.isPending ? 'Enviando…' : 'Enviar a aprobación'}
              </Button>
            ) : null}
            {data.can.disburse ? (
              <Link
                to="/desembolsos/$id"
                params={{ id: data.id }}
                className={buttonClass()}
              >
                Desembolsar
              </Link>
            ) : null}
          </>
        }
      />

      <StatusNotice application={data} />
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

      {data.can.decide ? (
        <DecisionPanel
          application={data}
          frequencies={product?.allowed_frequencies ?? [data.frequency]}
          onDone={refresh}
        />
      ) : null}

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Condiciones solicitadas</h2>
          {data.can.edit && draft ? (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setDraft(null)}>
                Descartar
              </Button>
              <Button onClick={() => save.mutate()} disabled={Boolean(fieldErrors) || save.isPending}>
                Guardar condiciones
              </Button>
            </div>
          ) : null}
        </div>
        {data.can.edit ? (
          <ConditionsForm
            products={products.data?.results ?? []}
            value={conditions}
            onChange={setDraft}
            errorText={errorText}
          />
        ) : (
          <p className="text-sm">
            {rd(data.amount)} en {installmentsText(data.installments, data.frequency)} al{' '}
            {pct(data.rate, 4)}{' '}
            {data.rate_unit === 'monthly' ? 'mensual' : data.rate_unit === 'annual' ? 'anual' : 'por período'}
            {data.purpose ? ` · destino: ${data.purpose}` : ''}
          </p>
        )}
        {schedule ? (
          <details>
            <summary className="cursor-pointer text-sm font-medium text-brand-700">
              Tabla de pagos estimada {draft ? '(con los cambios sin guardar)' : ''}
            </summary>
            <div className="mt-3">
              <ScheduleTable rows={schedule} principal={(quote.data ?? evaluation.data?.simulation)?.principal} />
            </div>
          </details>
        ) : null}
      </Card>

      <EvaluationPanel application={data} evaluation={evaluation.data} onChange={refresh} />
      <GuaranteesPanel application={data} onChange={refresh} />
      <DocumentsPanel application={data} canVerify={canVerify} onChange={refresh} />

      <Card>
        <h2 className="mb-3 text-base font-semibold">Historial</h2>
        <Timeline events={events.data ?? []} />
      </Card>
    </>
  )
}
