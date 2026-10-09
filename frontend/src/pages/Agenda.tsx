import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import type { Me } from '../api/accounts'
import {
  completeTask,
  getAgenda,
  type LoanBrief,
  type PaymentPromise,
  rescheduleTask,
  type Task,
} from '../api/collections'
import { ActionDialog } from '../components/ActionDialog'
import { useRefreshCollections } from '../lib/collections'
import { buttonClass } from '../components/classes'
import { usePrompt } from '../components/Dialog'
import { Badge, Button, Card, EmptyState, PageHeader, Spinner, Tabs } from '../components/ui'
import { day, pct, phoneText, rd, todayISO } from '../lib/format'
import { whatsappLink } from '../lib/print'
import { ACCESS, hasRole } from '../lib/roles'
import { notify } from '../lib/toast'

type Item =
  | { type: 'promise'; promise: PaymentPromise; loan: LoanBrief; on: string }
  | { type: 'task'; task: Task; loan: LoanBrief; on: string }

const TASK_TONE: Record<Task['kind'], string> = {
  follow_up: 'info',
  broken_promise: 'danger',
  escalation: 'warning',
}

function promiseItems(promises: PaymentPromise[]): Item[] {
  return promises.map((promise) => ({
    type: 'promise',
    promise,
    loan: promise.loan!,
    on: promise.promised_on,
  }))
}

function taskItems(tasks: Task[]): Item[] {
  return tasks.map((task) => ({ type: 'task', task, loan: task.loan!, on: task.due_on }))
}

/** P44 · Agenda de cobranza: promises due today, follow-ups and escalations,
 * the broken promises and what is coming (decisions 076-078). */
export function AgendaPage({ me }: { me: Me }) {
  const [scope, setScope] = useState<'mine' | 'branch'>('mine')
  const agenda = useQuery({ queryKey: ['agenda', scope], queryFn: () => getAgenda(scope) })
  const [acting, setActing] = useState<{ loan: LoanBrief; amount?: string } | null>(null)
  const data = agenda.data
  const todayItems = data
    ? [...taskItems(data.tasks), ...promiseItems(data.promises_today)].sort((a, b) =>
        a.on.localeCompare(b.on),
      )
    : []
  const upcoming = data
    ? [...promiseItems(data.upcoming.promises), ...taskItems(data.upcoming.tasks)].sort((a, b) =>
        a.on.localeCompare(b.on),
      )
    : []
  const canCollect = hasRole(me, ACCESS.collect)

  return (
    <>
      <PageHeader
        title="Agenda de cobranza"
        subtitle={
          data?.month.rate !== null && data?.month.rate !== undefined
            ? `Promesas del mes: ${data.month.kept} cumplidas de ${
                data.month.kept + data.month.broken
              } (${pct(data.month.rate)}).`
            : 'Promesas que vencen hoy, seguimientos y casos escalados.'
        }
        actions={
          data?.can_switch ? (
            <Tabs
              tabs={[
                ['mine', 'Mías'],
                ['branch', 'De la sucursal'],
              ]}
              value={scope}
              onChange={setScope}
            />
          ) : null
        }
      />
      {agenda.isPending ? <Spinner /> : null}
      {data ? (
        <div className="space-y-4">
          <Card className="space-y-2">
            <h2 className="text-base font-semibold">
              Hoy <span className="text-sm font-normal text-muted">({todayItems.length})</span>
            </h2>
            {todayItems.length ? (
              <ul className="divide-y divide-edge">
                {todayItems.map((item) => (
                  <AgendaRow
                    key={`${item.type}-${item.type === 'task' ? item.task.id : item.promise.id}`}
                    item={item}
                    today={data.today}
                    canCollect={canCollect}
                    onAct={(loan, amount) => setActing({ loan, amount })}
                  />
                ))}
              </ul>
            ) : (
              <EmptyState>Nada pendiente para hoy.</EmptyState>
            )}
          </Card>

          <Card className="space-y-2">
            <h2 className="text-base font-semibold">
              Incumplidas en los últimos 7 días{' '}
              <span className="text-sm font-normal text-muted">({data.broken.length})</span>
            </h2>
            {data.broken.length ? (
              <ul className="divide-y divide-edge">
                {promiseItems(data.broken).map((item) => (
                  <AgendaRow
                    key={item.type === 'promise' ? item.promise.id : ''}
                    item={item}
                    today={data.today}
                    canCollect={canCollect}
                    onAct={(loan, amount) => setActing({ loan, amount })}
                  />
                ))}
              </ul>
            ) : (
              <EmptyState>Ninguna promesa incumplida.</EmptyState>
            )}
          </Card>

          <Card className="space-y-2">
            <h2 className="text-base font-semibold">Próximos 7 días</h2>
            {upcoming.length ? (
              <ul className="divide-y divide-edge">
                {upcoming.map((item) => (
                  <AgendaRow
                    key={`${item.type}-${item.type === 'task' ? item.task.id : item.promise.id}`}
                    item={item}
                    today={data.today}
                    canCollect={canCollect}
                    onAct={(loan, amount) => setActing({ loan, amount })}
                  />
                ))}
              </ul>
            ) : (
              <EmptyState>Sin promesas ni seguimientos programados.</EmptyState>
            )}
          </Card>
        </div>
      ) : null}
      {acting ? (
        <ActionDialog
          loanNumber={acting.loan.number}
          customerName={acting.loan.customer_name}
          suggestedAmount={acting.amount}
          onClose={() => setActing(null)}
        />
      ) : null}
    </>
  )
}

function AgendaRow({
  item,
  today,
  canCollect,
  onAct,
}: {
  item: Item
  today: string
  canCollect: boolean
  onAct: (loan: LoanBrief, amount?: string) => void
}) {
  const refresh = useRefreshCollections()
  const [dialog, ask] = usePrompt()
  const loan = item.loan
  const done = useMutation({
    mutationFn: async (task: Task) => {
      const note = await ask({
        title: task.kind === 'escalation' ? 'Cerrar el escalamiento' : 'Marcar como hecho',
        label: task.kind === 'escalation' ? 'Qué se decidió' : 'Nota (opcional)',
        type: 'textarea',
        required: task.kind === 'escalation',
        confirmText: 'Marcar hecho',
      })
      if (note === null) return null
      return completeTask(task.id, note)
    },
    onSuccess: (result) => {
      if (!result) return
      notify('Seguimiento cerrado.', 'success')
      refresh()
    },
  })
  const move = useMutation({
    mutationFn: async (task: Task) => {
      const date = await ask({
        title: 'Reprogramar el seguimiento',
        label: 'Nueva fecha',
        type: 'date',
        initial: todayISO(1),
        required: true,
        confirmText: 'Reprogramar',
      })
      if (!date) return null
      return rescheduleTask(task.id, date)
    },
    onSuccess: (result) => {
      if (!result) return
      notify('Seguimiento reprogramado.', 'success')
      refresh()
    },
  })
  const late = item.on < today
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3">
      {dialog}
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/prestamos/$numero"
            params={{ numero: loan.number }}
            className="font-semibold text-brand-700 hover:underline"
          >
            {loan.customer_name}
          </Link>
          <span className="text-[12.5px] text-muted">{loan.number}</span>
          {loan.days_past_due ? (
            <Badge tone="danger">{loan.days_past_due} días</Badge>
          ) : (
            <Badge tone="success">Al día</Badge>
          )}
        </div>
        {item.type === 'promise' ? (
          <p className="text-sm">
            <Badge tone={item.promise.status === 'broken' ? 'danger' : 'info'}>
              {item.promise.status === 'broken' ? 'Promesa incumplida' : 'Promesa'}
            </Badge>{' '}
            {rd(item.promise.amount)} para el {day(item.promise.promised_on)}
            {item.promise.status === 'broken'
              ? ` · pagó ${rd(item.promise.paid)}`
              : late
                ? ' · venció'
                : ''}
          </p>
        ) : (
          <p className="text-sm">
            <Badge tone={TASK_TONE[item.task.kind]}>
              {item.task.action_label ?? item.task.kind_label}
            </Badge>{' '}
            {day(item.task.due_on)}
            {late ? ' · atrasado' : ''}
            {item.task.note ? <span className="text-muted"> · {item.task.note}</span> : null}
          </p>
        )}
        <p className="text-[12.5px] text-muted">
          {loan.branch_name} · gestor {loan.agent_name ?? 'sin asignar'}
          {loan.phone ? ` · ${phoneText(loan.phone)}` : ''}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {loan.phone ? (
          <>
            <a href={`tel:${loan.phone}`} className={buttonClass('secondary', '!h-9 !px-3')}>
              Llamar
            </a>
            <a
              href={whatsappLink(loan.phone, `Hola ${loan.customer_name.split(' ')[0]}, `)}
              target="_blank"
              rel="noopener"
              className={buttonClass('secondary', '!h-9 !px-3')}
            >
              WhatsApp
            </a>
          </>
        ) : null}
        <Button
          variant="secondary"
          className="!h-9 !px-3"
          onClick={() => onAct(loan, item.type === 'promise' ? item.promise.amount : undefined)}
        >
          Gestión
        </Button>
        {canCollect ? (
          <Link
            to="/cobrar/$numero"
            params={{ numero: loan.number }}
            className={buttonClass('secondary', '!h-9 !px-3')}
          >
            Cobrar
          </Link>
        ) : null}
        {item.type === 'task' && item.task.can_act ? (
          <>
            {item.task.kind !== 'escalation' ? (
              <Button
                variant="secondary"
                className="!h-9 !px-3"
                onClick={() => move.mutate(item.task)}
              >
                Reprogramar
              </Button>
            ) : null}
            <Button className="!h-9 !px-3" onClick={() => done.mutate(item.task)}>
              Hecho
            </Button>
          </>
        ) : null}
      </div>
    </li>
  )
}
