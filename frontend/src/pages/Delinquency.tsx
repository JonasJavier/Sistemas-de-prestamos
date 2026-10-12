import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import type { Me } from '../api/accounts'
import { ApiError } from '../api/client'
import { assignAgent, listAgents } from '../api/collections'
import { type DelinquencyRow, getDelinquency, listWriteOffSuggestions } from '../api/payments'
import { ActionDialog } from '../components/ActionDialog'
import { useRefreshCollections } from '../lib/collections'
import { buttonClass } from '../components/classes'
import { Modal } from '../components/Modal'
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  SearchInput,
  Select,
  Spinner,
  Table,
} from '../components/ui'
import { day, errorMessage, phoneText, rd, plural } from '../lib/format'
import { useDebounced } from '../lib/hooks'
import { ACCESS, hasRole } from '../lib/roles'
import { notify } from '../lib/toast'

/** One stripe per bucket, from a warning to the deepest red. */
const SEVERITY = [
  'bg-warning-700/45',
  'bg-warning-700/80',
  'bg-danger-600/50',
  'bg-danger-600/80',
  'bg-danger-600',
]

const BUCKETS: Record<string, string> = {
  '1_7': '1–7 días',
  '8_30': '8–30 días',
  '31_60': '31–60 días',
  '61_90': '61–90 días',
  '90_mas': 'Más de 90',
}

/** P43: loans in arrears by bucket; counts and totals match the filters (F8).
 * Phase 5: the agent's tray, promises, the last action and the assignment. */
export function DelinquencyPage({ me }: { me: Me }) {
  const [bucket, setBucket] = useState('1_7')
  const [q, setQ] = useState('')
  const canAssign = hasRole(me, ACCESS.assignAgents)
  const canManage = hasRole(me, ACCESS.manageCollections)
  const canCollect = hasRole(me, ACCESS.collect)
  // An agent starts on his own tray; supervisors see the whole branch.
  const [agent, setAgent] = useState(canManage && !canAssign ? 'mios' : '')
  const [promise, setPromise] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [acting, setActing] = useState<DelinquencyRow | null>(null)
  const [assigning, setAssigning] = useState(false)
  const term = useDebounced(q.trim(), 300)
  const tray = useQuery({
    queryKey: ['delinquency', bucket, term, agent, promise],
    queryFn: () => getDelinquency({ tramo: bucket, q: term, gestor: agent, promesa: promise }),
    placeholderData: keepPreviousData,
  })
  const agents = useQuery({ queryKey: ['agents'], queryFn: listAgents, enabled: canAssign })
  const data = tray.data
  const toggle = (number: string) =>
    setSelected((current) =>
      current.includes(number) ? current.filter((n) => n !== number) : [...current, number],
    )
  return (
    <>
      <PageHeader
        title="Atrasos"
        subtitle="Préstamos en atraso por tramo. Mora y días se recalculan cada noche y en cada cobro."
      />
      {hasRole(me, ACCESS.writeOff) ? <WriteOffSuggestions /> : null}
      {/* On a phone the buckets slide sideways; from a tablet up they sit in a row. */}
      <div
        role="tablist"
        aria-label="Tramos"
        className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0 sm:pb-0"
      >
        {Object.entries(BUCKETS).map(([key, label], index) => {
          const info = data?.buckets.find((b) => b.key === key)
          const on = bucket === key
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => {
                setBucket(key)
                setSelected([])
              }}
              className={`press relative w-[8.5rem] shrink-0 overflow-hidden rounded-card border p-3.5 pl-4 text-left shadow-sm sm:w-auto outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                on
                  ? 'border-brand-700 bg-brand-50 ring-1 ring-inset ring-brand-700'
                  : 'border-edge bg-surface hover:border-muted/40'
              }`}
            >
              {/* The stripe darkens with the age of the debt. */}
              <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${SEVERITY[index]}`} />
              <div className="text-[12.5px] font-medium text-muted">{label}</div>
              <div className="mt-0.5 font-display text-[22px] font-bold leading-tight tabular-nums">
                {info?.count ?? '—'}
              </div>
              <div className="text-[12px] text-muted tabular-nums">
                {info ? rd(info.principal) : ''}
              </div>
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[14rem] flex-1">
          <SearchInput
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por número o cliente…"
          />
        </div>
        <Select
          aria-label="Gestor"
          className="!w-auto"
          value={agent}
          onChange={(e) => setAgent(e.target.value)}
        >
          <option value="">Todos los gestores</option>
          {canManage ? <option value="mios">Mis préstamos</option> : null}
          {agents.data?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Promesa"
          className="!w-auto"
          value={promise}
          onChange={(e) => setPromise(e.target.value)}
        >
          <option value="">Con y sin promesa</option>
          <option value="con">Con promesa pendiente</option>
          <option value="sin">Sin promesa</option>
        </Select>
      </div>
      {tray.isPending ? (
        <Spinner />
      ) : data?.results.length ? (
        <>
          {canAssign && selected.length ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-brand-950 px-4 py-2.5 text-[13px] text-on-forest shadow-sm">
              <span className="font-semibold">
                {plural(selected.length, 'préstamo seleccionado', 'préstamos seleccionados')}
              </span>
              <span className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelected([])}
                  className="press h-8 rounded-lg px-3 text-[13px] font-semibold text-brand-200 hover:bg-white/10 hover:text-on-forest"
                >
                  Quitar selección
                </button>
                <button
                  type="button"
                  onClick={() => setAssigning(true)}
                  className="press press-down h-8 rounded-lg bg-forest-accent px-3 text-[13px] font-semibold text-on-forest-accent"
                >
                  Asignar gestor
                </button>
              </span>
            </div>
          ) : null}
          <Table
            label={`Préstamos en ${BUCKETS[data.selected]}`}
            columns="minmax(0,1.5fr) minmax(0,1fr) 8.5rem 15rem"
            head={[
              { label: 'Cliente y préstamo' },
              { label: 'Última gestión' },
              { label: 'Vencido con mora', align: 'right' },
              { label: '' },
            ]}
            footer={
              <>
                <span>
                  {plural(data.totals.count, 'préstamo')} en {BUCKETS[data.selected]}
                </span>
                <span className="tabular-nums">Capital {rd(data.totals.principal)}</span>
              </>
            }
          >
            {data.results.map((row) => (
              <li
                key={row.number}
                className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 text-[13px] md:grid md:grid-cols-[var(--cols)] md:px-5 ${
                  selected.includes(row.number) ? 'bg-brand-50' : ''
                }`}
              >
                <div className="flex min-w-0 basis-full items-center gap-3 md:basis-auto">
                  {canAssign ? (
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar ${row.number}`}
                      checked={selected.includes(row.number)}
                      onChange={() => toggle(row.number)}
                      className="size-4 shrink-0 accent-brand-700"
                    />
                  ) : null}
                  <Avatar name={row.customer_name} size="sm" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link
                        to="/prestamos/$numero"
                        params={{ numero: row.number }}
                        className="font-semibold hover:text-brand-700 hover:underline"
                      >
                        {row.customer_name}
                      </Link>
                      <Badge tone={row.days_past_due > 30 ? 'danger' : 'warning'} dot>
                        {plural(row.days_past_due, 'día')}
                      </Badge>
                      {row.promise ? (
                        <Badge tone="gold">
                          Promesa {rd(row.promise.amount)} · {day(row.promise.on)}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-[12px] text-muted">
                      <span className="tabular-nums">{row.number}</span> · gestor{' '}
                      {row.agent_name ?? 'sin asignar'} ·{' '}
                      {row.last_payment_on
                        ? `último pago ${day(row.last_payment_on)}`
                        : 'sin pagos'}
                    </div>
                  </div>
                </div>
                <div className="min-w-0 text-[12.5px] text-muted">
                  {row.last_action ? (
                    <>
                      <span className="text-ink">{row.last_action.result}</span>
                      <span> · {day(row.last_action.at.slice(0, 10))}</span>
                    </>
                  ) : (
                    'Sin gestiones'
                  )}
                </div>
                <div className="whitespace-nowrap font-semibold tabular-nums text-danger-600 md:text-right">
                  {rd(row.overdue)}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 md:flex-nowrap md:justify-end">
                  {row.customer_phone ? (
                    <a
                      href={`tel:${row.customer_phone}`}
                      className={buttonClass('ghost', '', 'sm')}
                      title={phoneText(row.customer_phone)}
                    >
                      Llamar
                    </a>
                  ) : null}
                  {canManage ? (
                    <Button variant="secondary" size="sm" onClick={() => setActing(row)}>
                      Gestión
                    </Button>
                  ) : null}
                  {canCollect ? (
                    <Link
                      to="/cobrar/$numero"
                      params={{ numero: row.number }}
                      className={buttonClass('soft', '', 'sm')}
                    >
                      Cobrar
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </Table>
          {data.totals.count > data.results.length ? (
            <p className="text-[12.5px] text-muted">
              Se muestran los {data.results.length} con más atraso; usa la búsqueda para encontrar
              los demás.
            </p>
          ) : null}
        </>
      ) : (
        <EmptyState>Ningún préstamo en este tramo con esos filtros.</EmptyState>
      )}
      {acting ? (
        <ActionDialog
          loanNumber={acting.number}
          customerName={acting.customer_name}
          suggestedAmount={acting.overdue}
          onClose={() => setActing(null)}
        />
      ) : null}
      {assigning ? (
        <AssignDialog
          loans={selected}
          onClose={(changed) => {
            setAssigning(false)
            if (changed) setSelected([])
          }}
        />
      ) : null}
    </>
  )
}

function AssignDialog({
  loans,
  onClose,
}: {
  loans: string[]
  onClose: (changed: boolean) => void
}) {
  const refresh = useRefreshCollections()
  const agents = useQuery({ queryKey: ['agents'], queryFn: listAgents })
  const [agent, setAgent] = useState('')
  const [note, setNote] = useState('')
  const save = useMutation({
    meta: { inlineError: true },
    mutationFn: () => assignAgent({ loans, agent: agent === 'none' ? null : agent, note }),
    onSuccess: (result) => {
      notify(`Gestor asignado a ${plural(result.changed, 'préstamo')}.`, 'success')
      refresh()
      onClose(true)
    },
  })
  return (
    <Modal onClose={() => onClose(false)} labelledBy="assign-title">
      <div className="w-full max-w-md space-y-3 rounded-2xl bg-surface p-5 shadow-xl">
        <h2 id="assign-title" className="text-lg font-semibold">
          Asignar gestor a {plural(loans.length, 'préstamo')}
        </h2>
        <Field label="Gestor">
          <Select value={agent} onChange={(e) => setAgent(e.target.value)}>
            <option value="">Elegir…</option>
            <option value="none">Sin gestor (lo gestiona el cobrador)</option>
            {agents.data?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.roles.join(', ')}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Motivo (queda en el historial)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {save.error instanceof ApiError ? (
          <Alert tone="danger">{errorMessage(save.error.data)}</Alert>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onClose(false)}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} disabled={!agent || save.isPending}>
            Asignar
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** F13 (decision 094): past the company's days late, the system suggests
 * writing the loan off; the manager decides from the loan's file. */
function WriteOffSuggestions() {
  const suggested = useQuery({
    queryKey: ['write-off-suggestions'],
    queryFn: listWriteOffSuggestions,
  })
  if (!suggested.data?.length) return null
  return (
    <Card className="space-y-2 border-danger-600/30">
      <h2 className="text-base font-semibold">Sugeridos para castigar</h2>
      <p className="text-[12.5px] text-muted">
        Superan los días de atraso que fijaste en Ajustes. Ábrelos y decide desde «Más» → Castigar.
      </p>
      <ul className="divide-y divide-edge text-sm">
        {suggested.data.map((row) => (
          <li key={row.number} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
            <Link
              to="/prestamos/$numero"
              params={{ numero: row.number }}
              className="font-semibold text-brand-700 hover:underline"
            >
              {row.number}
            </Link>
            <span className="min-w-0 flex-1 truncate">{row.customer}</span>
            <span className="tabular-nums text-muted">{row.days_past_due} días</span>
            <span className="tabular-nums">{rd(row.principal_outstanding)}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
