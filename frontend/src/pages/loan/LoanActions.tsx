import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { ApiError } from '../../api/client'
import { listReasons } from '../../api/origination'
import type { Me } from '../../api/accounts'
import { listProfessionals, openCase } from '../../api/legal'
import {
  changeLoanDates,
  getPayoffQuote,
  issuePayoffLetter,
  payoffLetterUrl,
  previewRestructure,
  requestRestructure,
  type RestructureConditions,
  writeOffLoan,
} from '../../api/payments'
import { assignCollector, listCollectors } from '../../api/routes'
import { Modal } from '../../components/Modal'
import {
  Alert,
  Button,
  Field,
  Input,
  PercentInput,
  Select,
  Spinner,
  Textarea,
} from '../../components/ui'
import { day, errorMessage, FREQUENCY_TEXT, rd, todayISO, plural } from '../../lib/format'
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

/** F11 · Reestructuración (decision 093): new conditions over what is owed,
 * shown before asking; someone who could approve the credit decides. */
export function RestructureDialog({
  number,
  current,
  onClose,
}: {
  number: string
  current: { installments: number; frequency: string; rate: string }
  onClose: () => void
}) {
  const [form, setForm] = useState<RestructureConditions>({
    installments: current.installments,
    frequency: current.frequency,
    rate: current.rate,
    first_due: null,
    waive_late_fee: false,
  })
  const [note, setNote] = useState('')
  const set = (patch: Partial<RestructureConditions>) => {
    setForm({ ...form, ...patch })
    preview.reset()
  }
  const preview = useMutation({
    meta: { inlineError: true },
    mutationFn: () => previewRestructure(number, form),
  })
  const ask = useMutation({
    meta: { inlineError: true },
    mutationFn: () => requestRestructure(number, { ...form, note }),
    onSuccess: () => {
      notify('Reestructuración pedida: la autoriza el supervisor o el gerente.', 'success')
      onClose()
    },
  })
  const error = [preview.error, ask.error].find((e) => e instanceof ApiError)
  const plan = preview.data
  return (
    <Frame title="Reestructurar el préstamo" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cuotas nuevas">
          <Input
            inputMode="numeric"
            value={String(form.installments)}
            onChange={(e) => set({ installments: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label="Frecuencia">
          <Select value={form.frequency} onChange={(e) => set({ frequency: e.target.value })}>
            {Object.entries(FREQUENCY_TEXT).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tasa por período">
          <PercentInput value={form.rate} onChange={(value) => set({ rate: value })} />
        </Field>
        <Field label="Primera cuota (opcional)">
          <Input
            type="date"
            min={todayISO(1)}
            value={form.first_due ?? ''}
            onChange={(e) => set({ first_due: e.target.value || null })}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.waive_late_fee}
          onChange={(e) => set({ waive_late_fee: e.target.checked })}
        />
        Condonar la mora acumulada (si no, se reparte en las cuotas nuevas)
      </label>
      <Button variant="secondary" disabled={preview.isPending} onClick={() => preview.mutate()}>
        Ver el calendario nuevo
      </Button>
      {plan ? (
        <div className="space-y-2 rounded-lg border border-edge bg-surface-2 p-3 text-sm">
          <div>
            Capital {rd(plan.principal)} · interés vencido {rd(plan.carried_interest)} · mora{' '}
            {rd(plan.carried_late_fee)}
            {Number(plan.waived_late_fee) ? ` (condona ${rd(plan.waived_late_fee)})` : ''}
          </div>
          <div className="max-h-48 overflow-y-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-1">#</th>
                  <th className="py-1">Vence</th>
                  <th className="py-1 text-right">Cuota</th>
                </tr>
              </thead>
              <tbody>
                {plan.installments.map((row) => (
                  <tr key={row.number}>
                    <td className="py-0.5">{row.number}</td>
                    <td className="py-0.5">{day(row.due_date)}</td>
                    <td className="py-0.5 text-right tabular-nums">{rd(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="font-semibold">Total a pagar {rd(plan.total)}</div>
        </div>
      ) : null}
      <Field label="Motivo">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </Field>
      {error instanceof ApiError ? <Alert tone="danger">{errorMessage(error.data)}</Alert> : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button disabled={!plan || !note.trim() || ask.isPending} onClick={() => ask.mutate()}>
          Pedir la aprobación
        </Button>
      </div>
    </Frame>
  )
}

/** F13 (decision 094): the manager writes the loan off with a reason and his
 * second factor; collection goes on and what comes in is recovery. */
export function WriteOffDialog({
  number,
  me,
  daysPastDue,
  onClose,
}: {
  number: string
  me: Me
  daysPastDue: number
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [code, setCode] = useState('')
  const reasons = useQuery({
    queryKey: ['reasons', 'write_off'],
    queryFn: () => listReasons('write_off'),
  })
  const run = useMutation({
    meta: { inlineError: true },
    mutationFn: () => writeOffLoan(number, { reason, note, second_factor: code }),
    onSuccess: () => {
      notify('Préstamo castigado: lo que se cobre de ahora en adelante es recuperación.', 'success')
      onClose()
    },
  })
  return (
    <Frame title="Castigar el préstamo" onClose={onClose}>
      <p className="text-sm text-muted">
        Su capital sale de la cartera como gasto por castigo. La cobranza sigue y lo que se cobre
        cuenta como recuperación. {plural(daysPastDue, 'día')} de atraso.
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
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </Field>
      <Field
        label={
          me.mfa_enabled
            ? 'Código de tu app autenticadora (o un código de respaldo)'
            : 'Tu contraseña, para confirmar que eres tú'
        }
      >
        <Input
          type={me.mfa_enabled ? 'text' : 'password'}
          inputMode={me.mfa_enabled ? 'numeric' : undefined}
          autoComplete={me.mfa_enabled ? 'one-time-code' : 'current-password'}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </Field>
      {run.error instanceof ApiError ? (
        <Alert tone="danger">{errorMessage(run.error.data)}</Alert>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          variant="danger"
          disabled={!reason || !note.trim() || !code.trim() || run.isPending}
          onClick={() => run.mutate()}
        >
          Castigar
        </Button>
      </div>
    </Frame>
  )
}

/** F9 (decision 095): the manager sends the loan to the legal path with its
 * lawyer (the bailiff and the notary can come later). */
export function LegalCaseDialog({
  number,
  onOpened,
  onClose,
}: {
  number: string
  onOpened: (id: string) => void
  onClose: () => void
}) {
  const people = useQuery({ queryKey: ['legal-professionals'], queryFn: listProfessionals })
  const [lawyer, setLawyer] = useState('')
  const [note, setNote] = useState('')
  const run = useMutation({
    meta: { inlineError: true },
    mutationFn: () => openCase({ loan: number, lawyer, note }),
    onSuccess: (legalCase) => onOpened(legalCase.id),
  })
  const lawyers = (people.data ?? []).filter((p) => p.kind === 'lawyer' && p.is_active)
  return (
    <Frame title="Enviar a la vía legal" onClose={onClose}>
      {people.data && !lawyers.length ? (
        <Alert tone="warning">Primero agrega un abogado en Ajustes → Profesionales legales.</Alert>
      ) : null}
      <Field label="Abogado">
        <Select value={lawyer} onChange={(e) => setLawyer(e.target.value)}>
          <option value="">Elegir…</option>
          {lawyers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Nota">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </Field>
      {run.error instanceof ApiError ? (
        <Alert tone="danger">{errorMessage(run.error.data)}</Alert>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button disabled={!lawyer || run.isPending} onClick={() => run.mutate()}>
          Abrir el caso
        </Button>
      </div>
    </Frame>
  )
}
