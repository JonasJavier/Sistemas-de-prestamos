import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import type { Me } from '../api/accounts'
import { ApiError } from '../api/client'
import { listNotices, markAllNoticesRead, markNoticeRead } from '../api/notifications'
import { cancelApproval, decideApproval, listApprovals, type Approval } from '../api/payments'
import { Modal } from '../components/Modal'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
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
      <div className="w-full max-w-md space-y-3 rounded-xl bg-surface p-5 shadow-xl">
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
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{approval.kind_label}</span> {link}
          <span className="tabular-nums">{rd(approval.amount)}</span>
          <Badge tone={STATUS_TONE[approval.status]}>{approval.status_label}</Badge>
        </div>
        <div className="text-sm text-muted">
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
      {mine ? (
        approval.status === 'pending' || approval.status === 'approved' ? (
          <Button variant="secondary" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
            Cancelar pedido
          </Button>
        ) : null
      ) : (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => onDecide(false)}>
            Rechazar
          </Button>
          <Button onClick={() => onDecide(true)}>Autorizar</Button>
        </div>
      )}
    </li>
  )
}

/** P11: authorizations to decide, my requests, and the notices of the bell. */
export function NoticesPage({ me }: { me: Me }) {
  const refresh = useRefresh()
  const [tab, setTab] = useState<Tab>(me.pending_approvals ? 'decidir' : 'avisos')
  const [deciding, setDeciding] = useState<{ approval: Approval; approve: boolean } | null>(null)
  const approvals = useQuery({
    queryKey: ['approvals', tab],
    queryFn: () => listApprovals(tab === 'mias' ? 'mias' : 'por_decidir'),
    enabled: tab !== 'avisos',
  })
  const notices = useQuery({
    queryKey: ['notices'],
    queryFn: () => listNotices(),
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
          <Card className="!p-0">
            <ul className="divide-y divide-edge">
              {notices.data.results.map((n) => (
                <li
                  key={n.id}
                  className={`flex items-start justify-between gap-3 px-4 py-3 ${n.read_at ? '' : 'bg-brand-100/40'}`}
                >
                  <div className="min-w-0">
                    <div className="text-sm">
                      {!n.read_at ? (
                        <span
                          aria-label="Sin leer"
                          className="mr-2 inline-block size-2 rounded-full bg-brand-700"
                        />
                      ) : null}
                      {n.text}
                    </div>
                    <div className="text-[12px] text-muted">
                      {n.kind_label} · {moment(n.created_at)}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {n.link ? (
                      <Link
                        to={n.link}
                        className="text-sm font-medium text-brand-700 hover:underline"
                        onClick={() => !n.read_at && read.mutate(n.id)}
                      >
                        Ver
                      </Link>
                    ) : null}
                    {!n.read_at ? (
                      <button
                        type="button"
                        className="text-sm text-muted hover:underline"
                        onClick={() => read.mutate(n.id)}
                      >
                        Leído
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <EmptyState>No tienes avisos.</EmptyState>
        )
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
