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
import { Kpi } from '../components/Kpi'
import { Avatar, Badge, Button, EmptyState, PageHeader, Segmented, Spinner } from '../components/ui'
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

  const list = (items: Item[], compact = false) => (
    <ul className="divide-y divide-edge">
      {items.map((item) => (
        <AgendaRow
          key={`${item.type}-${item.type === 'task' ? item.task.id : item.promise.id}`}
          item={item}
          today={data!.today}
          canCollect={canCollect}
          compact={compact}
          onAct={(loan, amount) => setActing({ loan, amount })}
        />
      ))}
    </ul>
  )

  return (
    <>
      <PageHeader
        title="Agenda de cobranza"
        subtitle="Promesas que vencen hoy, seguimientos y casos escalados."
        actions={
          data?.can_switch ? (
            <Segmented
              label="Agenda"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'mine', label: 'Mías' },
                { value: 'branch', label: 'De la sucursal' },
              ]}
            />
          ) : null
        }
      />
      {agenda.isPending ? <Spinner /> : null}
      {data ? (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            <Kpi
              label="Para hoy"
              value={String(todayItems.length)}
              hint="Promesas y seguimientos"
            />
            <Kpi
              label="Incumplidas (7 días)"
              value={String(data.broken.length)}
              hint="Promesas que no se pagaron"
              tone={data.broken.length ? 'warn' : undefined}
            />
            <Kpi label="Próximos 7 días" value={String(upcoming.length)} hint="Ya programado" />
            <Kpi
              label="Cumplimiento del mes"
              value={data.month.rate === null ? '—' : pct(data.month.rate, 0)}
              hint={`${data.month.kept} cumplidas de ${data.month.kept + data.month.broken}`}
              tone={data.month.rate !== null && Number(data.month.rate) < 0.7 ? 'warn' : 'good'}
            />
          </div>
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <section className="overflow-hidden rounded-card border border-edge bg-surface shadow-sm">
              <h2 className="flex items-center gap-2 border-b border-edge px-5 py-3.5 text-[16px] font-semibold">
                Hoy
                <span className="rounded-full bg-brand-100 px-2 text-[12px] font-semibold text-brand-800">
                  {todayItems.length}
                </span>
              </h2>
              {todayItems.length ? (
                list(todayItems)
              ) : (
                <div className="p-5">
                  <EmptyState>Nada pendiente para hoy.</EmptyState>
                </div>
              )}
            </section>
            <div className="space-y-4">
              <section className="overflow-hidden rounded-card border border-edge bg-surface shadow-sm">
                <h2 className="flex items-center gap-2 border-b border-edge px-5 py-3.5 text-[16px] font-semibold">
                  Incumplidas en los últimos 7 días
                  <span
                    className={`rounded-full px-2 text-[12px] font-semibold ${
                      data.broken.length
                        ? 'bg-warning-100 text-warning-700'
                        : 'bg-surface-2 text-muted'
                    }`}
                  >
                    {data.broken.length}
                  </span>
                </h2>
                {data.broken.length ? (
                  list(promiseItems(data.broken), true)
                ) : (
                  <p className="px-5 py-4 text-[13px] text-muted">Ninguna promesa incumplida.</p>
                )}
              </section>
              <section className="overflow-hidden rounded-card border border-edge bg-surface shadow-sm">
                <h2 className="border-b border-edge px-5 py-3.5 text-[16px] font-semibold">
                  Próximos 7 días
                </h2>
                {upcoming.length ? (
                  list(upcoming, true)
                ) : (
                  <p className="px-5 py-4 text-[13px] text-muted">
                    Sin promesas ni seguimientos programados.
                  </p>
                )}
              </section>
            </div>
          </div>
        </>
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
  compact = false,
}: {
  item: Item
  today: string
  canCollect: boolean
  onAct: (loan: LoanBrief, amount?: string) => void
  /** The side lists keep two lines: who and what is due. */
  compact?: boolean
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
    <li className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5">
      {dialog}
      <div className="flex min-w-0 flex-1 basis-64 gap-3">
        <Avatar name={loan.customer_name} size="sm" />
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              to="/prestamos/$numero"
              params={{ numero: loan.number }}
              className="text-[13.5px] font-semibold hover:text-brand-700 hover:underline"
            >
              {loan.customer_name}
            </Link>
            <span className="text-[12px] text-muted tabular-nums">{loan.number}</span>
            {loan.days_past_due ? (
              <Badge tone={loan.days_past_due > 30 ? 'danger' : 'warning'} dot>
                {loan.days_past_due} días
              </Badge>
            ) : (
              <Badge tone="brand" dot>
                Al día
              </Badge>
            )}
          </div>
          {item.type === 'promise' ? (
            <p className="flex flex-wrap items-center gap-2 text-[13px]">
              <Badge tone={item.promise.status === 'broken' ? 'danger' : 'gold'}>
                {item.promise.status === 'broken' ? 'Promesa incumplida' : 'Promesa'}
              </Badge>
              <span>
                <strong className="font-semibold">{rd(item.promise.amount)}</strong> para el{' '}
                {day(item.promise.promised_on)}
                {item.promise.status === 'broken'
                  ? ` · pagó ${rd(item.promise.paid)}`
                  : late
                    ? ' · venció'
                    : ''}
              </span>
            </p>
          ) : (
            <p className="flex flex-wrap items-center gap-2 text-[13px]">
              <Badge tone={TASK_TONE[item.task.kind]}>
                {item.task.action_label ?? item.task.kind_label}
              </Badge>
              <span>
                {day(item.task.due_on)}
                {late ? ' · atrasado' : ''}
                {item.task.note ? <span className="text-muted"> · {item.task.note}</span> : null}
              </span>
            </p>
          )}
          {compact ? null : (
            <p className="text-[12px] text-muted">
              {loan.branch_name} · gestor {loan.agent_name ?? 'sin asignar'}
              {loan.phone ? ` · ${phoneText(loan.phone)}` : ''}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {loan.phone ? (
          <>
            <a href={`tel:${loan.phone}`} className={buttonClass('secondary', '', 'sm')}>
              Llamar
            </a>
            <a
              href={whatsappLink(loan.phone, `Hola ${loan.customer_name.split(' ')[0]}, `)}
              target="_blank"
              rel="noopener"
              className={buttonClass('secondary', '', 'sm')}
            >
              WhatsApp
            </a>
          </>
        ) : null}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onAct(loan, item.type === 'promise' ? item.promise.amount : undefined)}
        >
          Gestión
        </Button>
        {canCollect ? (
          <Link
            to="/cobrar/$numero"
            params={{ numero: loan.number }}
            className={buttonClass('soft', '', 'sm')}
          >
            Cobrar
          </Link>
        ) : null}
        {item.type === 'task' && item.task.can_act ? (
          <>
            {item.task.kind !== 'escalation' ? (
              <Button variant="secondary" size="sm" onClick={() => move.mutate(item.task)}>
                Reprogramar
              </Button>
            ) : null}
            <Button variant="soft" size="sm" onClick={() => done.mutate(item.task)}>
              Hecho
            </Button>
          </>
        ) : null}
      </div>
    </li>
  )
}
