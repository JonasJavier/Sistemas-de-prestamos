import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import {
  cancelPromise,
  completeTask,
  createFollowUp,
  getCustomerTimeline,
  getLoanTimeline,
  type Task,
} from '../api/collections'
import { day, moment, rd, todayISO } from '../lib/format'
import { notify } from '../lib/toast'
import { useRefreshCollections } from '../lib/collections'
import { ActionDialog } from './ActionDialog'
import { usePrompt } from './Dialog'
import { Badge, Button, Card, Spinner } from './ui'

const PROMISE_TONE: Record<string, string> = {
  pending: 'info',
  kept: 'success',
  broken: 'danger',
  cancelled: 'neutral',
}

/** The collection history of a loan or of a customer (F8 step 3): the
 * pending promise, the follow-ups, every action and every promise. */
export function CollectionTimeline({
  loan,
  customerId,
  customerName,
  canManage,
  suggestedAmount,
}: {
  /** A loan's history (with the buttons to act on it)… */
  loan?: string
  /** …or the customer's, across all his loans (read only). */
  customerId?: string
  customerName: string
  canManage: boolean
  suggestedAmount?: string
}) {
  const refresh = useRefreshCollections()
  const [dialog, ask] = usePrompt()
  const [acting, setActing] = useState(false)
  const timeline = useQuery({
    queryKey: loan ? ['loan-timeline', loan] : ['customer-timeline', customerId],
    queryFn: () => (loan ? getLoanTimeline(loan) : getCustomerTimeline(customerId!)),
  })
  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const note = await ask({
        title: 'Cancelar la promesa',
        label: 'Motivo',
        type: 'textarea',
        required: true,
        confirmText: 'Cancelar promesa',
        danger: true,
      })
      return note === null ? null : cancelPromise(id, note)
    },
    onSuccess: (result) => {
      if (!result) return
      notify('Promesa cancelada.', 'success')
      refresh()
    },
  })
  const followUp = useMutation({
    mutationFn: async () => {
      const due = await ask({
        title: 'Programar un seguimiento',
        label: 'Fecha',
        type: 'date',
        initial: todayISO(1),
        required: true,
        confirmText: 'Siguiente',
      })
      if (!due) return null
      const note = await ask({
        title: 'Programar un seguimiento',
        label: 'Qué hay que hacer',
        type: 'textarea',
        required: true,
        confirmText: 'Programar',
      })
      return note === null ? null : createFollowUp({ loan: loan!, due_on: due, note })
    },
    onSuccess: (result) => {
      if (!result) return
      notify('Seguimiento programado.', 'success')
      refresh()
    },
  })
  const done = useMutation({
    mutationFn: async (task: Task) => {
      const note = await ask({
        title: 'Marcar como hecho',
        label: task.kind === 'escalation' ? 'Qué se decidió' : 'Nota (opcional)',
        type: 'textarea',
        required: task.kind === 'escalation',
        confirmText: 'Marcar hecho',
      })
      return note === null ? null : completeTask(task.id, note)
    },
    onSuccess: (result) => {
      if (!result) return
      refresh()
    },
  })

  if (timeline.isPending) return <Spinner />
  const data = timeline.data
  if (!data) return null
  const open = data.tasks.filter((t) => t.status === 'open')
  const pending = data.pending_promise
  return (
    <div className="space-y-4">
      {dialog}
      {loan && canManage ? (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setActing(true)}>Registrar gestión</Button>
          <Button variant="secondary" onClick={() => followUp.mutate()}>
            Programar seguimiento
          </Button>
        </div>
      ) : null}

      {pending ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-info-700/40">
          <div>
            <div className="text-[12.5px] text-muted">Promesa pendiente</div>
            <div className="text-base font-semibold">
              {rd(pending.amount)} para el {day(pending.promised_on)}
            </div>
            <div className="text-[12.5px] text-muted">
              Registrada por {pending.created_by_name} · {moment(pending.created_at)}
            </div>
          </div>
          {loan && canManage ? (
            <Button variant="secondary" onClick={() => cancel.mutate(pending.id)}>
              Cancelar promesa
            </Button>
          ) : null}
        </Card>
      ) : null}

      {open.length ? (
        <Card className="space-y-2">
          <h3 className="text-sm font-semibold">Seguimientos pendientes</h3>
          <ul className="divide-y divide-edge text-sm">
            {open.map((task) => (
              <li key={task.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <Badge tone={task.kind === 'escalation' ? 'warning' : 'info'}>
                    {task.action_label ?? task.kind_label}
                  </Badge>{' '}
                  {day(task.due_on)} · {task.assigned_name}
                  {customerId && task.loan_number ? ` · ${task.loan_number}` : ''}
                  {task.note ? <span className="text-muted"> · {task.note}</span> : null}
                </span>
                {task.can_act && loan ? (
                  <Button variant="secondary" className="!h-8" onClick={() => done.mutate(task)}>
                    Hecho
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="space-y-2">
        <h3 className="text-sm font-semibold">Gestiones</h3>
        {data.actions.length ? (
          <ul className="divide-y divide-edge text-sm">
            {data.actions.map((action) => (
              <li key={action.id} className="py-2">
                <span className="font-medium">
                  {action.kind_label}: {action.result_label}
                </span>{' '}
                <span className="text-muted">
                  · {action.user_name} · {moment(action.created_at)}
                  {customerId ? ` · ${action.loan_number}` : ''}
                </span>
                {action.note ? <div className="text-muted">{action.note}</div> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Sin gestiones registradas.</p>
        )}
      </Card>

      {data.promises.length ? (
        <Card className="space-y-2">
          <h3 className="text-sm font-semibold">Promesas</h3>
          <ul className="divide-y divide-edge text-sm">
            {data.promises.map((promise) => (
              <li key={promise.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  <Badge tone={PROMISE_TONE[promise.status]}>{promise.status_label}</Badge>{' '}
                  {rd(promise.amount)} para el {day(promise.promised_on)}
                  {customerId ? ` · ${promise.loan_number}` : ''}
                  {promise.note ? <span className="text-muted"> · {promise.note}</span> : null}
                </span>
                <span className="text-muted">
                  {promise.status === 'pending' ? '' : `pagó ${rd(promise.paid)}`}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {acting && loan ? (
        <ActionDialog
          loanNumber={loan}
          customerName={customerName}
          suggestedAmount={suggestedAmount}
          onClose={() => setActing(false)}
        />
      ) : null}
    </div>
  )
}
