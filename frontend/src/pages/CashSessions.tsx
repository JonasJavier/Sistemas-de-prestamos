import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { useState } from 'react'

import {
  approveSession,
  getSession,
  listSessions,
  sessionPdfUrl,
  type CashSession,
} from '../api/cash'
import { ApiError } from '../api/client'
import type { Me } from '../api/accounts'
import { CashDifferences } from '../components/CashDifferences'
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
  RowList,
  Spinner,
  Stat,
  Tabs,
  rowLinkClass,
} from '../components/ui'
import { day, errorMessage, moment, rd } from '../lib/format'

const STATUS_TONE: Record<CashSession['status'], string> = {
  open: 'info',
  closed: 'warning',
  approved: 'success',
}

const TABS = [
  ['closed', 'Por aprobar'],
  ['open', 'Abiertas'],
  ['approved', 'Aprobadas'],
  ['differences', 'Diferencias'],
] as const
type Tab = (typeof TABS)[number][0]

/** P52: the branch's cash sessions, closings to approve first. */
export function CashSessionsPage({ me }: { me: Me }) {
  const [tab, setTab] = useState<Tab>('closed')
  const sessions = useQuery({
    queryKey: ['cash-sessions', tab],
    queryFn: () => listSessions({ status: tab as CashSession['status'] }),
    enabled: tab !== 'differences',
  })
  return (
    <>
      <PageHeader title="Cajas" subtitle="Cierres por aprobar, cajas abiertas e historial" />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'differences' ? (
        <CashDifferences me={me} />
      ) : sessions.isPending ? (
        <Spinner />
      ) : sessions.data?.results.length ? (
        <RowList>
          {sessions.data.results.map((s) => (
            <li key={s.id}>
              <Link to="/cajas/$id" params={{ id: s.id }} className={rowLinkClass}>
                <span className="min-w-0">
                  <span className="font-semibold tabular-nums">{s.number}</span>{' '}
                  <span className="text-muted">
                    · {s.cashier_name} · {s.branch_name}
                  </span>
                  <span className="block text-[12.5px] text-muted">{day(s.business_date)}</span>
                </span>
                <span className="flex items-center gap-3">
                  {s.difference && Number(s.difference) !== 0 ? (
                    <Badge tone="danger">
                      {Number(s.difference) < 0 ? 'Faltan' : 'Sobran'}{' '}
                      {rd(Math.abs(Number(s.difference)))}
                    </Badge>
                  ) : null}
                  <span className="tabular-nums">{rd(s.counted ?? s.expected)}</span>
                  <Badge tone={STATUS_TONE[s.status]}>{s.status_label}</Badge>
                </span>
              </Link>
            </li>
          ))}
        </RowList>
      ) : (
        <EmptyState>
          {tab === 'closed'
            ? 'No hay cierres pendientes de aprobación.'
            : 'No hay cajas en esta bandeja.'}
        </EmptyState>
      )}
    </>
  )
}

/** One session: movements, count and the supervisor's approval (F7 step 5). */
export function CashSessionDetailPage() {
  const { id } = useParams({ from: '/app/cajas/$id' })
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')
  const session = useQuery({ queryKey: ['cash-session', id], queryFn: () => getSession(id) })
  const approve = useMutation({
    meta: { inlineError: true },
    mutationFn: () => approveSession(id, note),
    onSuccess: (data) => {
      queryClient.setQueryData(['cash-session', id], { ...session.data, ...data })
      void queryClient.invalidateQueries({ queryKey: ['cash-sessions'] })
      void queryClient.invalidateQueries({ queryKey: ['me'] })
    },
  })
  if (session.isPending) return <Spinner />
  const s = session.data
  if (!s) return <Alert tone="danger">No se encontró la caja.</Alert>
  const diff = Number(s.difference ?? 0)
  return (
    <>
      <PageHeader
        back={
          <Link to="/cajas" className="hover:underline">
            ← Cajas
          </Link>
        }
        title={
          <span className="flex items-center gap-2">
            Caja <span className="tabular-nums">{s.number}</span>
            <Badge tone={STATUS_TONE[s.status]}>{s.status_label}</Badge>
          </span>
        }
        documentTitle={`Caja ${s.number}`}
        subtitle={`${s.cashier_name} · ${s.branch_name} · ${day(s.business_date)}`}
        actions={
          s.status === 'approved' ? (
            <a
              href={sessionPdfUrl(s.id)}
              target="_blank"
              rel="noopener"
              className={buttonClass('secondary')}
            >
              PDF del cierre
            </a>
          ) : null
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Esperado" value={rd(s.expected)} />
        <Stat label="Contado" value={s.counted ? rd(s.counted) : '—'} emphasis />
        <Stat
          label="Diferencia"
          value={s.difference ? rd(s.difference) : '—'}
          hint={diff < 0 ? 'faltante' : diff > 0 ? 'sobrante' : undefined}
        />
        <Stat label="Trasladado al cerrar" value={rd(s.returned_amount)} />
      </div>
      {diff ? (
        <Alert tone="warning">
          {s.difference_reason}: {s.difference_note}
        </Alert>
      ) : null}
      {s.status === 'closed' && s.can_approve ? (
        <Card className="space-y-3">
          <h2 className="text-base font-semibold">Aprobar el cierre</h2>
          <p className="text-sm text-muted">
            {diff < 0
              ? 'El faltante queda como cuenta por cobrar al cajero.'
              : diff > 0
                ? 'El sobrante queda como ingreso extraordinario.'
                : 'La caja cuadra.'}{' '}
            Nadie aprueba su propia caja.
          </p>
          <Field label="Nota (opcional)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {approve.error instanceof ApiError ? (
            <Alert tone="danger">{errorMessage(approve.error.data)}</Alert>
          ) : null}
          <div className="flex justify-end">
            <Button onClick={() => approve.mutate()} disabled={approve.isPending}>
              Aprobar cierre
            </Button>
          </div>
        </Card>
      ) : s.status === 'approved' ? (
        <Alert tone="success">
          Aprobado por {s.approved_by_name} el {moment(s.approved_at)}.
        </Alert>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-base font-semibold">Movimientos</h2>
          <ul className="divide-y divide-edge text-sm">
            {s.movements?.map((m, i) => (
              <li key={i} className="flex justify-between gap-3 py-1.5">
                <span className="min-w-0">
                  <span className="font-medium">{m.kind}</span>{' '}
                  <span className="text-muted">{moment(m.at)}</span>
                  <span className="block truncate text-[12.5px] text-muted">{m.description}</span>
                </span>
                <span className={`tabular-nums ${m.out ? 'text-danger-600' : 'text-success-600'}`}>
                  {m.in ? `+${rd(m.in)}` : `−${rd(m.out)}`}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-2 text-base font-semibold">Arqueo</h2>
          {s.counts?.length ? (
            <table className="w-full text-sm tabular-nums">
              <tbody className="divide-y divide-edge">
                {s.counts.map((c) => (
                  <tr key={c.denomination}>
                    <td className="py-1">RD$ {Number(c.denomination).toLocaleString('es-DO')}</td>
                    <td className="text-right">× {c.quantity}</td>
                    <td className="text-right">{rd(Number(c.denomination) * c.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted">
              {s.status === 'open' ? 'Aún abierta.' : 'Sin efectivo contado.'}
            </p>
          )}
        </Card>
      </div>
    </>
  )
}
