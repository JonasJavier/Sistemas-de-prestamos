import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { ApiError } from '../api/client'
import {
  ACTION_KINDS,
  ACTION_RESULTS,
  type ActionKind,
  type ActionResult,
  recordAction,
} from '../api/collections'
import { useRefreshCollections } from '../lib/collections'
import { errorMessage, todayISO } from '../lib/format'
import { notify } from '../lib/toast'
import { Modal } from './Modal'
import { Alert, Button, Field, Input, Textarea } from './ui'
import { DateInput } from './DateInput'

/** The longest a promise can wait (decision 076); the server enforces it. */
const PROMISE_MAX_DAYS = 30
const FOLLOW_UP_MAX_DAYS = 60

async function currentPosition(): Promise<GeolocationPosition | null> {
  if (!('geolocation' in navigator)) return null
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 60_000,
    })
  })
}

/** P42 · Registrar gestión: type, result and note; a promise with its date
 * and amount; optionally the next follow-up. A sheet on the phone. */
export function ActionDialog({
  loanNumber,
  customerName,
  onClose,
  defaultKind = 'call',
  suggestedAmount,
  sheet = false,
  withLocation = false,
}: {
  loanNumber: string
  customerName: string
  onClose: () => void
  defaultKind?: ActionKind
  /** Prefills the promised amount (e.g. what is overdue). */
  suggestedAmount?: string
  /** Bottom sheet with big buttons, for the collector's phone. */
  sheet?: boolean
  /** Saves where the action happened (the route, decision 031). */
  withLocation?: boolean
}) {
  const refresh = useRefreshCollections()
  const [kind, setKind] = useState<ActionKind>(defaultKind)
  const [result, setResult] = useState<ActionResult | ''>('')
  const [note, setNote] = useState('')
  const [promiseOn, setPromiseOn] = useState(() => todayISO(1))
  const [promiseAmount, setPromiseAmount] = useState(suggestedAmount ?? '')
  const [followUp, setFollowUp] = useState(false)
  const [followUpOn, setFollowUpOn] = useState(() => todayISO(2))
  const promised = result === 'promised'

  const save = useMutation({
    meta: { inlineError: true },
    mutationFn: async () => {
      const position = withLocation ? await currentPosition() : null
      return recordAction(loanNumber, {
        kind,
        result: result as ActionResult,
        note,
        promise_on: promised ? promiseOn : null,
        promise_amount: promised ? promiseAmount.replace(/,/g, '') : null,
        follow_up_on: followUp ? followUpOn : null,
        latitude: position?.coords.latitude.toFixed(6) ?? null,
        longitude: position?.coords.longitude.toFixed(6) ?? null,
      })
    },
    onSuccess: () => {
      notify(promised ? 'Promesa registrada.' : 'Gestión registrada.', 'success')
      refresh()
      onClose()
    },
  })

  const big = sheet ? 'h-12' : 'h-10'
  const choice = (selected: boolean) =>
    `${big} rounded-lg border px-2 text-sm font-medium ${
      selected ? 'border-brand-700 bg-brand-700 text-on-brand' : 'border-edge hover:bg-surface-2'
    }`
  const ready =
    Boolean(result) &&
    (!promised || (promiseOn && Number(promiseAmount.replace(/,/g, '')) > 0)) &&
    (result !== 'other' || note.trim()) &&
    (!followUp || followUpOn)

  return (
    <Modal onClose={onClose} labelledBy="action-title" align={sheet ? 'bottom' : 'center'}>
      <div
        className={`max-h-[92vh] w-full space-y-3 overflow-y-auto bg-surface p-5 shadow-xl ${
          sheet ? 'rounded-t-2xl pb-8' : 'max-w-lg rounded-xl'
        }`}
      >
        <div>
          <h2 id="action-title" className="text-lg font-semibold">
            Gestión · {customerName}
          </h2>
          <p className="text-[12.5px] text-muted">Préstamo {loanNumber}</p>
        </div>

        <div role="radiogroup" aria-label="Tipo de gestión" className="grid grid-cols-3 gap-2">
          {ACTION_KINDS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={kind === option.value}
              onClick={() => setKind(option.value)}
              className={choice(kind === option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div role="radiogroup" aria-label="Resultado" className="grid grid-cols-2 gap-2">
          {ACTION_RESULTS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={result === option.value}
              onClick={() => setResult(option.value)}
              className={choice(result === option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {promised ? (
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-surface-2 p-3">
            <Field label="Paga el día">
              <DateInput
                value={promiseOn}
                min={todayISO()}
                max={todayISO(PROMISE_MAX_DAYS)}
                onChange={setPromiseOn}
              />
            </Field>
            <Field label="Monto (RD$)">
              <Input
                inputMode="decimal"
                value={promiseAmount}
                onChange={(e) => setPromiseAmount(e.target.value)}
              />
            </Field>
            <p className="col-span-2 text-[12px] text-muted">
              Si ese día no ha pagado al menos ese monto, la promesa pasa sola a incumplida y vuelve
              a tu agenda.
            </p>
          </div>
        ) : null}

        <Field label={result === 'other' ? 'Nota (obligatoria)' : 'Nota'}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={followUp}
            onChange={(e) => setFollowUp(e.target.checked)}
            className="h-4 w-4 accent-brand-700"
          />
          Programar un seguimiento
        </label>
        {followUp ? (
          <Field label="Volver a gestionar el día">
            <DateInput
              value={followUpOn}
              min={todayISO()}
              max={todayISO(FOLLOW_UP_MAX_DAYS)}
              onChange={setFollowUpOn}
            />
          </Field>
        ) : null}

        {save.error instanceof ApiError ? (
          <Alert tone="danger">{errorMessage(save.error.data)}</Alert>
        ) : null}
        <div className={sheet ? '' : 'flex justify-end gap-2'}>
          {sheet ? null : (
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
          )}
          <Button
            className={sheet ? 'w-full !h-12' : ''}
            onClick={() => save.mutate()}
            disabled={!ready || save.isPending}
          >
            {promised ? 'Guardar promesa' : 'Guardar gestión'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
