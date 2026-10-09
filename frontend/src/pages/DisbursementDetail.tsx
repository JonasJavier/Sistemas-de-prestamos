import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { useState } from 'react'

import { ApiError } from '../api/client'
import {
  disburse,
  getApplication,
  getDisbursementPreview,
  getLoanDocuments,
  loanDocumentUrl,
} from '../api/origination'
import { ScheduleTable } from '../components/ScheduleTable'
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Stat,
} from '../components/ui'
import { buttonClass } from '../components/classes'
import { day, errorMessage, newIdempotencyKey, rd } from '../lib/format'

type Method = 'cash' | 'transfer' | 'check'

function Done({ number }: { number: string }) {
  const docs = useQuery({
    queryKey: ['loan', number, 'documents'],
    queryFn: () => getLoanDocuments(number),
  })
  return (
    <Card className="space-y-4">
      <Alert tone="success">
        Préstamo <strong className="tabular-nums">{number}</strong> desembolsado. Imprime el pagaré
        y la tabla de pagos y haz que el cliente (y sus garantes) firmen{' '}
        <strong>antes de entregar el dinero</strong>.
      </Alert>
      <div className="flex flex-wrap gap-2">
        {docs.data?.documents.map((doc) => (
          <a
            key={doc.id}
            href={loanDocumentUrl(number, doc.id)}
            target="_blank"
            rel="noopener"
            className={buttonClass('secondary')}
          >
            Imprimir {doc.label.toLowerCase()}
          </a>
        )) ?? <Spinner label="Preparando documentos…" />}
        <Link to="/prestamos/$numero" params={{ numero: number }} className={buttonClass()}>
          Ver el expediente del préstamo
        </Link>
      </div>
    </Card>
  )
}

/** P30: checklist, source, net to hand over — then the atomic operation. */
export function DisbursementDetailPage() {
  const { id } = useParams({ from: '/app/desembolsos/$id' })
  const application = useQuery({ queryKey: ['application', id], queryFn: () => getApplication(id) })
  const preview = useQuery({
    queryKey: ['application', id, 'disbursement'],
    queryFn: () => getDisbursementPreview(id),
    retry: false,
  })
  // One key per visit: retries and double clicks reuse it (doc 03 - 6).
  const [key] = useState(newIdempotencyKey)
  const [source, setSource] = useState('')
  const [method, setMethod] = useState<Method>('cash')
  const [reference, setReference] = useState('')
  const [identity, setIdentity] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const run = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      disburse(id, {
        source_account: method === 'cash' ? null : source,
        method,
        reference,
        idempotency_key: key,
      }),
    onSuccess: (result) => setDone(result.loan),
  })

  if (application.isPending || preview.isPending) return <Spinner />
  const app = application.data
  if (!app) return <Alert tone="danger">No se encontró la solicitud.</Alert>
  const back = (
    <Link to="/desembolsos" className="hover:underline">
      ← Por desembolsar
    </Link>
  )
  if (done || app.loan_number) {
    return (
      <>
        <PageHeader
          back={back}
          title={`Desembolso de ${app.number}`}
          subtitle={app.customer_name}
        />
        <Done number={done ?? app.loan_number!} />
      </>
    )
  }
  if (preview.error) {
    return (
      <>
        <PageHeader back={back} title={`Desembolso de ${app.number}`} />
        <Alert tone="danger">
          {preview.error instanceof ApiError ? errorMessage(preview.error.data) : 'No disponible.'}
        </Alert>
      </>
    )
  }
  const data = preview.data!
  const sim = data.simulation
  const accounts = data.accounts.filter((a) => a.kind === 'bank')
  const chosen = data.accounts.find((a) => a.id === source)
  const drawer = data.cash_session
  const available =
    method === 'cash' ? (drawer ? Number(drawer.cash) : 0) : Number(chosen?.balance ?? 0)
  // F11 (decision 092): a renewal hands over only what the old loan's payoff leaves.
  const handOver = data.renewal ? data.renewal.net : sim.net_disbursed
  const short =
    (method === 'cash' ? Boolean(drawer) : Boolean(chosen)) && available < Number(handOver)
  const ready = method === 'cash' ? Boolean(drawer?.branch_matches) : Boolean(source)
  const failure = run.error instanceof ApiError ? run.error.data : null

  return (
    <>
      <PageHeader
        back={back}
        title={`Desembolso de ${app.number}`}
        subtitle={
          <>
            {app.customer_name} · {app.product_name}
          </>
        }
      />
      {data.blockers.map((blocker) => (
        <Alert key={blocker} tone="danger">
          {blocker}
        </Alert>
      ))}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Monto aprobado" value={rd(sim.requested_amount)} />
        <Stat
          label="Cargos"
          value={rd(sim.total_charges)}
          hint={
            Number(data.financed_charges) > 0
              ? `${rd(data.financed_charges)} financiados`
              : Number(data.cash_charges) > 0
                ? `${rd(data.cash_charges)} se cobran aparte`
                : undefined
          }
        />
        <Stat
          label="Neto a entregar"
          value={rd(handOver)}
          emphasis
          hint={
            data.renewal ? `liquida ${data.renewal.loan}: ${rd(data.renewal.payoff)}` : undefined
          }
        />
        <Stat
          label="Primera cuota"
          value={day(sim.schedule[0]?.due_date)}
          hint={rd(sim.schedule[0]?.total)}
        />
      </div>

      <Card className="space-y-3">
        <h2 className="text-base font-semibold">Confirmar</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={identity}
            onChange={(e) => setIdentity(e.target.checked)}
          />
          Verifiqué la identidad del cliente con su documento original.
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Medio">
            <Select
              value={method}
              onChange={(e) => {
                setMethod(e.target.value as Method)
                setSource('')
              }}
            >
              <option value="cash">Efectivo</option>
              <option value="transfer">Transferencia</option>
              <option value="check">Cheque</option>
            </Select>
          </Field>
          {method === 'cash' ? (
            <Field label="Sale de">
              <div className="flex h-11 items-center rounded-lg border border-edge bg-surface-2 px-3 text-sm sm:h-9">
                {drawer ? (
                  `Tu caja ${drawer.number} · ${rd(drawer.cash)}`
                ) : (
                  <Link to="/caja" className="font-semibold text-brand-700 underline">
                    Abre tu caja para entregar efectivo
                  </Link>
                )}
              </div>
            </Field>
          ) : (
            <Field label="Cuenta bancaria de origen">
              <Select value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="">{accounts.length ? 'Elegir…' : 'No hay cuentas bancarias'}</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · saldo {rd(account.balance)}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field
            label={method === 'cash' ? 'Referencia (opcional)' : 'Número de transferencia o cheque'}
          >
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
        </div>
        {short ? (
          <Alert tone="warning">
            {method === 'cash'
              ? 'Tu caja no tiene efectivo suficiente: pide más fondo a la caja general.'
              : 'La cuenta elegida no tiene fondos suficientes: no se permite sobregiro.'}
          </Alert>
        ) : null}
        {method === 'cash' && drawer && !drawer.branch_matches ? (
          <Alert tone="warning">Tu caja abierta es de otra sucursal.</Alert>
        ) : null}
        {failure ? <Alert tone="danger">{errorMessage(failure)}</Alert> : null}
        <div className="flex justify-end">
          <Button
            onClick={() => run.mutate()}
            disabled={!identity || !ready || short || data.blockers.length > 0 || run.isPending}
          >
            {run.isPending ? 'Desembolsando…' : `Desembolsar ${rd(handOver)}`}
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 text-base font-semibold">Tabla de pagos</h2>
        <ScheduleTable rows={sim.schedule} principal={sim.principal} />
      </Card>
    </>
  )
}
