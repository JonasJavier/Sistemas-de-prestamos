import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { listBranches } from '../api/accounts'
import { api, ApiError } from '../api/client'
import { type ExpenseMethod, listCategories, METHODS } from '../api/expenses'
import {
  cancelPayable,
  createPayable,
  getPayable,
  listPayables,
  payPayable,
  setPayableReceipt,
  type PayableDetail,
  type PayableView,
} from '../api/payables'
import { usePrompt } from '../components/Dialog'
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
import { day, errorMessage, rd, todayISO } from '../lib/format'
import { useDebounced } from '../lib/hooks'
import { notify } from '../lib/toast'
import { DateInput } from '../components/DateInput'

const listPayAccounts = (): Promise<{ id: string; name: string; kind: string }[]> =>
  api('/api/v1/gastos/cuentas/')

const VIEWS = [
  ['abiertas', 'Abiertas'],
  ['vencidas', 'Vencidas'],
  ['proximas', 'Próximos 7 días'],
  ['pagadas', 'Pagadas'],
  ['canceladas', 'Canceladas'],
] as const

/** P55 · Cuentas por pagar: única o recurrente, pagos parciales (decision 082). */
export function PayablesPage() {
  const [view, setView] = useState<PayableView>('abiertas')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const term = useDebounced(q.trim(), 300)
  const list = useQuery({
    queryKey: ['payables', view, term, page],
    queryFn: () => listPayables({ vista: view, q: term || undefined, page }),
    placeholderData: keepPreviousData,
  })
  const data = list.data
  return (
    <>
      <PageHeader
        title="Cuentas por pagar"
        subtitle="El gasto y la deuda se registran con la factura (o al vencer cada cuota de una serie); cada pago baja lo pendiente."
        actions={<Button onClick={() => setCreating(true)}>Nueva cuenta por pagar</Button>}
      />
      {data ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Stat
            label="Pendiente"
            value={rd(data.totals.outstanding)}
            hint="Incluye las cuotas futuras de las series"
            emphasis
          />
          <Stat label="Vencido" value={rd(data.totals.overdue)} />
          <Stat label="Vence en 7 días" value={rd(data.totals.next_7_days)} />
        </div>
      ) : null}
      <Tabs
        tabs={VIEWS}
        value={view}
        onChange={(value) => {
          setView(value)
          setPage(1)
        }}
      />
      <SearchInput
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por proveedor o descripción…"
      />
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
                      <span className="font-semibold">{row.party_name}</span>
                      <span className="text-sm">{row.description}</span>
                      {row.overdue ? <Badge tone="danger">Vencida</Badge> : null}
                      {row.status === 'partial' ? <Badge tone="warning">Pago parcial</Badge> : null}
                      {row.series ? <Badge tone="info">{row.series.frequency}</Badge> : null}
                    </div>
                    <div className="text-[12.5px] text-muted">
                      Vence {day(row.due_on)} · {row.category_name}
                      {row.recognized_on ? '' : ' · se registra al vencer'}
                    </div>
                  </div>
                  <div className="sm:text-right">
                    <div className="font-bold tabular-nums">{rd(row.outstanding)}</div>
                    {row.paid !== '0.00' ? (
                      <div className="text-[12px] text-muted">de {rd(row.amount)}</div>
                    ) : null}
                  </div>
                </button>
              </li>
            ))}
          </RowList>
          <Pagination page={page} count={data.count} onChange={setPage} />
        </>
      ) : (
        <EmptyState>Nada en esta vista.</EmptyState>
      )}
      {creating ? <NewPayableDialog onClose={() => setCreating(false)} /> : null}
      {open ? <PayableDialog id={open} onClose={() => setOpen(null)} /> : null}
    </>
  )
}

function NewPayableDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const categories = useQuery({
    queryKey: ['expense-categories', 'expense'],
    queryFn: () => listCategories('expense'),
  })
  const branches = useQuery({ queryKey: ['branches'], queryFn: listBranches })
  const [recurring, setRecurring] = useState(false)
  const [form, setForm] = useState({
    branch: '',
    category: '',
    party_name: '',
    party_document: '',
    ncf: '',
    itbis: '',
    description: '',
    amount: '',
    invoice_on: todayISO(),
    due_on: todayISO(15),
    frequency: 'monthly' as 'weekly' | 'biweekly' | 'monthly',
    count: '12',
  })
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }))
  const save = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      createPayable({
        branch: form.branch || branches.data?.results[0]?.id || '',
        category: form.category,
        party_name: form.party_name,
        party_document: form.party_document,
        ncf: recurring ? '' : form.ncf,
        itbis: recurring ? '0' : form.itbis.replace(/,/g, '') || '0',
        description: form.description,
        amount: form.amount.replace(/,/g, ''),
        due_on: form.due_on,
        invoice_on: recurring ? null : form.invoice_on,
        frequency: recurring ? form.frequency : '',
        count: recurring ? Number(form.count) : 1,
      }),
    onSuccess: (rows) => {
      notify(
        rows.length > 1 ? `Serie de ${rows.length} cuotas creada.` : 'Cuenta por pagar creada.',
        'success',
      )
      void queryClient.invalidateQueries({ queryKey: ['payables'] })
      onClose()
    },
  })
  return (
    <Modal onClose={onClose} labelledBy="payable-title">
      <div className="max-h-[92vh] w-full max-w-xl space-y-3 overflow-y-auto rounded-2xl bg-surface p-5 shadow-xl">
        <h2 id="payable-title" className="text-lg font-semibold">
          Nueva cuenta por pagar
        </h2>
        <Tabs
          tabs={[
            ['single', 'Una factura'],
            ['recurring', 'Recurrente'],
          ]}
          value={recurring ? 'recurring' : 'single'}
          onChange={(value) => setRecurring(value === 'recurring')}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Proveedor">
            <Input value={form.party_name} onChange={(e) => set('party_name', e.target.value)} />
          </Field>
          <Field label="RNC o cédula">
            <Input
              inputMode="numeric"
              value={form.party_document}
              onChange={(e) => set('party_document', e.target.value)}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Descripción">
              <Input
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
              />
            </Field>
          </div>
          <Field label="Categoría">
            <Select value={form.category} onChange={(e) => set('category', e.target.value)}>
              <option value="">Elegir…</option>
              {categories.data
                ?.filter((c) => c.is_active)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label={recurring ? 'Monto de cada cuota (RD$)' : 'Monto (RD$)'}>
            <Input
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => set('amount', e.target.value)}
            />
          </Field>
          {recurring ? (
            <>
              <Field label="Primera cuota vence">
                <DateInput value={form.due_on} onChange={(date) => set('due_on', date)} />
              </Field>
              <Field label="Frecuencia">
                <Select value={form.frequency} onChange={(e) => set('frequency', e.target.value)}>
                  <option value="monthly">Mensual</option>
                  <option value="biweekly">Quincenal</option>
                  <option value="weekly">Semanal</option>
                </Select>
              </Field>
              <Field label="Cantidad de cuotas">
                <Input
                  inputMode="numeric"
                  value={form.count}
                  onChange={(e) => set('count', e.target.value.replace(/\D/g, ''))}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Fecha de la factura">
                <DateInput
                  value={form.invoice_on}
                  max={todayISO()}
                  onChange={(date) => set('invoice_on', date)}
                />
              </Field>
              <Field label="Vence">
                <DateInput value={form.due_on} onChange={(date) => set('due_on', date)} />
              </Field>
              <Field label="NCF">
                <Input
                  value={form.ncf}
                  onChange={(e) => set('ncf', e.target.value.toUpperCase())}
                />
              </Field>
              <Field label="ITBIS incluido (RD$)" hint="Para el reporte 606.">
                <Input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={form.itbis}
                  onChange={(e) => set('itbis', e.target.value)}
                />
              </Field>
            </>
          )}
          <Field label="Sucursal">
            <Select value={form.branch} onChange={(e) => set('branch', e.target.value)}>
              {branches.data?.results.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {save.error instanceof ApiError ? (
          <Alert tone="danger">{errorMessage(save.error.data)}</Alert>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={
              !form.party_name.trim() ||
              !form.description.trim() ||
              !form.category ||
              !Number(form.amount.replace(/,/g, '')) ||
              save.isPending
            }
          >
            Crear
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function PayableDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [dialog, ask] = usePrompt()
  const detail = useQuery({ queryKey: ['payable', id], queryFn: () => getPayable(id) })
  const accounts = useQuery({ queryKey: ['expense-accounts'], queryFn: listPayAccounts })
  const [paying, setPaying] = useState(false)
  const [amount, setAmount] = useState('')
  const [account, setAccount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [method, setMethod] = useState<ExpenseMethod>('transfer')
  const [reference, setReference] = useState('')
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['payables'] })
    void queryClient.invalidateQueries({ queryKey: ['payable', id] })
  }
  const pay = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      payPayable(id, {
        amount: (amount || detail.data?.outstanding || '').replace(/,/g, ''),
        account: account || accounts.data?.[0]?.id || '',
        date,
        method,
        reference,
      }),
    onSuccess: (result) => {
      notify(`Pago registrado: ${result.status_label.toLowerCase()}.`, 'success')
      setPaying(false)
      setAmount('')
      refresh()
    },
  })
  const cancel = useMutation({
    meta: { inlineError: true },
    mutationFn: async () => {
      const reason = await ask({
        title: 'Cancelar lo pendiente',
        label: 'Motivo',
        type: 'textarea',
        required: true,
        danger: true,
        confirmText: 'Cancelar la cuenta',
      })
      return reason === null ? null : cancelPayable(id, reason)
    },
    onSuccess: (result) => {
      if (!result) return
      notify('Cuenta cancelada.', 'success')
      refresh()
    },
  })
  const data = detail.data
  const live = data && (data.status === 'open' || data.status === 'partial')
  const error = [pay.error, cancel.error].find((e) => e instanceof ApiError)
  return (
    <Modal onClose={onClose} labelledBy="payable-detail-title">
      <div className="max-h-[92vh] w-full max-w-xl space-y-3 overflow-y-auto rounded-2xl bg-surface p-5 shadow-xl">
        {dialog}
        {!data ? (
          <Spinner />
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 id="payable-detail-title" className="text-lg font-semibold">
                  {data.party_name}
                </h2>
                <p className="text-sm">{data.description}</p>
              </div>
              <Badge tone={data.overdue ? 'danger' : 'neutral'}>
                {data.overdue ? 'Vencida' : data.status_label}
              </Badge>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <Stat label="Monto" value={rd(data.amount)} />
              <Stat label="Pagado" value={rd(data.paid)} />
              <Stat label="Pendiente" value={rd(data.outstanding)} emphasis />
            </div>
            <p className="text-[12.5px] text-muted">
              Vence {day(data.due_on)} · {data.category_name}
              {data.recognized_on
                ? ` · registrada el ${day(data.recognized_on)}`
                : ' · se registra al vencer'}
            </p>
            <ReceiptBlock payable={data} onSaved={refresh} />
            {data.payments.length ? (
              <ul className="divide-y divide-edge text-sm">
                {data.payments.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2 py-1.5">
                    <span>
                      {day(p.date)} · {p.account_name} · {p.method_label}
                      {p.reference ? ` · ${p.reference}` : ''}
                    </span>
                    <span className="tabular-nums">{rd(p.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {data.cancel_reason ? (
              <Alert tone="info">
                Cancelada por {data.cancelled_by_name}: {data.cancel_reason}
              </Alert>
            ) : null}
            {paying ? (
              <div className="grid gap-3 rounded-lg bg-surface-2 p-3 sm:grid-cols-2">
                <Field label="Monto (RD$)">
                  <Input
                    inputMode="decimal"
                    placeholder={data.outstanding}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </Field>
                <Field label="Fecha del pago">
                  <DateInput value={date} max={todayISO()} onChange={setDate} />
                </Field>
                <Field label="Sale de">
                  <Select value={account} onChange={(e) => setAccount(e.target.value)}>
                    {accounts.data?.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Medio">
                  <Select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as ExpenseMethod)}
                  >
                    {METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Referencia (opcional)">
                    <Input value={reference} onChange={(e) => setReference(e.target.value)} />
                  </Field>
                </div>
              </div>
            ) : null}
            {error instanceof ApiError ? (
              <Alert tone="danger">{errorMessage(error.data)}</Alert>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              {live && !paying ? (
                <>
                  <Button variant="secondary" onClick={() => cancel.mutate()}>
                    Cancelar lo pendiente
                  </Button>
                  <Button onClick={() => setPaying(true)}>Pagar</Button>
                </>
              ) : null}
              {paying ? (
                <>
                  <Button variant="secondary" onClick={() => setPaying(false)}>
                    Volver
                  </Button>
                  <Button onClick={() => pay.mutate()} disabled={pay.isPending}>
                    Registrar pago de {rd(amount || data.outstanding)}
                  </Button>
                </>
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

/** The supplier's invoice (NCF, RNC, ITBIS): what the 606 reports. A series
 * occurrence gets it when its invoice arrives. */
function ReceiptBlock({ payable, onSaved }: { payable: PayableDetail; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    party_document: payable.party_document,
    ncf: payable.ncf,
    itbis: Number(payable.itbis) ? payable.itbis : '',
  })
  const save = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      setPayableReceipt(payable.id, {
        party_document: form.party_document,
        ncf: form.ncf,
        itbis: form.itbis.replace(/,/g, '') || '0',
      }),
    onSuccess: () => {
      notify('Comprobante guardado.', 'success')
      setEditing(false)
      onSaved()
    },
  })
  const editable = payable.status !== 'cancelled'
  if (!editing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-edge px-3 py-2 text-sm">
        <span className="min-w-0">
          {payable.ncf ? (
            <>
              NCF <span className="tabular-nums">{payable.ncf}</span>
              {payable.party_document ? ` · RNC o cédula ${payable.party_document}` : ''}
              {Number(payable.itbis) ? ` · ITBIS ${rd(payable.itbis)}` : ''}
            </>
          ) : (
            <span className="text-muted">
              Sin comprobante: regístralo cuando llegue la factura, para el 606.
            </span>
          )}
        </span>
        {editable ? (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            {payable.ncf ? 'Editar comprobante' : 'Registrar comprobante'}
          </Button>
        ) : null}
      </div>
    )
  }
  return (
    <div className="space-y-3 rounded-lg bg-surface-2 p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="RNC o cédula">
          <Input
            inputMode="numeric"
            value={form.party_document}
            onChange={(e) => setForm({ ...form, party_document: e.target.value })}
          />
        </Field>
        <Field label="NCF">
          <Input
            value={form.ncf}
            onChange={(e) => setForm({ ...form, ncf: e.target.value.toUpperCase() })}
          />
        </Field>
        <Field label="ITBIS incluido (RD$)">
          <Input
            inputMode="decimal"
            placeholder="0.00"
            value={form.itbis}
            onChange={(e) => setForm({ ...form, itbis: e.target.value })}
          />
        </Field>
      </div>
      {save.error instanceof ApiError ? (
        <Alert tone="danger">{errorMessage(save.error.data)}</Alert>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => setEditing(false)}>
          Volver
        </Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          Guardar comprobante
        </Button>
      </div>
    </div>
  )
}
