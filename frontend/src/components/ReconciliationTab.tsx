import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import {
  autoMatch,
  closeReconciliation,
  getReconciliation,
  importStatement,
  listChart,
  type Reconciliation,
  startReconciliation,
  statementLineAction,
} from '../api/accounting'
import { api, ApiError } from '../api/client'
import { amountValue, day, errorMessage, plural, rd, todayISO } from '../lib/format'
import { notify } from '../lib/toast'
import { Alert, Badge, Button, Card, Field, Input, MonthInput, Select, Spinner, Stat } from './ui'

interface Bank {
  id: string
  name: string
  kind: string
  account_number_last4: string
}

const listBanks = (): Promise<Bank[]> => api('/api/v1/cuentas/?kind=bank')

/** F15 · Conciliación bancaria (decision 083): the statement against the
 * bank's book movements; the month closes when nothing is left over. */
export function ReconciliationTab({ canWork }: { canWork: boolean }) {
  const banks = useQuery({ queryKey: ['banks'], queryFn: listBanks })
  const [bank, setBank] = useState('')
  const [month, setMonth] = useState(() => todayISO().slice(0, 7))
  const [closing, setClosing] = useState('')
  const [current, setCurrent] = useState<string | null>(null)
  const start = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      startReconciliation({
        account: bank || banks.data?.[0]?.id || '',
        year: Number(month.slice(0, 4)),
        month: Number(month.slice(5, 7)),
        statement_closing: closing.replace(/,/g, '') || '0',
      }),
    onSuccess: (result) => setCurrent(result.id),
  })
  if (banks.isPending) return <Spinner />
  if (!banks.data?.length)
    return (
      <Alert tone="info">
        No hay cuentas de banco: créalas en «Cuentas y bancos» para conciliarlas.
      </Alert>
    )
  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Banco">
            <Select value={bank} onChange={(e) => setBank(e.target.value)}>
              {banks.data.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.account_number_last4 ? ` ••${b.account_number_last4}` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Mes">
            <MonthInput value={month} onChange={setMonth} />
          </Field>
          <Field label="Saldo final del extracto (RD$)">
            <Input
              inputMode="decimal"
              value={closing}
              onChange={(e) => setClosing(e.target.value)}
            />
          </Field>
          <div className="flex items-end">
            <Button
              className="w-full"
              onClick={() => start.mutate()}
              disabled={!canWork || start.isPending}
            >
              Abrir la conciliación
            </Button>
          </div>
        </div>
        {start.error instanceof ApiError ? (
          <Alert tone="danger">{errorMessage(start.error.data)}</Alert>
        ) : null}
      </Card>
      {current ? <ReconciliationView id={current} canWork={canWork} /> : null}
    </div>
  )
}

function ReconciliationView({ id, canWork }: { id: string; canWork: boolean }) {
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const query = useQuery({ queryKey: ['reconciliation', id], queryFn: () => getReconciliation(id) })
  const chart = useQuery({ queryKey: ['chart'], queryFn: listChart })
  const set = (data: Reconciliation) => queryClient.setQueryData(['reconciliation', id], data)
  const run = useMutation({
    meta: { inlineError: true },
    mutationFn: (action: () => Promise<Reconciliation>) => action(),
    onSuccess: (data) => {
      set(data)
      if (data.imported)
        notify(
          `Extracto importado: ${plural(data.imported.added, 'línea nueva', 'líneas nuevas')}, ${plural(data.imported.skipped, 'repetida')}.`,
          'success',
        )
      if (data.matched !== undefined)
        notify(`${plural(data.matched, 'línea emparejada', 'líneas emparejadas')}.`, 'success')
      if (data.status === 'closed') notify('Mes conciliado.', 'success')
      void queryClient.invalidateQueries({ queryKey: ['chart'] })
    },
  })
  const data = query.data
  if (!data) return <Spinner />
  const open = data.status === 'draft' && canWork
  const summary = data.summary
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">
          {data.account_name} · {String(data.month).padStart(2, '0')}/{data.year}
        </h2>
        <Badge tone={data.status === 'closed' ? 'success' : 'warning'}>{data.status_label}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        <Stat label="Saldo en el libro" value={rd(summary.book_balance)} />
        <Stat label="En tránsito" value={rd(summary.in_transit)} />
        <Stat label="El banco debería decir" value={rd(summary.expected_statement)} />
        <Stat label="El extracto dice" value={rd(summary.statement_closing)} />
        <Stat
          label="Diferencia"
          value={rd(summary.difference)}
          danger={Number(summary.difference) !== 0}
        />
      </div>
      {open ? (
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.xlsx,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) run.mutate(() => importStatement(id, file))
              e.target.value = ''
            }}
          />
          <Button variant="secondary" onClick={() => fileInput.current?.click()}>
            Importar extracto (CSV o Excel)
          </Button>
          <Button variant="secondary" onClick={() => run.mutate(() => autoMatch(id))}>
            Emparejar automático
          </Button>
          <Button
            onClick={() => run.mutate(() => closeReconciliation(id))}
            disabled={!summary.can_close}
          >
            Cerrar conciliación
          </Button>
        </div>
      ) : null}
      {run.error instanceof ApiError ? (
        <Alert tone="danger">{errorMessage(run.error.data)}</Alert>
      ) : null}
      <Card className="space-y-2">
        <h3 className="text-sm font-semibold">
          Extracto{' '}
          <span className="font-normal text-muted">
            ({summary.unmatched_statement} sin emparejar)
          </span>
        </h3>
        {data.lines.length ? (
          <ul className="divide-y divide-edge text-sm">
            {data.lines.map((line) => (
              <li key={line.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <span className="tabular-nums">{day(line.date)}</span> · {line.description}
                  {line.reference ? <span className="text-muted"> · {line.reference}</span> : null}
                  <div className="text-[12.5px] text-muted">
                    {line.matched
                      ? `Emparejada con ${line.matched.entry}: ${line.matched.description}`
                      : 'Sin emparejar'}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`font-semibold tabular-nums ${Number(line.amount) > 0 ? 'text-success-600' : ''}`}
                  >
                    {rd(line.amount)}
                  </span>
                  {open && line.matched ? (
                    <Button
                      variant="secondary"
                      className="!h-8"
                      onClick={() =>
                        run.mutate(() => statementLineAction(id, line.id, 'desemparejar'))
                      }
                    >
                      Deshacer
                    </Button>
                  ) : null}
                  {open && !line.matched ? (
                    <LineActions
                      amount={line.amount}
                      candidates={data.in_transit.filter((b) => b.amount === line.amount)}
                      accounts={(chart.data ?? []).filter(
                        (a) =>
                          a.is_active &&
                          !a.financial &&
                          a.type === (Number(line.amount) < 0 ? 'expense' : 'income'),
                      )}
                      onMatch={(book) =>
                        run.mutate(() => statementLineAction(id, line.id, 'emparejar', { book }))
                      }
                      onBook={(counterpart) =>
                        run.mutate(() =>
                          statementLineAction(id, line.id, 'registrar', { counterpart }),
                        )
                      }
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            Importa el extracto del banco: columnas de fecha, descripción y monto (o débito y
            crédito).
          </p>
        )}
      </Card>
      <Card className="space-y-2">
        <h3 className="text-sm font-semibold">Movimientos del libro que el banco no muestra</h3>
        {data.in_transit.length ? (
          <ul className="divide-y divide-edge text-sm">
            {data.in_transit.map((book) => (
              <li key={book.id} className="flex justify-between gap-2 py-1.5">
                <span>
                  <span className="tabular-nums">{day(book.date)}</span> · {book.entry} ·{' '}
                  {book.description}
                </span>
                <span className="tabular-nums">{rd(book.amount)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nada en tránsito.</p>
        )}
      </Card>
    </div>
  )
}

function LineActions({
  amount,
  candidates,
  accounts,
  onMatch,
  onBook,
}: {
  amount: string
  candidates: { id: string; entry: string; date: string }[]
  accounts: { id: string; code: string; name: string }[]
  onMatch: (book: string) => void
  onBook: (account: string) => void
}) {
  const [choice, setChoice] = useState('')
  return (
    <span className="flex items-center gap-1">
      <Select
        aria-label="Emparejar o registrar"
        className="!h-8 !w-56 !text-[12.5px]"
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
      >
        <option value="">Elegir…</option>
        {candidates.length ? (
          <optgroup label="Emparejar con">
            {candidates.map((b) => (
              <option key={b.id} value={`book:${b.id}`}>
                {b.entry} · {day(b.date)}
              </option>
            ))}
          </optgroup>
        ) : null}
        <optgroup
          label={amountValue(amount) < 0 ? 'Registrar como gasto en' : 'Registrar como ingreso en'}
        >
          {accounts.map((a) => (
            <option key={a.id} value={`account:${a.id}`}>
              {a.code} {a.name}
            </option>
          ))}
        </optgroup>
      </Select>
      <Button
        variant="secondary"
        className="!h-8"
        disabled={!choice}
        onClick={() => {
          const [kind, value] = choice.split(':')
          if (kind === 'book') onMatch(value)
          else onBook(value)
        }}
      >
        Aplicar
      </Button>
    </span>
  )
}
