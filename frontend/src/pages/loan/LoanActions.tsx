import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { ApiError } from '../../api/client'
import { listReasons } from '../../api/origination'
import {
  changeLoanDates,
  getPayoffQuote,
  issuePayoffLetter,
  payoffLetterUrl,
} from '../../api/payments'
import { assignCollector, listCollectors } from '../../api/routes'
import { Modal } from '../../components/Modal'
import { Alert, Button, Field, Input, Select, Spinner, Textarea } from '../../components/ui'
import { day, errorMessage, rd, todayISO } from '../../lib/format'
import { notify } from '../../lib/toast'

function Frame({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <Modal onClose={onClose} labelledBy="loan-action-title">
      <div className="max-h-[90vh] w-full max-w-md space-y-3 overflow-y-auto rounded-xl bg-surface p-5 shadow-xl">
        <h2 id="loan-action-title" className="text-lg font-semibold">
          {title}
        </h2>
        {children}
      </div>
    </Modal>
  )
}

/** P36: the payoff on a date, its validity, and the PDF letter. */
export function PayoffLetterDialog({ number, onClose }: { number: string; onClose: () => void }) {
  // Doc 03 - 9: a letter is computed for today or up to 30 days ahead.
  const [[today, maxISO]] = useState(() => [todayISO(), todayISO(30)])
  const [date, setDate] = useState(today)
  const quote = useQuery({
    queryKey: ['payoff-quote', number, date],
    queryFn: () => getPayoffQuote(number, date),
    retry: false,
  })
  const issue = useMutation({
    meta: { inlineError: true },
    mutationFn: () => issuePayoffLetter(number, date),
    onSuccess: (letter) => {
      window.open(payoffLetterUrl(number, letter.id), '_blank', 'noopener')
      notify(`Carta de saldo ${letter.number} emitida.`, 'success')
      onClose()
    },
  })
  const q = quote.data
  return (
    <Frame title="Carta de saldo" onClose={onClose}>
      <Field label="Fecha de cálculo">
        <Input
          type="date"
          value={date}
          min={today}
          max={maxISO}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>
      {quote.isPending ? (
        <Spinner />
      ) : quote.error instanceof ApiError ? (
        <Alert tone="danger">{errorMessage(quote.error.data)}</Alert>
      ) : q ? (
        <dl className="grid grid-cols-2 gap-1 text-sm">
          <dt className="text-muted">Capital</dt>
          <dd className="text-right tabular-nums">{rd(q.principal)}</dd>
          {Number(q.overdue_interest) ? (
            <>
              <dt className="text-muted">Interés vencido</dt>
              <dd className="text-right tabular-nums">{rd(q.overdue_interest)}</dd>
            </>
          ) : null}
          <dt className="text-muted">Interés del período</dt>
          <dd className="text-right tabular-nums">{rd(q.current_interest)}</dd>
          {Number(q.late_fees) ? (
            <>
              <dt className="text-muted">Mora a esa fecha</dt>
              <dd className="text-right tabular-nums">{rd(q.late_fees)}</dd>
            </>
          ) : null}
          <dt className="font-semibold">Saldo para saldar</dt>
          <dd className="text-right text-lg font-bold tabular-nums">{rd(q.total)}</dd>
          <dt className="text-muted">Interés condonado</dt>
          <dd className="text-right tabular-nums text-success-600">{rd(q.interest_waived)}</dd>
          <dt className="text-muted">Válida hasta</dt>
          <dd className="text-right">{day(q.valid_until)}</dd>
        </dl>
      ) : null}
      {issue.error instanceof ApiError ? (
        <Alert tone="danger">{errorMessage(issue.error.data)}</Alert>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
        <Button onClick={() => issue.mutate()} disabled={!q || issue.isPending}>
          Generar PDF
        </Button>
      </div>
    </Frame>
  )
}

/** Doc 03 - 4: a new calendar version with the installments moved. */
export function DateChangeDialog({ number, onClose }: { number: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const reasons = useQuery({
    queryKey: ['reasons', 'date_change'],
    queryFn: () => listReasons('date_change'),
  })
  const save = useMutation({
    meta: { inlineError: true },
    mutationFn: () => changeLoanDates(number, { first_due: date, reason, note }),
    onSuccess: () => {
      notify('Fechas cambiadas: el calendario tiene una versión nueva.', 'success')
      void queryClient.invalidateQueries({ queryKey: ['loan', number] })
      onClose()
    },
  })
  return (
    <Frame title="Cambiar fechas" onClose={onClose}>
      <p className="text-sm text-muted">
        Mueve las cuotas que no tienen pagos: la próxima vence en la fecha que elijas y las demás
        siguen la frecuencia del préstamo. Montos e interés no cambian.
      </p>
      <Field label="Nueva fecha de la próxima cuota">
        <Input
          type="date"
          value={date}
          min={todayISO()}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>
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
      {save.error instanceof ApiError ? (
        <Alert tone="danger">{errorMessage(save.error.data)}</Alert>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          onClick={() => save.mutate()}
          disabled={!date || !reason || !note.trim() || save.isPending}
        >
          Cambiar fechas
        </Button>
      </div>
    </Frame>
  )
}

export function CollectorDialog({
  number,
  current,
  onClose,
}: {
  number: string
  current: string | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const collectors = useQuery({ queryKey: ['collectors'], queryFn: listCollectors })
  const [target, setTarget] = useState(current ?? '')
  const [note, setNote] = useState('')
  const save = useMutation({
    meta: { inlineError: true },
    mutationFn: () => assignCollector({ loans: [number], collector: target || null, note }),
    onSuccess: () => {
      notify('Cobrador actualizado.', 'success')
      void queryClient.invalidateQueries({ queryKey: ['loan', number] })
      onClose()
    },
  })
  return (
    <Frame title="Cambiar cobrador" onClose={onClose}>
      <Field label="Cobrador">
        <Select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Sin cobrador</option>
          {collectors.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Motivo del cambio">
        <Input value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {save.error instanceof ApiError ? (
        <Alert tone="danger">{errorMessage(save.error.data)}</Alert>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending || target === (current ?? '')}
        >
          Guardar
        </Button>
      </div>
    </Frame>
  )
}
