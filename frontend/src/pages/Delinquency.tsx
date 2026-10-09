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
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  RowList,
  SearchInput,
  Select,
  Spinner,
  Stat,
} from '../components/ui'
import { day, errorMessage, phoneText, rd, plural } from '../lib/format'
import { useDebounced } from '../lib/hooks'
import { ACCESS, hasRole } from '../lib/roles'
import { notify } from '../lib/toast'

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
      <div role="tablist" aria-label="Tramos" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {Object.entries(BUCKETS).map(([key, label]) => {
          const info = data?.buckets.find((b) => b.key === key)
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={bucket === key}
              onClick={() => {
                setBucket(key)
                setSelected([])
              }}
              className={`rounded-xl border p-3 text-left shadow-sm ${
                bucket === key
                  ? 'border-brand-700 bg-brand-100'
                  : 'border-edge bg-surface hover:bg-surface-2'
              }`}
            >
              <div className="text-[12.5px] text-muted">{label}</div>
              <div className="text-lg font-bold tabular-nums">{info?.count ?? '—'}</div>
              <div className="text-[12px] text-muted tabular-nums">
                {info ? rd(info.principal) : ''}
              </div>
            </button>
          )
        })}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_14rem_12rem]">
        <SearchInput
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por número o cliente…"
        />
        <Select aria-label="Gestor" value={agent} onChange={(e) => setAgent(e.target.value)}>
          <option value="">Todos los gestores</option>
          {canManage ? <option value="mios">Mis préstamos</option> : null}
          {agents.data?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Promesa" value={promise} onChange={(e) => setPromise(e.target.value)}>
          <option value="">Con y sin promesa</option>
          <option value="con">Con promesa pendiente</option>
          <option value="sin">Sin promesa</option>
        </Select>
      </div>
      {tray.isPending ? (
        <Spinner />
      ) : data?.results.length ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat
              label={`Préstamos en ${BUCKETS[data.selected]}`}
              value={String(data.totals.count)}
            />
            <Stat label="Capital de estos préstamos" value={rd(data.totals.principal)} emphasis />
          </div>
          {canAssign && selected.length ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-700/40 bg-brand-100 px-4 py-2 text-sm">
              <span>
                {plural(selected.length, 'préstamo seleccionado', 'préstamos seleccionados')}
              </span>
              <span className="flex gap-2">
                <Button variant="secondary" className="!h-9" onClick={() => setSelected([])}>
                  Quitar selección
                </Button>
                <Button className="!h-9" onClick={() => setAssigning(true)}>
                  Asignar gestor
                </Button>
              </span>
            </div>
          ) : null}
          <RowList>
            {data.results.map((row) => (
              <li
                key={row.number}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 items-start gap-3">
                  {canAssign ? (
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar ${row.number}`}
                      checked={selected.includes(row.number)}
                      onChange={() => toggle(row.number)}
                      className="mt-1 h-4 w-4 accent-brand-700"
                    />
                  ) : null}
                  <div className="min-w-0 space-y-0.5">
                    <div>
                      <Link
                        to="/prestamos/$numero"
                        params={{ numero: row.number }}
                        className="font-semibold tabular-nums text-brand-700 hover:underline"
                      >
                        {row.number}
                      </Link>{' '}
                      <span className="text-sm">{row.customer_name}</span>{' '}
                      {row.promise ? (
                        <Badge tone="info">
                          Promesa {rd(row.promise.amount)} · {day(row.promise.on)}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="text-[12.5px] text-muted">
                      {row.days_past_due} días · gestor {row.agent_name ?? 'sin asignar'} ·{' '}
                      {row.last_payment_on
                        ? `último pago ${day(row.last_payment_on)}`
                        : 'sin pagos'}
                    </div>
                    <div className="text-[12.5px] text-muted">
                      {row.last_action
                        ? `Última gestión ${day(row.last_action.at.slice(0, 10))}: ${row.last_action.result}`
                        : 'Sin gestiones'}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="mr-1 text-right">
                    <div className="font-bold tabular-nums text-danger-600">{rd(row.overdue)}</div>
                    <div className="text-[12px] text-muted">vencido con mora</div>
                  </div>
                  {row.customer_phone ? (
                    <a
                      href={`tel:${row.customer_phone}`}
                      className={buttonClass('secondary', '!h-9 !px-3')}
                      title={phoneText(row.customer_phone)}
                    >
                      Llamar
                    </a>
                  ) : null}
                  {canManage ? (
                    <Button
                      variant="secondary"
                      className="!h-9 !px-3"
                      onClick={() => setActing(row)}
                    >
                      Gestión
                    </Button>
                  ) : null}
                  {canCollect ? (
                    <Link
                      to="/cobrar/$numero"
                      params={{ numero: row.number }}
                      className={buttonClass('primary', '!h-9 !px-3')}
                    >
                      Cobrar
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </RowList>
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
      <div className="w-full max-w-md space-y-3 rounded-xl bg-surface p-5 shadow-xl">
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
