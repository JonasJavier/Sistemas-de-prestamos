import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams, useSearch } from '@tanstack/react-router'
import { useState } from 'react'

import type { Me } from '../api/accounts'
import { ApiError } from '../api/client'
import { listReasons } from '../api/origination'
import {
  getReceipt,
  getReversalEffect,
  requestReversal,
  setReceiptLink,
  type Receipt,
} from '../api/payments'
import { buttonClass } from '../components/classes'
import { Modal } from '../components/Modal'
import { ReceiptView } from '../components/ReceiptView'
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Segmented,
  Select,
  Spinner,
  Textarea,
  Texture,
} from '../components/ui'
import { CheckIcon } from '../components/icons'
import { day, errorMessage, rd } from '../lib/format'
import { printArea, whatsappLink } from '../lib/print'
import { ACCESS, hasRole } from '../lib/roles'
import { notify } from '../lib/toast'

/** P35: reverse or correct, see the effect, then ask for the authorization. */
function ReversalDialog({ receipt, onClose }: { receipt: Receipt; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'reverse' | 'correct'>('reverse')
  const [correct, setCorrect] = useState('')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const reasons = useQuery({
    queryKey: ['reasons', 'reversal'],
    queryFn: () => listReasons('reversal'),
  })
  const correctAmount =
    mode === 'correct' && Number(correct) > 0 ? Number(correct).toFixed(2) : undefined
  const effect = useQuery({
    queryKey: ['reversal-effect', receipt.number, correctAmount ?? ''],
    queryFn: () => getReversalEffect(receipt.number, correctAmount),
    enabled: mode === 'reverse' || correctAmount !== undefined,
    retry: false,
  })
  const send = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      requestReversal(receipt.number, { reason, note, correct_amount: correctAmount ?? null }),
    onSuccess: () => {
      notify('Pedido enviado: otra persona debe autorizarlo.', 'success')
      void queryClient.invalidateQueries({ queryKey: ['receipt', receipt.number] })
      onClose()
    },
  })
  return (
    <Modal onClose={onClose} labelledBy="reversal-title">
      <div className="max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-2xl bg-surface p-5 shadow-xl">
        <h2 id="reversal-title" className="text-lg font-semibold">
          Reversar o corregir {receipt.number}
        </h2>
        <p className="text-sm text-muted">
          Nada se borra: el pago se reversa completo con un asiento inverso y, si corriges, se
          registra el monto correcto en la misma operación. Lo autoriza otra persona.
        </p>
        <div
          role="radiogroup"
          aria-label="Qué hacer"
          className="inline-flex gap-0.5 rounded-control bg-surface p-[3px] shadow-xs ring-1 ring-inset ring-edge"
        >
          {(
            [
              ['reverse', 'Reversar'],
              ['correct', 'Corregir el monto'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => setMode(value)}
              disabled={value === 'correct' && receipt.kind !== 'regular'}
              className={`press h-8 rounded-lg px-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:opacity-50 ${
                mode === value
                  ? 'bg-brand-100 font-semibold text-brand-800'
                  : 'font-medium text-muted hover:bg-brand-50 hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === 'correct' ? (
          <Field label={`Monto correcto (se registró ${rd(receipt.amount)})`}>
            <Input
              inputMode="decimal"
              value={correct}
              onChange={(e) => setCorrect(e.target.value)}
            />
          </Field>
        ) : null}
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
        <Field label="Qué pasó">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="rounded-xl border border-edge bg-surface-2/60 p-3.5 text-[13px]">
          <h3 className="mb-1.5 font-semibold">Efecto</h3>
          {effect.isFetching && !effect.data ? (
            <Spinner label="Calculando…" />
          ) : effect.error instanceof ApiError ? (
            <Alert tone="danger">{errorMessage(effect.error.data)}</Alert>
          ) : effect.data ? (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <dt className="text-muted">Sale de la caja o del banco</dt>
              <dd className="text-right tabular-nums">{rd(effect.data.cash_out)}</dd>
              {Number(effect.data.cash_in) ? (
                <>
                  <dt className="text-muted">Entra (monto correcto)</dt>
                  <dd className="text-right tabular-nums">{rd(effect.data.cash_in)}</dd>
                </>
              ) : null}
              <dt className="text-muted">Capital pendiente</dt>
              <dd className="text-right tabular-nums">
                {rd(effect.data.principal_before)} → {rd(effect.data.principal_after)}
              </dd>
              <dt className="text-muted">Cuotas</dt>
              <dd className="text-right">
                {effect.data.installments
                  .filter((i) => i.status !== 'paid')
                  .slice(0, 3)
                  .map((i) => `#${i.number} debe ${rd(i.owed)}`)
                  .join(' · ') || 'todas pagadas'}
              </dd>
            </dl>
          ) : (
            <p className="text-muted">Escribe el monto correcto para ver el efecto.</p>
          )}
        </div>
        {send.error instanceof ApiError ? (
          <Alert tone="danger">{errorMessage(send.error.data)}</Alert>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            disabled={
              !reason ||
              !note.trim() ||
              (mode === 'correct' && !correctAmount) ||
              send.isPending ||
              effect.isError
            }
            onClick={() => send.mutate()}
          >
            Pedir autorización
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** P34: the receipt, its printing on paper or thermal, and the WhatsApp link. */
export function ReceiptPage({ me }: { me: Me }) {
  const { numero } = useParams({ from: '/app/recibos/$numero' })
  const { nuevo } = useSearch({ from: '/app/recibos/$numero' })
  const queryClient = useQueryClient()
  const [paper, setPaper] = useState<'letter' | 'thermal'>('letter')
  const [reversing, setReversing] = useState(false)
  const receipt = useQuery({ queryKey: ['receipt', numero], queryFn: () => getReceipt(numero) })
  const link = useMutation({
    mutationFn: (revoke: boolean) => setReceiptLink(numero, revoke),
    onSuccess: (data) =>
      queryClient.setQueryData(['receipt', numero], (old: Receipt) => ({ ...old, ...data })),
  })
  if (receipt.isPending) return <Spinner />
  const r = receipt.data
  if (!r) return <Alert tone="danger">No se encontró el recibo.</Alert>
  const url = r.receipt_path ? `${window.location.origin}${r.receipt_path}` : null
  const message = `Hola ${r.customer.name.split(' ')[0]}, este es tu recibo ${r.number} por ${rd(
    r.amount,
  )} del préstamo ${r.loan.number}. ${url ?? ''}`
  return (
    <>
      {nuevo && r.status === 'posted' ? (
        // The payment just went through: a check that pops and the amount (decision 115).
        <section
          role="status"
          className="relative flex items-center gap-4 overflow-hidden rounded-card bg-brand-950 px-5 py-4 text-on-forest shadow-sm"
        >
          <Texture tone="forest" />
          <span className="relative grid size-11 shrink-0 animate-pop place-items-center rounded-full bg-forest-accent text-on-forest-accent">
            <CheckIcon className="size-5 shrink-0" />
          </span>
          <div className="relative min-w-0">
            <div className="font-display text-[19px] font-bold">Pago registrado</div>
            <div className="text-[13px] text-brand-200">
              {rd(r.amount)} de {r.customer.name} · recibo {r.number}
            </div>
          </div>
        </section>
      ) : null}
      <PageHeader
        back={
          <Link
            to="/prestamos/$numero"
            params={{ numero: r.loan.number }}
            className="hover:underline"
          >
            ← Préstamo {r.loan.number}
          </Link>
        }
        documentTitle={`Recibo ${r.number}`}
        title={
          <span className="flex flex-wrap items-center gap-2">
            Recibo <span className="tabular-nums">{r.number}</span>
            {r.status === 'reversed' ? (
              <Badge tone="danger">Reversado</Badge>
            ) : (
              <Badge tone="success">Registrado</Badge>
            )}
          </span>
        }
        subtitle={`${r.customer.name} · ${rd(r.amount)} · ${r.method_label}`}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setPaper('letter')
                setTimeout(() => printArea('letter'), 50)
              }}
            >
              Imprimir hoja
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setPaper('thermal')
                setTimeout(() => printArea('thermal'), 50)
              }}
            >
              Imprimir térmico
            </Button>
            {url ? (
              <a
                href={whatsappLink(r.customer.phone, message)}
                target="_blank"
                rel="noopener"
                className={buttonClass()}
              >
                Enviar por WhatsApp
              </a>
            ) : null}
          </>
        }
      />

      {r.pending_reversal ? (
        <Alert tone="warning">
          {r.pending_reversal.kind_label} pedido por {r.pending_reversal.requested_by_name}: espera
          la autorización de un supervisor.
        </Alert>
      ) : null}
      {r.reversed ? (
        <Alert tone="warning">
          Reversado el {day(r.reversed.on)} ({r.reversed.reason}) · autorizó{' '}
          {r.reversal_authorized_by}.{' '}
          {r.reversed.replacement ? (
            <Link
              to="/recibos/$numero"
              params={{ numero: r.reversed.replacement }}
              className="font-semibold underline"
            >
              Ver el recibo correcto {r.reversed.replacement}
            </Link>
          ) : null}
        </Alert>
      ) : null}

      {/* The receipt as it prints; at its side, how it travels and how it is
          undone (decision 116). */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-3">
          <Segmented
            label="Vista"
            value={paper}
            onChange={setPaper}
            options={[
              { value: 'letter', label: 'Hoja' },
              { value: 'thermal', label: 'Térmico 80 mm' },
            ]}
          />
          <div id="print-area">
            <ReceiptView receipt={r} thermal={paper === 'thermal'} />
          </div>
        </div>

        <div className="space-y-4 xl:sticky xl:top-20">
          <Card className="space-y-3 text-[13px]">
            <div>
              <h2 className="text-[15px] font-semibold">Enlace del recibo</h2>
              <p className="mt-0.5 text-[12.5px] text-muted">
                Solo muestra este recibo, con la cédula enmascarada. Si se compartió por error,
                revócalo y genera otro.
              </p>
            </div>
            {url ? (
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={url}
                  onFocus={(e) => e.target.select()}
                  aria-label="Enlace"
                  className="min-w-0 flex-1"
                />
                <Button
                  variant="secondary"
                  onClick={() => link.mutate(true)}
                  disabled={link.isPending}
                >
                  Revocar
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2.5">
                <span className="text-muted">El enlace está revocado.</span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => link.mutate(false)}
                  disabled={link.isPending}
                >
                  Generar uno nuevo
                </Button>
              </div>
            )}
            <dl className="divide-y divide-edge border-t border-edge text-[12.5px]">
              <div className="flex justify-between gap-3 py-2">
                <dt className="text-muted">Cobró</dt>
                <dd className="font-medium">{r.collected_by}</dd>
              </div>
              {r.cash_session ? (
                <div className="flex justify-between gap-3 py-2">
                  <dt className="text-muted">Caja</dt>
                  <dd className="font-medium tabular-nums">{r.cash_session}</dd>
                </div>
              ) : null}
              {r.route || r.off_route ? (
                <div className="flex justify-between gap-3 py-2">
                  <dt className="text-muted">Origen</dt>
                  <dd className="font-medium">
                    {r.off_route ? 'Fuera de la ruta del día' : 'Cobro en ruta'}
                  </dd>
                </div>
              ) : null}
            </dl>
          </Card>

          {r.can_request_reversal && !r.pending_reversal && hasRole(me, ACCESS.requestReversal) ? (
            <Card className="space-y-3 text-[13px]">
              <div>
                <h2 className="text-[15px] font-semibold">¿Hubo un error?</h2>
                <p className="mt-0.5 text-[12.5px] text-muted">
                  Nada se borra: se reversa con un asiento inverso o se corrige el monto, y lo
                  autoriza otra persona.
                </p>
              </div>
              <Button variant="danger" className="w-full" onClick={() => setReversing(true)}>
                Reversar o corregir
              </Button>
            </Card>
          ) : null}
        </div>
      </div>
      {reversing ? <ReversalDialog receipt={r} onClose={() => setReversing(false)} /> : null}
    </>
  )
}
