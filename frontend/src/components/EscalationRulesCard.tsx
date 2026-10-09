import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { ApiError } from '../api/client'
import { type EscalationRule, listEscalationRules, updateEscalationRules } from '../api/collections'
import { errorMessage } from '../lib/format'
import { notify } from '../lib/toast'
import { Alert, Button, Card, Input, Spinner } from './ui'

/** F8 step 5 (decision 077): past how many days each step fires. */
export function EscalationRulesCard() {
  const rules = useQuery({ queryKey: ['escalation-rules'], queryFn: listEscalationRules })
  return (
    <Card className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">Escalamiento de la cobranza</h2>
        <p className="text-[12.5px] text-muted">
          Cada noche, un préstamo que pasa estos días de atraso aparece en la agenda de quien debe
          actuar, una sola vez por cada atraso.
        </p>
      </div>
      {rules.data ? <RulesForm key={JSON.stringify(rules.data)} rules={rules.data} /> : <Spinner />}
    </Card>
  )
}

function RulesForm({ rules }: { rules: EscalationRule[] }) {
  const queryClient = useQueryClient()
  const [rows, setRows] = useState(rules)
  const save = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      updateEscalationRules(
        rows.map((r) => ({ id: r.id, min_days: Number(r.min_days), is_active: r.is_active })),
      ),
    onSuccess: (next) => {
      notify('Reglas de escalamiento guardadas.', 'success')
      queryClient.setQueryData(['escalation-rules'], next)
    },
  })
  const set = (id: string, change: Partial<EscalationRule>) =>
    setRows((current) => current.map((r) => (r.id === id ? { ...r, ...change } : r)))
  return (
    <>
      <ul className="divide-y divide-edge">
        {rows.map((rule) => (
          <li key={rule.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={rule.is_active}
                onChange={(e) => set(rule.id, { is_active: e.target.checked })}
                className="h-4 w-4 accent-brand-700"
              />
              <span>
                <span className="font-medium">{rule.action_label}</span>
                <span className="block text-[12px] text-muted">a cargo de: {rule.role}</span>
              </span>
            </label>
            <span className="flex items-center gap-2 text-sm">
              más de
              <Input
                aria-label={`Días para ${rule.action_label}`}
                inputMode="numeric"
                className="!w-20 text-right"
                value={String(rule.min_days - 1)}
                onChange={(e) =>
                  set(rule.id, { min_days: Number(e.target.value.replace(/\D/g, '') || 0) + 1 })
                }
              />
              días
            </span>
          </li>
        ))}
      </ul>
      {save.error instanceof ApiError ? (
        <Alert tone="danger">{errorMessage(save.error.data)}</Alert>
      ) : null}
      <div className="flex justify-end">
        <Button variant="secondary" onClick={() => save.mutate()} disabled={save.isPending}>
          Guardar reglas
        </Button>
      </div>
    </>
  )
}
