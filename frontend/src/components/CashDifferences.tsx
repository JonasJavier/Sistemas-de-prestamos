import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { Me } from '../api/accounts'
import { type CashDifference, differenceAction, listDifferences } from '../api/cash'
import { ApiError } from '../api/client'
import { day, errorMessage, rd } from '../lib/format'
import { notify } from '../lib/toast'
import { usePrompt } from './Dialog'
import { Alert, Badge, Button, Card, EmptyState, Spinner } from './ui'

type Verb = 'reponer' | 'perdida' | 'aplicar' | 'ingreso'

const PROMPTS: Record<Verb, { title: string; label: string; amount: boolean; confirm: string }> = {
  reponer: {
    title: 'Reponer el faltante',
    label: 'Monto que entra a tu caja',
    amount: true,
    confirm: 'Siguiente',
  },
  perdida: {
    title: 'Asumir como pérdida',
    label: 'Por qué la empresa asume el faltante',
    amount: false,
    confirm: 'Asumir',
  },
  aplicar: {
    title: 'Aplicar el sobrante',
    label: 'A quién se devolvió o qué pago cubre',
    amount: false,
    confirm: 'Aplicar desde mi caja',
  },
  ingreso: {
    title: 'Pasar a otros ingresos',
    label: 'Nota (opcional)',
    amount: false,
    confirm: 'Pasar a ingresos',
  },
}

/** Decision 075: shortages owed by a person and overages awaiting a claim. */
export function CashDifferences({ me, mineOnly = false }: { me: Me; mineOnly?: boolean }) {
  const queryClient = useQueryClient()
  const [dialog, ask] = usePrompt()
  const query = useQuery({ queryKey: ['cash-differences'], queryFn: () => listDifferences() })
  const act = useMutation({
    meta: { inlineError: true },
    mutationFn: async ({ difference, verb }: { difference: CashDifference; verb: Verb }) => {
      const prompt = PROMPTS[verb]
      let amount: string | null = null
      if (prompt.amount) {
        const value = await ask({
          title: prompt.title,
          label: prompt.label,
          initial: difference.outstanding,
          required: true,
          confirmText: prompt.confirm,
        })
        if (value === null) return null
        amount = value.replace(/,/g, '')
      }
      const note = await ask({
        title: prompt.title,
        label: prompt.amount ? 'Nota (opcional)' : prompt.label,
        type: 'textarea',
        required: verb === 'perdida' || verb === 'aplicar',
        confirmText: prompt.amount ? 'Registrar' : prompt.confirm,
        danger: verb === 'perdida',
      })
      if (note === null) return null
      return differenceAction(difference.id, verb, { amount, note })
    },
    onSuccess: (result) => {
      if (!result) return
      notify(`${result.kind_label}: ${result.status_label.toLowerCase()}.`, 'success')
      for (const key of [['cash-differences'], ['my-cash'], ['me']])
        void queryClient.invalidateQueries({ queryKey: key })
    },
  })
  if (query.isPending) return <Spinner />
  const rows = (query.data ?? []).filter((d) => !mineOnly || d.is_mine)
  if (mineOnly && !rows.length) return null
  const manager = me.roles.includes('Gerente')
  const supervisor = manager || me.roles.includes('Supervisor')
  const drawer = supervisor || me.roles.includes('Cajero')
  return (
    <Card className="space-y-2">
      {dialog}
      <div>
        <h2 className="text-base font-semibold">
          {mineOnly ? 'Mis diferencias de caja' : 'Diferencias de caja por resolver'}
        </h2>
        <p className="text-[12.5px] text-muted">
          Un faltante lo repone quien lo tuvo, en efectivo y en una caja abierta (nunca por nómina),
          o el gerente lo asume como pérdida. Un sobrante espera 30 días a su dueño y luego pasa
          solo a otros ingresos.
        </p>
      </div>
      {rows.length ? (
        <ul className="divide-y divide-edge text-sm">
          {rows.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={d.kind === 'shortage' ? 'danger' : 'warning'}>{d.kind_label}</Badge>
                  <span className="font-semibold tabular-nums">{rd(d.outstanding)}</span>
                  {d.resolved !== '0.00' ? (
                    <span className="text-muted">de {rd(d.amount)}</span>
                  ) : null}
                </div>
                <div className="text-[12.5px] text-muted">
                  {d.person_name} · {d.source} · {day(d.occurred_on)}
                  {d.claim_until ? ` · pasa a ingresos el ${day(d.claim_until)}` : ''}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {d.kind === 'shortage' && drawer ? (
                  <Button
                    variant="secondary"
                    className="!h-8"
                    onClick={() => act.mutate({ difference: d, verb: 'reponer' })}
                  >
                    Reponer
                  </Button>
                ) : null}
                {d.kind === 'shortage' && manager ? (
                  <Button
                    variant="secondary"
                    className="!h-8"
                    onClick={() => act.mutate({ difference: d, verb: 'perdida' })}
                  >
                    Asumir pérdida
                  </Button>
                ) : null}
                {d.kind === 'overage' && (supervisor || (drawer && d.is_mine)) ? (
                  <Button
                    variant="secondary"
                    className="!h-8"
                    onClick={() => act.mutate({ difference: d, verb: 'aplicar' })}
                  >
                    Aplicar
                  </Button>
                ) : null}
                {d.kind === 'overage' && supervisor ? (
                  <Button
                    variant="secondary"
                    className="!h-8"
                    onClick={() => act.mutate({ difference: d, verb: 'ingreso' })}
                  >
                    A ingresos
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>No hay diferencias por resolver.</EmptyState>
      )}
      {act.error instanceof ApiError ? (
        <Alert tone="danger">{errorMessage(act.error.data)}</Alert>
      ) : null}
    </Card>
  )
}
