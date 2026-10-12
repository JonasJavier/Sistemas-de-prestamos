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
import { buttonClass, tableRowClass } from '../components/classes'
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Pagination,
  Segmented,
  Spinner,
  Stat,
  Table,
  Texture,
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
  const [tab, setTabState] = useState<Tab>('closed')
  const [page, setPage] = useState(1)
  const setTab = (next: Tab) => {
    setTabState(next)
    setPage(1)
  }
  const sessions = useQuery({
    queryKey: ['cash-sessions', tab, page],
    queryFn: () => listSessions({ status: tab as CashSession['status'], page }),
    enabled: tab !== 'differences',
  })
  return (
    <>
      <PageHeader title="Cajas" subtitle="Cierres por aprobar, cajas abiertas e historial" />
      <Segmented
        label="Bandeja"
        value={tab}
        onChange={setTab}
        options={TABS.map(([value, label]) => ({ value, label }))}
      />
      {tab === 'differences' ? (
        <CashDifferences me={me} />
      ) : sessions.isPending ? (
        <Spinner />
      ) : sessions.data?.results.length ? (
        <Table
          label="Cajas"
          columns="minmax(0,1fr) minmax(0,1.6fr) minmax(0,1fr) minmax(0,1.1fr) minmax(0,0.9fr)"
          head={[
            { label: 'Caja' },
            { label: 'Cajero · sucursal' },
            { label: 'Contado', align: 'right' },
            { label: 'Diferencia' },
            { label: 'Estado' },
          ]}
        >
          {sessions.data.results.map((s, index) => {
            const diff = Number(s.difference ?? 0)
            return (
              <li
                key={s.id}
                className="animate-reveal"
                style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }}
              >
                <Link to="/cajas/$id" params={{ id: s.id }} className={tableRowClass}>
                  <span>
                    <span className="block font-semibold tabular-nums">{s.number}</span>
                    <span className="block text-[12px] text-muted">{day(s.business_date)}</span>
                  </span>
                  <span className="min-w-0 max-md:order-first max-md:basis-full">
                    <span className="block truncate text-[13.5px] font-medium">
                      {s.cashier_name}
                    </span>
                    <span className="block truncate text-[12px] text-muted">{s.branch_name}</span>
                  </span>
                  <span className="text-right font-display text-[15px] font-semibold tabular-nums">
                    {rd(s.counted ?? s.expected)}
                  </span>
                  <span>
                    {diff ? (
                      <Badge tone="danger" dot>
                        {diff < 0 ? 'Faltan' : 'Sobran'} {rd(Math.abs(diff))}
                      </Badge>
                    ) : s.difference !== null && s.difference !== undefined ? (
                      <Badge tone="brand" dot>
                        Cuadró
                      </Badge>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </span>
                  <span>
                    <Badge tone={STATUS_TONE[s.status]} dot>
                      {s.status_label}
                    </Badge>
                  </span>
                </Link>
              </li>
            )
          })}
        </Table>
      ) : (
        <EmptyState>
          {tab === 'closed'
            ? 'No hay cierres pendientes de aprobación.'
            : 'No hay cajas en esta bandeja.'}
        </EmptyState>
      )}
      {tab !== 'differences' ? (
        <Pagination page={page} count={sessions.data?.count ?? 0} onChange={setPage} />
      ) : null}
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
          hint={diff < 0 ? 'faltante' : diff > 0 ? 'sobrante' : s.difference ? 'cuadra' : undefined}
          danger={diff < 0}
        />
        <Stat label="Trasladado al cerrar" value={rd(s.returned_amount)} />
      </div>
      {diff ? (
        <Alert tone="warning">
          {s.difference_reason}: {s.difference_note}
        </Alert>
      ) : null}
      {s.status === 'closed' && s.can_approve ? (
        // The supervisor's next step: on forest, the one thing to do now.
        <section className="relative overflow-hidden rounded-card bg-brand-950 p-5 text-on-forest shadow-sm">
          <Texture tone="forest" />
          <div className="relative grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:items-end">
            <div>
              <h2 className="font-display text-[19px] font-bold">Aprobar el cierre</h2>
              <p className="mt-1 text-[13px] text-brand-200">
                {diff < 0
                  ? 'El faltante queda como cuenta por cobrar al cajero.'
                  : diff > 0
                    ? 'El sobrante queda como ingreso extraordinario.'
                    : 'La caja cuadra.'}{' '}
                Nadie aprueba su propia caja.
              </p>
            </div>
            <div className="flex items-end gap-2">
              <label className="block min-w-0 flex-1 space-y-1.5">
                <span className="block text-[12.5px] font-medium text-brand-200">
                  Nota (opcional)
                </span>
                <Input value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              <button
                type="button"
                onClick={() => approve.mutate()}
                disabled={approve.isPending}
                className="press press-down h-11 shrink-0 rounded-control bg-forest-accent px-4 text-[13.5px] font-semibold text-on-forest-accent disabled:opacity-50 sm:h-[38px]"
              >
                Aprobar cierre
              </button>
            </div>
          </div>
          {approve.error instanceof ApiError ? (
            <div className="relative mt-3">
              <Alert tone="danger">{errorMessage(approve.error.data)}</Alert>
            </div>
          ) : null}
        </section>
      ) : s.status === 'approved' ? (
        <Alert tone="success">
          Aprobado por {s.approved_by_name} el {moment(s.approved_at)}.
        </Alert>
      ) : null}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* min-w-0: a long description truncates instead of widening the
            card past a phone's screen. */}
        <Card className="min-w-0 overflow-hidden !p-0">
          <h2 className="px-4 pb-2 pt-4 text-[17px] font-semibold sm:px-5">Movimientos</h2>
          <table className="data-table w-full table-fixed">
            <thead>
              <tr>
                <th>Movimiento</th>
                <th className="w-36 text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {s.movements?.map((m, i) => (
                <tr key={i}>
                  <td>
                    <div className="truncate">
                      <span className="font-semibold">{m.kind}</span>{' '}
                      <span className="text-[12px] text-muted">{moment(m.at)}</span>
                    </div>
                    <div className="truncate text-[12px] text-muted" title={m.description}>
                      {m.description}
                    </div>
                  </td>
                  <td
                    className={`whitespace-nowrap text-right font-semibold tabular-nums ${m.out ? 'text-danger-600' : 'text-success-600'}`}
                  >
                    {m.in ? `+${rd(m.in)}` : `−${rd(m.out)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card className="min-w-0 overflow-hidden !p-0">
          <h2 className="px-4 pb-2 pt-4 text-[17px] font-semibold sm:px-5">Arqueo</h2>
          {s.counts?.length ? (
            <table className="data-table w-full tabular-nums">
              <thead>
                <tr>
                  <th>Denominación</th>
                  <th className="text-right">Cantidad</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {s.counts.map((c) => (
                  <tr key={c.denomination}>
                    <td>RD$ {Number(c.denomination).toLocaleString('es-DO')}</td>
                    <td className="text-right">× {c.quantity}</td>
                    <td className="text-right">{rd(Number(c.denomination) * c.quantity)}</td>
                  </tr>
                ))}
              </tbody>
              {s.counted ? (
                <tfoot>
                  <tr>
                    <td colSpan={2}>Contado</td>
                    <td className="text-right">{rd(s.counted)}</td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          ) : (
            <p className="px-4 pb-4 text-[13px] text-muted sm:px-5">
              {s.status === 'open' ? 'Aún abierta.' : 'Sin efectivo contado.'}
            </p>
          )}
        </Card>
      </div>
    </>
  )
}
