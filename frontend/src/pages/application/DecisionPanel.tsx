import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { ApiError } from '../../api/client'
import {
  approveApplication,
  listReasons,
  rejectApplication,
  returnApplication,
  type Application,
} from '../../api/origination'
import { Alert, Button, Card, Field, Input, Select, Textarea } from '../../components/ui'
import { errorMessage, FREQUENCY_TEXT } from '../../lib/format'

type Mode = 'approve' | 'adjust' | 'return' | 'reject'

/** P28: approve, adjust and approve, return or reject — never one's own. */
export function DecisionPanel({
  application,
  frequencies,
  onDone,
}: {
  application: Application
  frequencies: string[]
  onDone: () => void
}) {
  const [mode, setMode] = useState<Mode>('approve')
  const [note, setNote] = useState('')
  const [amount, setAmount] = useState(application.amount)
  const [installments, setInstallments] = useState(String(application.installments))
  const [frequency, setFrequency] = useState(application.frequency)
  const [rate, setRate] = useState(application.rate)
  const [reason, setReason] = useState('')
  const reasons = useQuery({
    queryKey: ['reasons', 'rejection'],
    queryFn: () => listReasons('rejection'),
    enabled: mode === 'reject',
  })

  const decide = useMutation({
    mutationFn: () => {
      if (mode === 'approve') return approveApplication(application.id, { note })
      if (mode === 'adjust')
        return approveApplication(application.id, {
          amount,
          installments: Number(installments),
          frequency,
          rate,
          note,
        })
      if (mode === 'return') return returnApplication(application.id, note)
      return rejectApplication(application.id, reason, note)
    },
    onSuccess: onDone,
  })
  const failure = decide.error instanceof ApiError ? (decide.error.data as Record<string, unknown>) : null
  const issues = (failure?.issues as { message: string }[] | undefined) ?? []

  const LABELS: Record<Mode, string> = {
    approve: 'Aprobar',
    adjust: 'Ajustar y aprobar',
    return: 'Devolver',
    reject: 'Rechazar',
  }

  return (
    <Card className="space-y-3 border-brand-700/40">
      <h2 className="text-base font-semibold">Decisión</h2>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(LABELS) as Mode[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={`rounded-full border px-3 py-1 text-sm ${
              mode === key
                ? 'border-brand-700 bg-brand-100 font-semibold text-brand-800'
                : 'border-edge text-muted hover:text-ink'
            }`}
          >
            {LABELS[key]}
          </button>
        ))}
      </div>

      {mode === 'adjust' ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Monto aprobado">
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Cuotas">
            <Input
              inputMode="numeric"
              value={installments}
              onChange={(e) => setInstallments(e.target.value)}
            />
          </Field>
          <Field label="Frecuencia">
            <Select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              {frequencies.map((f) => (
                <option key={f} value={f}>
                  {FREQUENCY_TEXT[f] ?? f}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tasa">
            <Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
          </Field>
        </div>
      ) : null}

      {mode === 'reject' ? (
        <Field label="Motivo (catálogo)">
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Elegir…</option>
            {reasons.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.text}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <Field
        label={
          mode === 'return'
            ? 'Qué debe corregir el oficial'
            : mode === 'reject'
              ? 'Nota del rechazo'
              : 'Nota (opcional; cada ajuste queda registrado)'
        }
      >
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      {failure ? (
        <Alert tone="danger">
          {errorMessage(failure)}
          {issues.length ? (
            <ul className="mt-1 list-disc pl-5">
              {issues.map((issue) => (
                <li key={issue.message}>{issue.message}</li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}

      <div className="flex justify-end">
        <Button
          onClick={() => decide.mutate()}
          disabled={
            decide.isPending ||
            ((mode === 'return' || mode === 'reject') && !note.trim()) ||
            (mode === 'reject' && !reason)
          }
          className={mode === 'reject' ? '!bg-danger-600 hover:!bg-danger-600/90' : ''}
        >
          {decide.isPending ? 'Guardando…' : LABELS[mode]}
        </Button>
      </div>
    </Card>
  )
}
