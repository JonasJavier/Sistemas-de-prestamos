import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import type { Me } from '../api/accounts'
import { ApiError } from '../api/client'
import { listNotices, markAllNoticesRead, markNoticeRead } from '../api/notifications'
import { cancelApproval, decideApproval, listApprovals, type Approval } from '../api/payments'
import { Modal } from '../components/Modal'
import { BellIcon, ShieldIcon } from '../components/icons'
import { buttonClass } from '../components/classes'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Pagination,
  Spinner,
  Tabs,
  Textarea,
} from '../components/ui'
import { errorMessage, installmentsText, moment, pct, rd } from '../lib/format'
import { notify } from '../lib/toast'

const TABS = [
  ['decidir', 'Por autorizar'],
  ['mias', 'Mis pedidos'],
  ['avisos', 'Avisos'],
] as const
type Tab = (typeof TABS)[number][0]

const STATUS_TONE: Record<Approval['status'], string> = {
  pending: 'warning',
  approved: 'success',
  used: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
  expired: 'neutral',
}

/** Notices by day (decision 116): «Hoy», «Ayer», then the date. */
function groupByDay<T extends { created_at: string }>(items: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>()
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  for (const item of items) {
    const at = new Date(item.created_at)
    const label = same(at, today)
      ? 'Hoy'
      : same(at, yesterday)
        ? 'Ayer'
        : at.toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' })
    groups.set(label, [...(groups.get(label) ?? []), item])
  }
  return [...groups.entries()]
}

function useRefresh() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['approvals'] })
    void queryClient.invalidateQueries({ queryKey: ['notices'] })
    void queryClient.invalidateQueries({ queryKey: ['me'] })
  }
}

/** Approve with the second factor when the doc 06 - 6 asks for it. */
function DecideDialog({
  approval,
  approve,
  me,
  onClose,
}: {
  approval: Approval
  approve: boolean
  me: Me
  onClose: () => void
}) {
  const refresh = useRefresh()
  const [note, setNote] = useState('')
  const [code, setCode] = useState('')
  const needsCode = approve && approval.needs_second_factor
  const decide = useMutation({
    meta: { inlineError: true },
    mutationFn: () => decideApproval(approval.id, approve, { note, second_factor: code }),
    onSuccess: () => {
      notify(approve ? 'Autorizado.' : 'Rechazado.', 'success')
      refresh()
      onClose()
    },
  })
  return (
    <Modal onClose={onClose} labelledBy="decide-title">
      <div className="w-full max-w-md space-y-3 rounded-2xl bg-surface p-5 shadow-xl">
        <h2 id="decide-title" className="text-lg font-semibold">
          {approve ? 'Autorizar' : 'Rechazar'}: {approval.kind_label.toLowerCase()}
        </h2>
        <p className="text-sm">
          {approval.target_label} · {rd(approval.amount)} · pedido por {approval.requested_by_name}
          {approval.payload.correct_amount
            ? ` · monto correcto ${rd(approval.payload.correct_amount)}`
            : ''}
          {approval.kind === 'restructure' && approval.payload.installments
            ? ` · ${installmentsText(approval.payload.installments, approval.payload.frequency ?? '')} al ${pct(approval.payload.rate)}${approval.payload.waive_late_fee ? ' · condona la mora' : ''}`
            : ''}
        </p>
        <p className="text-sm text-muted">
          {approval.reason_text ? `${approval.reason_text}: ` : ''}
          {approval.note}
        </p>
        {needsCode ? (
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
        ) : null}
        <Field label={approve ? 'Nota (opcional)' : 'Por qué la rechazas'}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {decide.error instanceof ApiError ? (
          <Alert tone="danger">{errorMessage(decide.error.data)}</Alert>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant={approve ? 'primary' : 'danger'}
            disabled={(needsCode && !code.trim()) || (!approve && !note.trim()) || decide.isPending}
            onClick={() => decide.mutate()}
          >
            {approve ? 'Autorizar' : 'Rechazar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function ApprovalRow({
  approval,
  mine,
  onDecide,
}: {
  approval: Approval
  mine: boolean
  onDecide: (approve: boolean) => void
}) {
  const refresh = useRefresh()
  const cancel = useMutation({ mutationFn: () => cancelApproval(approval.id), onSuccess: refresh })
  const link =
    approval.target_type === 'payments.payment' ? (
      <Link
        to="/recibos/$numero"
        params={{ numero: approval.target_label }}
        className="font-semibold text-brand-700 hover:underline"
      >
        {approval.target_label}
      </Link>
    ) : (
      <Link
        to="/prestamos/$numero"
        params={{ numero: approval.target_label }}
        className="font-semibold text-brand-700 hover:underline"
      >
        {approval.target_label}
      </Link>
    )
  const pending = approval.status === 'pending'
  return (
    <li className="flex flex-wrap items-start gap-3 px-4 py-3.5 sm:px-5">
      <span
        aria-hidden
        className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-[10px] ${
          pending ? 'bg-warning-100 text-warning-700' : 'bg-surface-2 text-muted'
        }`}
      >
        <ShieldIcon className="size-[18px] shrink-0" />
      </span>
      <div className="min-w-0 flex-1 basis-64 space-y-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px]">
          <span className="font-semibold">{approval.kind_label}</span> {link}
          <Badge tone={STATUS_TONE[approval.status]} dot>
            {approval.status_label}
          </Badge>
        </div>
        <div className="text-[13px] text-muted">
          {approval.reason_text ? `${approval.reason_text}: ` : ''}
          {approval.note}
        </div>
        <div className="text-[12px] text-muted">
          {mine ? '' : `Pidió ${approval.requested_by_name} · `}
          {moment(approval.created_at)}
          {approval.decided_by_name ? ` · decidió ${approval.decided_by_name}` : ''}
          {approval.decision_note ? `: ${approval.decision_note}` : ''}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3 max-sm:w-full max-sm:justify-between">
        <span className="font-display text-[17px] font-bold tabular-nums">
          {rd(approval.amount)}
        </span>
        {mine ? (
          approval.status === 'pending' || approval.status === 'approved' ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => cancel.mutate()}
              disabled={cancel.isPending}
            >
              Cancelar pedido
            </Button>
          ) : null
        ) : (
          <span className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => onDecide(false)}>
              Rechazar
            </Button>
            <Button size="sm" onClick={() => onDecide(true)}>
              Autorizar
            </Button>
          </span>
        )}
      </div>
    </li>
  )
}

/** P11: authorizations to decide, my requests, and the notices of the bell. */
export function NoticesPage({ me }: { me: Me }) {
  const refresh = useRefresh()
  const [tab, setTabState] = useState<Tab>(me.pending_approvals ? 'decidir' : 'avisos')
  // Every tab is paged (25 rows): the older notices stay within reach.
  const [page, setPage] = useState(1)
  const setTab = (next: Tab) => {
    setTabState(next)
    setPage(1)
  }
  const [deciding, setDeciding] = useState<{ approval: Approval; approve: boolean } | null>(null)
  const approvals = useQuery({
    queryKey: ['approvals', tab, page],
    queryFn: () => listApprovals(tab === 'mias' ? 'mias' : 'por_decidir', page),
    enabled: tab !== 'avisos',
  })
  const notices = useQuery({
    queryKey: ['notices', page],
    queryFn: () => listNotices(false, page),
    enabled: tab === 'avisos',
  })
  const readAll = useMutation({ mutationFn: markAllNoticesRead, onSuccess: refresh })
  const read = useMutation({ mutationFn: markNoticeRead, onSuccess: refresh })
  return (
    <>
      <PageHeader
        title="Avisos y autorizaciones"
        actions={
          tab === 'avisos' ? (
            <Button
              variant="secondary"
              onClick={() => readAll.mutate()}
              disabled={readAll.isPending}
            >
              Marcar todo como leído
            </Button>
          ) : null
        }
      />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'avisos' ? (
        notices.isPending ? (
          <Spinner />
        ) : notices.data?.results.length ? (
          <div className="space-y-4">
            {groupByDay(notices.data.results).map(([label, items]) => (
              <section key={label} className="space-y-2">
                <h2 className="eyebrow px-1">{label}</h2>
                <ul className="divide-y divide-edge overflow-hidden rounded-card border border-edge bg-surface shadow-sm">
                  {items.map((n) => (
                    <li
                      key={n.id}
                      className={`flex items-start gap-3 px-4 py-3 sm:px-5 ${n.read_at ? '' : 'bg-brand-50/60'}`}
                    >
                      <span
                        aria-hidden
                        className={`relative mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ${
                          n.read_at ? 'bg-surface-2 text-muted' : 'bg-brand-100 text-brand-800'
                        }`}
                      >
                        <BellIcon className="size-4 shrink-0" />
                        {!n.read_at ? (
                          <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-brand-700 ring-2 ring-surface" />
                        ) : null}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div
                          className={`text-[13.5px] ${n.read_at ? 'text-muted' : 'font-medium'}`}
                        >
                          {!n.read_at ? <span className="sr-only">Sin leer: </span> : null}
                          {n.text}
                        </div>
                        <div className="mt-0.5 text-[12px] text-muted">
                          {n.kind_label} ·{' '}
                          {new Date(n.created_at).toLocaleTimeString('es-DO', {
                            timeStyle: 'short',
                          })}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {n.link ? (
                          <Link
                            to={n.link}
                            className={buttonClass('soft', '', 'sm')}
                            onClick={() => !n.read_at && read.mutate(n.id)}
                          >
                            Ver
                          </Link>
                        ) : null}
                        {!n.read_at ? (
                          <button
                            type="button"
                            className={buttonClass('ghost', '!text-muted', 'sm')}
                            onClick={() => read.mutate(n.id)}
                          >
                            Leído
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <EmptyState>No tienes avisos.</EmptyState>
        )
      ) : null}
      {tab === 'avisos' ? (
        <Pagination page={page} count={notices.data?.count ?? 0} onChange={setPage} />
      ) : approvals.isPending ? (
        <Spinner />
      ) : approvals.data?.results.length ? (
        <Card className="!p-0">
          <ul className="divide-y divide-edge">
            {approvals.data.results.map((a) => (
              <ApprovalRow
                key={a.id}
                approval={a}
                mine={tab === 'mias'}
                onDecide={(approve) => setDeciding({ approval: a, approve })}
              />
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState>
          {tab === 'mias' ? 'No has pedido autorizaciones.' : 'Nada pendiente por autorizar.'}
        </EmptyState>
      )}
      {tab !== 'avisos' ? (
        <Pagination page={page} count={approvals.data?.count ?? 0} onChange={setPage} />
      ) : null}
      {deciding ? (
        <DecideDialog
          approval={deciding.approval}
          approve={deciding.approve}
          me={me}
          onClose={() => setDeciding(null)}
        />
      ) : null}
    </>
  )
}
