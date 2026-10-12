import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'

import { ApiError } from '../api/client'
import {
  type Application,
  disburse,
  getApplication,
  getDisbursementPreview,
  getLoanDocuments,
  loanDocumentUrl,
} from '../api/origination'
import { ArrowsIcon, CashIcon, CheckIcon, InvoiceIcon } from '../components/icons'
import { ScheduleTable } from '../components/ScheduleTable'
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Field,
  Input,
  Select,
  Spinner,
  Texture,
} from '../components/ui'
import { buttonClass } from '../components/classes'
import { day, errorMessage, newIdempotencyKey, rd } from '../lib/format'
import { useDocumentTitle } from '../lib/hooks'

type Method = 'cash' | 'transfer' | 'check'

const METHODS: [Method, string, ReactNode][] = [
  ['cash', 'Efectivo', <CashIcon key="cash" className="size-[18px] shrink-0" />],
  ['transfer', 'Transferencia', <ArrowsIcon key="transfer" className="size-[18px] shrink-0" />],
  ['check', 'Cheque', <InvoiceIcon key="check" className="size-[18px] shrink-0" />],
]

/** Who receives and from which application (decision 116). */
function Header({ app }: { app: Application }) {
  useDocumentTitle(`Desembolso de ${app.number}`)
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-card border border-edge bg-surface px-5 py-4 shadow-sm">
      <Avatar name={app.customer_name} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="eyebrow">
          <Link to="/desembolsos" className="hover:text-ink">
            Por desembolsar
          </Link>{' '}
          · {app.number}
        </p>
        <h1 className="mt-0.5 text-[21px] leading-tight sm:text-[24px]">{app.customer_name}</h1>
        <p className="text-[12.5px] text-muted">{app.product_name}</p>
      </div>
      {app.loan_number ? (
        <Badge tone="brand" dot>
          Desembolsada
        </Badge>
      ) : (
        <Badge tone="info" dot>
          Aprobada
        </Badge>
      )}
    </section>
  )
}

/** The money went out (decision 116): a check that pops, then the papers to
 * sign before handing it over. */
function Done({ number }: { number: string }) {
  const docs = useQuery({
    queryKey: ['loan', number, 'documents'],
    queryFn: () => getLoanDocuments(number),
  })
  return (
    <section className="relative overflow-hidden rounded-block bg-brand-950 px-5 py-6 text-on-forest shadow-lg sm:px-7">
      <Texture tone="forest" />
      <div className="relative space-y-4">
        <div className="flex items-center gap-4">
          <span className="grid size-12 shrink-0 animate-pop place-items-center rounded-full bg-forest-accent text-on-forest-accent">
            <CheckIcon className="size-6 shrink-0" />
          </span>
          <div>
            <div className="font-display text-[22px] font-bold">Préstamo desembolsado</div>
            <div className="text-[13.5px] text-brand-200">
              Préstamo <strong className="tabular-nums text-on-forest">{number}</strong>. Imprime el
              pagaré y la tabla de pagos y haz que el cliente (y sus garantes) firmen{' '}
              <strong className="text-on-forest">antes de entregar el dinero</strong>.
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {docs.data?.documents.map((doc) => (
            <a
              key={doc.id}
              href={loanDocumentUrl(number, doc.id)}
              target="_blank"
              rel="noopener"
              className="press press-down inline-flex h-10 items-center rounded-control bg-white/10 px-4 text-[13.5px] font-semibold ring-1 ring-inset ring-white/15 hover:bg-white/15"
            >
              Imprimir {doc.label.toLowerCase()}
            </a>
          )) ?? <Spinner label="Preparando documentos…" />}
          <Link
            to="/prestamos/$numero"
            params={{ numero: number }}
            className="press press-down inline-flex h-10 items-center rounded-control bg-forest-accent px-4 text-[13.5px] font-semibold text-on-forest-accent"
          >
            Ver el expediente del préstamo
          </Link>
        </div>
      </div>
    </section>
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
  if (done || app.loan_number) {
    return (
      <>
        <Header app={app} />
        <Done number={done ?? app.loan_number!} />
      </>
    )
  }
  if (preview.error) {
    return (
      <>
        <Header app={app} />
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
  const [units, cents = '00'] = rd(handOver).replace('RD$ ', '').split('.')

  return (
    <>
      <Header app={app} />
      {data.blockers.map((blocker) => (
        <Alert key={blocker} tone="danger">
          {blocker}
        </Alert>
      ))}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="min-w-0 overflow-hidden rounded-card border border-edge bg-surface shadow-sm">
          <h2 className="border-b border-edge px-5 py-3.5 text-[16px] font-semibold">
            Confirmar el desembolso
          </h2>
          <div className="space-y-5 px-5 py-5">
            <div className="space-y-2.5">
              <div className="text-[13px] font-medium">Cómo se entrega</div>
              <div role="radiogroup" aria-label="Medio" className="grid grid-cols-3 gap-2">
                {METHODS.map(([value, label, icon]) => {
                  const on = method === value
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => {
                        setMethod(value)
                        setSource('')
                      }}
                      className={`press press-down flex h-11 items-center justify-center gap-2 rounded-[10px] text-[13.5px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                        on
                          ? 'bg-brand-950 text-on-forest shadow-sm'
                          : 'bg-surface text-ink ring-1 ring-inset ring-edge hover:bg-brand-50'
                      }`}
                    >
                      {icon}
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {method === 'cash' ? (
                <Field label="Sale de">
                  <div className="flex h-11 items-center rounded-control border border-edge bg-surface-2 px-3 text-sm sm:h-[38px]">
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
                    <option value="">
                      {accounts.length ? 'Elegir…' : 'No hay cuentas bancarias'}
                    </option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} · saldo {rd(account.balance)}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field
                label={
                  method === 'cash' ? 'Referencia (opcional)' : 'Número de transferencia o cheque'
                }
              >
                <Input value={reference} onChange={(e) => setReference(e.target.value)} />
              </Field>
            </div>
            <label className="flex items-start gap-3 rounded-[10px] border border-edge bg-surface-2/60 px-4 py-3 text-[13.5px]">
              <input
                type="checkbox"
                className="mt-0.5 size-4"
                checked={identity}
                onChange={(e) => setIdentity(e.target.checked)}
              />
              <span>
                <span className="block font-medium">
                  Verifiqué la identidad del cliente con su documento original.
                </span>
                <span className="text-[12.5px] text-muted">
                  Y la de sus garantes, si los tiene. Sin esto no se entrega el dinero.
                </span>
              </span>
            </label>
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
          </div>
          <div className="sticky bottom-20 flex flex-wrap items-center justify-end gap-3 border-t border-edge bg-surface/95 px-5 py-3.5 backdrop-blur-sm sm:static">
            <Link to="/desembolsos" className={buttonClass('ghost', 'max-sm:hidden')}>
              Cancelar
            </Link>
            <Button
              className="w-full sm:w-auto"
              onClick={() => run.mutate()}
              disabled={!identity || !ready || short || data.blockers.length > 0 || run.isPending}
            >
              {run.isPending ? 'Desembolsando…' : `Desembolsar ${rd(handOver)}`}
            </Button>
          </div>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <section className="relative overflow-hidden rounded-block bg-brand-950 px-5 py-5 text-on-forest shadow-lg">
            <Texture tone="forest" />
            <div className="relative space-y-4">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-200">
                  <span aria-hidden className="size-1.5 rounded-full bg-gold-500" />
                  Se entrega
                </div>
                <div className="mt-1 flex items-baseline gap-1.5 font-display tracking-[-0.03em]">
                  <span className="text-[18px] font-semibold text-brand-200">RD$</span>
                  <span className="text-[40px] leading-tight font-bold tabular-nums">{units}</span>
                  <span className="text-[18px] font-semibold text-brand-200">.{cents}</span>
                </div>
              </div>
              <dl className="divide-y divide-white/10 border-t border-white/10 text-[13px]">
                {(
                  [
                    ['Monto aprobado', rd(sim.requested_amount)],
                    [
                      'Cargos',
                      `${rd(sim.total_charges)}${
                        Number(data.financed_charges) > 0
                          ? ' · financiados'
                          : Number(data.cash_charges) > 0
                            ? ' · aparte'
                            : ''
                      }`,
                    ],
                    ...(data.renewal
                      ? ([[`Liquida ${data.renewal.loan}`, rd(data.renewal.payoff)]] as const)
                      : []),
                    [
                      'Primera cuota',
                      `${day(sim.schedule[0]?.due_date)} · ${rd(sim.schedule[0]?.total)}`,
                    ],
                    ['Total a pagar', rd(sim.total_to_pay)],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3 py-2">
                    <dt className="text-brand-200">{label}</dt>
                    <dd className="text-right font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
          <details className="rounded-card border border-edge bg-surface px-4 py-3 shadow-sm">
            <summary className="cursor-pointer text-[13px] font-semibold">Tabla de pagos</summary>
            <div className="mt-3">
              <ScheduleTable rows={sim.schedule} principal={sim.principal} />
            </div>
          </details>
        </aside>
      </div>
    </>
  )
}
