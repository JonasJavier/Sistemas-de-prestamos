import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

import { listBranches, type Me } from '../api/accounts'
import {
  ACCOUNT_TYPES,
  type AccountType,
  type ChartAccount,
  createChartAccount,
  getAccountLedger,
  getBalanceSheet,
  getIncomeStatement,
  getJournal,
  getTrialBalance,
  listChart,
  postManualEntry,
  type Range,
  type Section,
} from '../api/accounting'
import { ApiError } from '../api/client'
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
  Pagination,
  Select,
  Spinner,
  Tabs,
} from '../components/ui'
import { day, errorMessage, rd, todayISO } from '../lib/format'
import { printArea } from '../lib/print'
import { notify } from '../lib/toast'

type Tab = 'cuentas' | 'diario' | 'mayor' | 'balanza' | 'resultados' | 'balance'

const TABS = [
  ['cuentas', 'Plan de cuentas'],
  ['diario', 'Diario'],
  ['mayor', 'Mayor'],
  ['balanza', 'Balanza'],
  ['resultados', 'Resultados'],
  ['balance', 'Balance'],
] as const

const firstOfMonth = () => `${todayISO().slice(0, 8)}01`
const amount = (value: string) => (Number(value) ? rd(value) : '')

/** P56 · Contabilidad: the chart and the books read from the immutable
 * ledger, so they agree with it to the cent (decision 080). */
export function AccountingPage({ me }: { me: Me }) {
  const [tab, setTab] = useState<Tab>('cuentas')
  const [range, setRange] = useState<Range>(() => ({ desde: firstOfMonth(), hasta: todayISO() }))
  const [ledgerAccount, setLedgerAccount] = useState('')
  const branches = useQuery({ queryKey: ['branches'], queryFn: listBranches })
  const isManager = me.roles.includes('Gerente')
  const canEditChart = isManager || me.roles.includes('Contabilidad')
  const showRange = tab !== 'cuentas' && tab !== 'balance'
  return (
    <>
      <PageHeader
        title="Contabilidad"
        subtitle="Plan de cuentas y libros, leídos directo del libro de movimientos."
        actions={
          tab === 'resultados' || tab === 'balance' || tab === 'balanza' ? (
            <Button variant="secondary" onClick={() => printArea('letter')}>
              Imprimir
            </Button>
          ) : null
        }
      />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab !== 'cuentas' ? (
        <div className="flex flex-wrap items-end gap-3">
          {showRange ? (
            <>
              <Field label="Desde">
                <Input
                  type="date"
                  value={range.desde}
                  onChange={(e) => setRange({ ...range, desde: e.target.value })}
                />
              </Field>
              <Field label="Hasta">
                <Input
                  type="date"
                  value={range.hasta}
                  onChange={(e) => setRange({ ...range, hasta: e.target.value })}
                />
              </Field>
            </>
          ) : (
            <Field label="Al día">
              <Input
                type="date"
                value={range.hasta}
                onChange={(e) => setRange({ ...range, hasta: e.target.value })}
              />
            </Field>
          )}
          <Field label="Sucursal">
            <Select
              value={range.sucursal ?? ''}
              onChange={(e) => setRange({ ...range, sucursal: e.target.value || undefined })}
            >
              <option value="">Todas</option>
              {branches.data?.results.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      ) : null}
      {tab === 'cuentas' ? (
        <ChartTab
          canEdit={canEditChart}
          onOpen={(id) => {
            setLedgerAccount(id)
            setTab('mayor')
          }}
        />
      ) : null}
      {tab === 'diario' ? <JournalTab range={range} canAdjust={isManager} /> : null}
      {tab === 'mayor' ? (
        <LedgerTab range={range} account={ledgerAccount} onAccount={setLedgerAccount} />
      ) : null}
      {tab === 'balanza' ? <TrialTab range={range} /> : null}
      {tab === 'resultados' ? <IncomeTab range={range} /> : null}
      {tab === 'balance' ? <BalanceTab range={range} /> : null}
    </>
  )
}

function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-edge text-left text-[12.5px] text-muted">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

const th = 'py-2 pr-3 font-medium'
const thNum = 'py-2 pr-3 text-right font-medium'
const td = 'py-1.5 pr-3'
const tdNum = 'py-1.5 pr-3 text-right tabular-nums'

function ChartTab({ canEdit, onOpen }: { canEdit: boolean; onOpen: (id: string) => void }) {
  const chart = useQuery({ queryKey: ['chart'], queryFn: listChart })
  const [creating, setCreating] = useState(false)
  if (chart.isPending) return <Spinner />
  const accounts = chart.data ?? []
  return (
    <div className="space-y-4">
      {canEdit ? (
        <div className="flex justify-end">
          <Button onClick={() => setCreating(true)}>Nueva cuenta</Button>
        </div>
      ) : null}
      {ACCOUNT_TYPES.map((type) => {
        const rows = accounts.filter((a) => a.type === type.value)
        if (!rows.length) return null
        return (
          <Card key={type.value} className="space-y-2">
            <h2 className="text-base font-semibold">{type.label}</h2>
            <Table
              head={
                <>
                  <th className={th}>Código</th>
                  <th className={th}>Cuenta</th>
                  <th className={thNum}>Saldo</th>
                </>
              }
            >
              {rows.map((account) => (
                <tr
                  key={account.id}
                  className="cursor-pointer border-b border-edge/60 last:border-0 hover:bg-surface-2"
                  onClick={() => onOpen(account.id)}
                >
                  <td className={`${td} tabular-nums text-muted`}>{account.code}</td>
                  <td className={td}>
                    {account.name}{' '}
                    {account.is_system ? <Badge tone="neutral">Sistema</Badge> : null}{' '}
                    {account.financial ? <Badge tone="info">Caja o banco</Badge> : null}{' '}
                    {!account.is_active ? <Badge tone="warning">Inactiva</Badge> : null}
                  </td>
                  <td className={tdNum}>{rd(account.balance)}</td>
                </tr>
              ))}
            </Table>
          </Card>
        )
      })}
      {creating ? (
        <NewAccountDialog accounts={accounts} onClose={() => setCreating(false)} />
      ) : null}
    </div>
  )
}

function NewAccountDialog({
  accounts,
  onClose,
}: {
  accounts: ChartAccount[]
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('expense')
  const [parent, setParent] = useState('')
  const save = useMutation({
    meta: { inlineError: true },
    mutationFn: () => createChartAccount({ code, name, type, parent: parent || null }),
    onSuccess: () => {
      notify('Cuenta creada.', 'success')
      void queryClient.invalidateQueries({ queryKey: ['chart'] })
      onClose()
    },
  })
  return (
    <Modal onClose={onClose} labelledBy="new-account-title">
      <div className="w-full max-w-md space-y-3 rounded-xl bg-surface p-5 shadow-xl">
        <h2 id="new-account-title" className="text-lg font-semibold">
          Nueva cuenta contable
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Código">
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="5211" />
          </Field>
          <Field label="Tipo">
            <Select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
              {ACCOUNT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Nombre">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Agrupar bajo (opcional)">
          <Select value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">Ninguna</option>
            {accounts
              .filter((a) => a.type === type)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} {a.name}
                </option>
              ))}
          </Select>
        </Field>
        {save.error instanceof ApiError ? (
          <Alert tone="danger">{errorMessage(save.error.data)}</Alert>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} disabled={!code || !name || save.isPending}>
            Crear cuenta
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function JournalTab({ range, canAdjust }: { range: Range; canAdjust: boolean }) {
  const [page, setPage] = useState(1)
  const [adjusting, setAdjusting] = useState(false)
  const journal = useQuery({
    queryKey: ['journal', range, page],
    queryFn: () => getJournal({ ...range, page }),
    placeholderData: keepPreviousData,
  })
  return (
    <div className="space-y-3">
      {canAdjust ? (
        <div className="flex justify-end">
          <Button onClick={() => setAdjusting(true)}>Ajuste contable</Button>
        </div>
      ) : null}
      {journal.isPending ? <Spinner /> : null}
      {journal.data?.results.length ? (
        <>
          {journal.data.results.map((entry) => (
            <Card key={entry.id} className="space-y-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">
                  {entry.number} · {day(entry.date)}
                </span>
                <span className="text-[12.5px] text-muted">
                  {entry.branch_name}
                  {entry.created_by_name ? ` · ${entry.created_by_name}` : ''}
                  {entry.reversal_of ? ' · reverso' : ''}
                </span>
              </div>
              <p className="text-sm">{entry.description}</p>
              <Table
                head={
                  <>
                    <th className={th}>Cuenta</th>
                    <th className={thNum}>Débito</th>
                    <th className={thNum}>Crédito</th>
                  </>
                }
              >
                {entry.lines.map((line, index) => (
                  <tr key={index} className="border-b border-edge/60 last:border-0">
                    <td className={td}>
                      <span className="tabular-nums text-muted">{line.code}</span> {line.name}
                      {line.memo ? <span className="text-muted"> · {line.memo}</span> : null}
                    </td>
                    <td className={tdNum}>{amount(line.debit)}</td>
                    <td className={tdNum}>{amount(line.credit)}</td>
                  </tr>
                ))}
              </Table>
            </Card>
          ))}
          <Pagination page={page} count={journal.data.count} onChange={setPage} />
        </>
      ) : journal.data ? (
        <EmptyState>Sin asientos en esas fechas.</EmptyState>
      ) : null}
      {adjusting ? <ManualEntryDialog onClose={() => setAdjusting(false)} /> : null}
    </div>
  )
}

interface DraftLine {
  account: string
  debit: string
  credit: string
}

function ManualEntryDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const chart = useQuery({ queryKey: ['chart'], queryFn: listChart })
  const branches = useQuery({ queryKey: ['branches'], queryFn: listBranches })
  const [date, setDate] = useState(todayISO())
  const [branch, setBranch] = useState('')
  const [description, setDescription] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([
    { account: '', debit: '', credit: '' },
    { account: '', debit: '', credit: '' },
  ])
  const num = (value: string) => Number(value.replace(/,/g, '')) || 0
  const debit = lines.reduce((sum, l) => sum + num(l.debit), 0)
  const credit = lines.reduce((sum, l) => sum + num(l.credit), 0)
  const balanced = debit > 0 && Math.abs(debit - credit) < 0.005
  const setLine = (index: number, change: Partial<DraftLine>) =>
    setLines((current) => current.map((l, i) => (i === index ? { ...l, ...change } : l)))
  const save = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      postManualEntry({
        date,
        branch: branch || branches.data?.results[0]?.id || '',
        description,
        lines: lines
          .filter((l) => l.account && (num(l.debit) || num(l.credit)))
          .map((l) => ({
            account: l.account,
            debit: String(num(l.debit)),
            credit: String(num(l.credit)),
          })),
      }),
    onSuccess: (entry) => {
      notify(`Ajuste ${entry.number} registrado.`, 'success')
      void queryClient.invalidateQueries({ queryKey: ['journal'] })
      void queryClient.invalidateQueries({ queryKey: ['chart'] })
      onClose()
    },
  })
  return (
    <Modal onClose={onClose} labelledBy="manual-title">
      <div className="max-h-[92vh] w-full max-w-2xl space-y-3 overflow-y-auto rounded-xl bg-surface p-5 shadow-xl">
        <h2 id="manual-title" className="text-lg font-semibold">
          Ajuste contable
        </h2>
        <p className="text-[12.5px] text-muted">
          Para correcciones y registros que no nacen de una operación (por ejemplo, una
          depreciación). Las cuentas con registro auxiliar (cartera, cuentas por pagar, diferencias
          de caja) solo las mueve su operación.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Fecha">
            <Input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Sucursal">
            <Select value={branch} onChange={(e) => setBranch(e.target.value)}>
              {branches.data?.results.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Motivo">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
        <div className="space-y-2">
          {lines.map((line, index) => (
            <div key={index} className="grid grid-cols-[1fr_7rem_7rem] gap-2">
              <Select
                aria-label={`Cuenta de la línea ${index + 1}`}
                value={line.account}
                onChange={(e) => setLine(index, { account: e.target.value })}
              >
                <option value="">Cuenta…</option>
                {chart.data
                  ?.filter((a) => a.is_active)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} {a.name}
                    </option>
                  ))}
              </Select>
              <Input
                aria-label={`Débito de la línea ${index + 1}`}
                inputMode="decimal"
                placeholder="Débito"
                value={line.debit}
                onChange={(e) => setLine(index, { debit: e.target.value, credit: '' })}
              />
              <Input
                aria-label={`Crédito de la línea ${index + 1}`}
                inputMode="decimal"
                placeholder="Crédito"
                value={line.credit}
                onChange={(e) => setLine(index, { credit: e.target.value, debit: '' })}
              />
            </div>
          ))}
          <Button
            variant="secondary"
            className="!h-8"
            onClick={() => setLines([...lines, { account: '', debit: '', credit: '' }])}
          >
            Agregar línea
          </Button>
        </div>
        <p className={`text-sm ${balanced ? 'text-success-600' : 'text-danger-600'}`}>
          Débitos {rd(debit)} · Créditos {rd(credit)} {balanced ? '· cuadra' : '· no cuadra'}
        </p>
        {save.error instanceof ApiError ? (
          <Alert tone="danger">{errorMessage(save.error.data)}</Alert>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!balanced || !description.trim() || save.isPending}
          >
            Registrar ajuste
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function LedgerTab({
  range,
  account,
  onAccount,
}: {
  range: Range
  account: string
  onAccount: (id: string) => void
}) {
  const chart = useQuery({ queryKey: ['chart'], queryFn: listChart })
  const ledger = useQuery({
    queryKey: ['account-ledger', account, range],
    queryFn: () => getAccountLedger(account, range),
    enabled: Boolean(account),
  })
  return (
    <div className="space-y-3">
      <Field label="Cuenta">
        <Select value={account} onChange={(e) => onAccount(e.target.value)}>
          <option value="">Elegir una cuenta…</option>
          {chart.data?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} {a.name}
            </option>
          ))}
        </Select>
      </Field>
      {ledger.isFetching && !ledger.data ? <Spinner /> : null}
      {ledger.data ? (
        <Card className="space-y-2">
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span>
              Saldo inicial <strong className="tabular-nums">{rd(ledger.data.opening)}</strong>
            </span>
            <span>
              Saldo final <strong className="tabular-nums">{rd(ledger.data.closing)}</strong>
            </span>
          </div>
          {ledger.data.rows.length ? (
            <Table
              head={
                <>
                  <th className={th}>Fecha</th>
                  <th className={th}>Asiento</th>
                  <th className={th}>Descripción</th>
                  <th className={thNum}>Débito</th>
                  <th className={thNum}>Crédito</th>
                  <th className={thNum}>Saldo</th>
                </>
              }
            >
              {ledger.data.rows.map((row, index) => (
                <tr key={index} className="border-b border-edge/60 last:border-0">
                  <td className={`${td} tabular-nums`}>{day(row.date)}</td>
                  <td className={`${td} tabular-nums text-muted`}>{row.entry}</td>
                  <td className={td}>{row.description}</td>
                  <td className={tdNum}>{amount(row.debit)}</td>
                  <td className={tdNum}>{amount(row.credit)}</td>
                  <td className={tdNum}>{rd(row.balance)}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <p className="text-sm text-muted">Sin movimientos en esas fechas.</p>
          )}
          {ledger.data.truncated ? (
            <p className="text-[12.5px] text-muted">
              Se muestran los primeros 1,000 movimientos; acorta las fechas para ver el resto.
            </p>
          ) : null}
        </Card>
      ) : null}
    </div>
  )
}

function TrialTab({ range }: { range: Range }) {
  const trial = useQuery({ queryKey: ['trial', range], queryFn: () => getTrialBalance(range) })
  if (trial.isPending) return <Spinner />
  const data = trial.data
  if (!data) return null
  return (
    <div id="print-area">
      <Card className="space-y-2">
        <ReportTitle
          title="Balanza de comprobación"
          detail={`${day(data.date_from)} al ${day(data.date_to)}`}
        />
        <Table
          head={
            <>
              <th className={th}>Cuenta</th>
              <th className={thNum}>Saldo inicial</th>
              <th className={thNum}>Débitos</th>
              <th className={thNum}>Créditos</th>
              <th className={thNum}>Saldo final</th>
            </>
          }
        >
          {data.rows.map((row) => (
            <tr key={row.id} className="border-b border-edge/60">
              <td className={td}>
                <span className="tabular-nums text-muted">{row.code}</span> {row.name}
              </td>
              <td className={tdNum}>{rd(row.opening)}</td>
              <td className={tdNum}>{amount(row.debit)}</td>
              <td className={tdNum}>{amount(row.credit)}</td>
              <td className={tdNum}>{rd(row.closing)}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className={td}>Totales del período</td>
            <td />
            <td className={tdNum}>{rd(data.totals.debit)}</td>
            <td className={tdNum}>{rd(data.totals.credit)}</td>
            <td />
          </tr>
        </Table>
      </Card>
    </div>
  )
}

function ReportTitle({ title, detail }: { title: string; detail: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-[12.5px] text-muted">{detail}</p>
    </div>
  )
}

function SectionRows({ section, sign = 1 }: { section: Section; sign?: 1 | -1 }) {
  return (
    <>
      <tr>
        <td colSpan={2} className="pt-3 pb-1 text-[12.5px] font-semibold uppercase text-muted">
          {section.title}
        </td>
      </tr>
      {section.rows.map((row) => (
        <tr key={row.id} className="border-b border-edge/60">
          <td className={td}>
            <span className="tabular-nums text-muted">{row.code}</span> {row.name}
          </td>
          <td className={tdNum}>{rd(Number(row.amount) * sign)}</td>
        </tr>
      ))}
      <tr className="font-semibold">
        <td className={td}>Total de {section.title.toLowerCase()}</td>
        <td className={tdNum}>{rd(section.total)}</td>
      </tr>
    </>
  )
}

function IncomeTab({ range }: { range: Range }) {
  const report = useQuery({
    queryKey: ['income-statement', range],
    queryFn: () => getIncomeStatement(range),
  })
  if (report.isPending) return <Spinner />
  const data = report.data
  if (!data) return null
  const positive = Number(data.result) >= 0
  return (
    <div id="print-area">
      <Card className="space-y-2">
        <ReportTitle
          title="Estado de resultados"
          detail={`${day(data.date_from)} al ${day(data.date_to)}`}
        />
        <Table
          head={
            <>
              <th className={th}>Cuenta</th>
              <th className={thNum}>Monto</th>
            </>
          }
        >
          <SectionRows section={data.income} />
          <SectionRows section={data.expenses} />
          <tr className="text-base font-bold">
            <td className={`${td} pt-3`}>
              {positive ? 'Ganancia del período' : 'Pérdida del período'}
            </td>
            <td className={`${tdNum} pt-3 ${positive ? 'text-success-600' : 'text-danger-600'}`}>
              {rd(data.result)}
            </td>
          </tr>
        </Table>
        <p className="text-[12.5px] text-muted">
          Los retiros del dueño son patrimonio: no restan al resultado.
        </p>
      </Card>
    </div>
  )
}

function BalanceTab({ range }: { range: Range }) {
  const report = useQuery({
    queryKey: ['balance-sheet', range.hasta, range.sucursal],
    queryFn: () => getBalanceSheet({ fecha: range.hasta, sucursal: range.sucursal }),
  })
  if (report.isPending) return <Spinner />
  const data = report.data
  if (!data) return null
  return (
    <div id="print-area">
      <Card className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <ReportTitle title="Balance general" detail={`Al ${day(data.as_of)}`} />
          {data.balances ? (
            <Badge tone="success">Activos = pasivos + patrimonio</Badge>
          ) : (
            <Badge tone="danger">No cuadra: revisar</Badge>
          )}
        </div>
        <Table
          head={
            <>
              <th className={th}>Cuenta</th>
              <th className={thNum}>Saldo</th>
            </>
          }
        >
          <SectionRows section={data.assets} />
          <SectionRows section={data.liabilities} />
          <SectionRows section={data.equity} />
          <tr className="border-b border-edge/60">
            <td className={td}>Resultados de años anteriores</td>
            <td className={tdNum}>{rd(data.retained)}</td>
          </tr>
          <tr className="border-b border-edge/60">
            <td className={td}>Resultado del año</td>
            <td className={tdNum}>{rd(data.current)}</td>
          </tr>
          <tr className="text-base font-bold">
            <td className={`${td} pt-3`}>Pasivos + patrimonio</td>
            <td className={`${tdNum} pt-3`}>{rd(data.liabilities_and_equity)}</td>
          </tr>
        </Table>
      </Card>
    </div>
  )
}
