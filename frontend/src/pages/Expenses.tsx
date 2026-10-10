import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import type { Me } from '../api/accounts'
import { ApiError } from '../api/client'
import {
  attachExpenseFiles,
  decideExpense,
  expenseFileUrl,
  type ExpenseFilters,
  type ExpenseKind,
  getExpense,
  listExpenses,
  updateExpense,
} from '../api/expenses'
import { usePrompt } from '../components/Dialog'
import { ExpenseDialog } from '../components/ExpenseDialog'
import { Modal } from '../components/Modal'
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Pagination,
  RowList,
  SearchInput,
  Select,
  Spinner,
  Stat,
  Tabs,
} from '../components/ui'
import { day, errorMessage, moment, rd, plural } from '../lib/format'
import { useDebounced } from '../lib/hooks'
import { ACCESS, hasRole } from '../lib/roles'
import { notify } from '../lib/toast'
import { DateInput } from '../components/DateInput'

const STATUS_TONE: Record<string, string> = {
  pending: 'warning',
  posted: 'success',
  rejected: 'neutral',
  voided: 'danger',
}

/** P54 · Gastos e ingresos (F15, decision 081). */
export function ExpensesPage({ me }: { me: Me }) {
  const [kind, setKind] = useState<'' | ExpenseKind>('')
  const [filters, setFilters] = useState<ExpenseFilters>({})
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState<ExpenseKind | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const term = useDebounced(q.trim(), 300)
  const query = { ...filters, tipo: kind || undefined, q: term || undefined, page }
  const list = useQuery({
    queryKey: ['expenses', query],
    queryFn: () => listExpenses(query),
    placeholderData: keepPreviousData,
  })
  const canRegister = hasRole(me, ACCESS.registerExpenses)
  const data = list.data
  const set = (change: ExpenseFilters) => {
    setFilters({ ...filters, ...change })
    setPage(1)
  }
  return (
    <>
      <PageHeader
        title="Gastos e ingresos"
        subtitle="Con su comprobante y NCF. Lo que supera tu límite espera la aprobación de otra persona."
        actions={
          canRegister ? (
            <>
              <Button variant="secondary" onClick={() => setCreating('income')}>
                Nuevo ingreso
              </Button>
              <Button onClick={() => setCreating('expense')}>Nuevo gasto</Button>
            </>
          ) : null
        }
      />
      <Tabs
        tabs={[
          ['', 'Todos'],
          ['expense', 'Gastos'],
          ['income', 'Ingresos'],
        ]}
        value={kind}
        onChange={(value) => {
          setKind(value)
          setPage(1)
        }}
      />
      <div className="grid items-end gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_11rem_10rem_10rem]">
        <SearchInput
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por número, descripción, proveedor o NCF…"
        />
        <Select
          aria-label="Estado"
          value={filters.estado ?? ''}
          onChange={(e) => set({ estado: e.target.value || undefined })}
        >
          <option value="">Todos los estados</option>
          <option value="pending">Por aprobar</option>
          <option value="posted">Registrados</option>
          <option value="rejected">Rechazados</option>
          <option value="voided">Anulados</option>
        </Select>
        {/* A bare date box reads «dd/mm/aaaa»: the label says which end it is. */}
        <Field label="Desde">
          <DateInput
            value={filters.desde ?? ''}
            onChange={(date) => set({ desde: date || undefined })}
          />
        </Field>
        <Field label="Hasta">
          <DateInput
            value={filters.hasta ?? ''}
            onChange={(date) => set({ hasta: date || undefined })}
          />
        </Field>
      </div>
      {data ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Stat label="Gastos registrados" value={rd(data.totals.expense)} />
          <Stat label="Ingresos registrados" value={rd(data.totals.income)} />
          <Stat label="Por aprobar" value={String(data.totals.pending)} />
        </div>
      ) : null}
      {list.isPending ? (
        <Spinner />
      ) : data?.results.length ? (
        <>
          <RowList>
            {data.results.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setOpen(row.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-2"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold tabular-nums">{row.number}</span>
                      <span className="text-sm">{row.description}</span>
                      <Badge tone={STATUS_TONE[row.status]}>{row.status_label}</Badge>
                      {row.nature === 'owner' ? <Badge tone="info">Del dueño</Badge> : null}
                    </div>
                    <div className="text-[12.5px] text-muted">
                      {day(row.date)} · {row.category_name} ·{' '}
                      {row.from_drawer ? 'caja del cajero' : row.account_name}
                      {row.party_name ? ` · ${row.party_name}` : ''}
                      {row.ncf ? ` · NCF ${row.ncf}` : ''}
                      {row.files ? ` · ${plural(row.files, 'comprobante')}` : ''}
                    </div>
                  </div>
                  <span
                    className={`font-bold tabular-nums ${row.kind === 'income' ? 'text-success-600' : ''}`}
                  >
                    {row.kind === 'income' ? '+' : '−'}
                    {rd(row.amount)}
                  </span>
                </button>
              </li>
            ))}
          </RowList>
          <Pagination page={page} count={data.count} onChange={setPage} />
        </>
      ) : (
        <EmptyState>Sin gastos ni ingresos con esos filtros.</EmptyState>
      )}
      {creating ? <ExpenseDialog kind={creating} onClose={() => setCreating(null)} /> : null}
      {open ? <ExpenseDetailDialog id={open} onClose={() => setOpen(null)} /> : null}
    </>
  )
}

function ExpenseDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [dialog, ask] = usePrompt()
  const fileInput = useRef<HTMLInputElement>(null)
  const detail = useQuery({ queryKey: ['expense', id], queryFn: () => getExpense(id) })
  const [ncf, setNcf] = useState<string | null>(null)
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['expenses'] })
    void queryClient.invalidateQueries({ queryKey: ['expense', id] })
  }
  const decide = useMutation({
    meta: { inlineError: true },
    mutationFn: async (verb: 'aprobar' | 'rechazar' | 'anular') => {
      const note = await ask({
        title:
          verb === 'aprobar'
            ? 'Aprobar y registrar'
            : verb === 'rechazar'
              ? 'Rechazar el gasto'
              : 'Anular con asiento inverso',
        label: verb === 'aprobar' ? 'Nota (opcional)' : 'Motivo',
        type: 'textarea',
        required: verb !== 'aprobar',
        danger: verb !== 'aprobar',
        confirmText: verb === 'aprobar' ? 'Aprobar' : verb === 'rechazar' ? 'Rechazar' : 'Anular',
      })
      return note === null ? null : decideExpense(id, verb, note)
    },
    onSuccess: (result) => {
      if (!result) return
      notify(`${result.number}: ${result.status_label.toLowerCase()}.`, 'success')
      refresh()
    },
  })
  const saveNcf = useMutation({
    meta: { inlineError: true },
    mutationFn: () => updateExpense(id, { ncf: ncf ?? '' }),
    onSuccess: () => {
      setNcf(null)
      refresh()
    },
  })
  const attach = useMutation({
    meta: { inlineError: true },
    mutationFn: (files: File[]) => attachExpenseFiles(id, files),
    onSuccess: refresh,
  })
  const data = detail.data
  const error = [decide.error, saveNcf.error, attach.error].find((e) => e instanceof ApiError)
  return (
    <Modal onClose={onClose} labelledBy="expense-detail-title">
      <div className="max-h-[92vh] w-full max-w-xl space-y-3 overflow-y-auto rounded-xl bg-surface p-5 shadow-xl">
        {dialog}
        {!data ? (
          <Spinner />
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 id="expense-detail-title" className="text-lg font-semibold">
                  {data.kind_label} {data.number}
                </h2>
                <p className="text-sm">{data.description}</p>
              </div>
              <Badge tone={STATUS_TONE[data.status]}>{data.status_label}</Badge>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <dt className="text-muted">Monto</dt>
                <dd className="font-semibold tabular-nums">{rd(data.amount)}</dd>
              </div>
              <div>
                <dt className="text-muted">Fecha</dt>
                <dd>{day(data.date)}</dd>
              </div>
              <div>
                <dt className="text-muted">Categoría</dt>
                <dd>{data.category_name}</dd>
              </div>
              <div>
                <dt className="text-muted">{data.kind === 'expense' ? 'Salió de' : 'Entró a'}</dt>
                <dd>
                  {data.from_drawer ? 'Caja del cajero' : data.account_name} · {data.method_label}
                </dd>
              </div>
              <div>
                <dt className="text-muted">{data.kind === 'expense' ? 'Proveedor' : 'Pagó'}</dt>
                <dd>
                  {data.party_name || '—'}
                  {data.party_document ? ` · ${data.party_document}` : ''}
                </dd>
              </div>
              {data.kind === 'expense' ? (
                <div>
                  <dt className="text-muted">ITBIS incluido</dt>
                  <dd className="tabular-nums">{rd(data.itbis)}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-muted">Asiento</dt>
                <dd className="tabular-nums">
                  {data.entry_number ?? '—'}
                  {data.void_entry_number ? ` · anulado en ${data.void_entry_number}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Registró</dt>
                <dd>{data.created_by_name}</dd>
              </div>
            </dl>
            {data.kind === 'expense' && data.status !== 'voided' ? (
              <div className="flex items-end gap-2">
                <Field label="NCF">
                  <Input
                    value={ncf ?? data.ncf}
                    onChange={(e) => setNcf(e.target.value.toUpperCase())}
                  />
                </Field>
                {ncf !== null && ncf !== data.ncf ? (
                  <Button variant="secondary" onClick={() => saveNcf.mutate()}>
                    Guardar NCF
                  </Button>
                ) : null}
              </div>
            ) : null}
            {data.decision_note || data.void_reason ? (
              <Alert tone={data.status === 'voided' ? 'danger' : 'info'}>
                {data.void_reason
                  ? `Anulado por ${data.voided_by_name}: ${data.void_reason}`
                  : `${data.decided_by_name}: ${data.decision_note}`}
              </Alert>
            ) : null}
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">Comprobantes</h3>
              {data.files.length ? (
                <ul className="text-sm">
                  {data.files.map((file) => (
                    <li key={file.id}>
                      <a
                        href={expenseFileUrl(file.id)}
                        target="_blank"
                        rel="noopener"
                        className="text-brand-700 hover:underline"
                      >
                        {file.name}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Sin comprobantes adjuntos.</p>
              )}
              {data.status === 'posted' || data.status === 'pending' ? (
                <>
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    accept="application/pdf,image/jpeg,image/png,image/heic"
                    className="hidden"
                    onChange={(e) => attach.mutate(Array.from(e.target.files ?? []))}
                  />
                  <Button
                    variant="secondary"
                    className="!h-8"
                    onClick={() => fileInput.current?.click()}
                  >
                    Adjuntar
                  </Button>
                </>
              ) : null}
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer text-muted">Historial de cambios</summary>
              <ul className="mt-1 space-y-1">
                {data.history.map((event, index) => (
                  <li key={index} className="text-[12.5px] text-muted">
                    {moment(event.at)} · {event.status} · {event.description}
                    {event.ncf ? ` · NCF ${event.ncf}` : ''}
                  </li>
                ))}
              </ul>
            </details>
            {error instanceof ApiError ? (
              <Alert tone="danger">{errorMessage(error.data)}</Alert>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              {data.can_decide ? (
                <>
                  <Button variant="secondary" onClick={() => decide.mutate('rechazar')}>
                    Rechazar
                  </Button>
                  <Button onClick={() => decide.mutate('aprobar')}>Aprobar</Button>
                </>
              ) : null}
              {data.can_void ? (
                <Button variant="secondary" onClick={() => decide.mutate('anular')}>
                  Anular
                </Button>
              ) : null}
              <Button variant="secondary" onClick={onClose}>
                Cerrar
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
