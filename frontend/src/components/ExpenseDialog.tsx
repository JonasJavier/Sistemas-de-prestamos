import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { listBranches } from '../api/accounts'
import { api, ApiError } from '../api/client'
import {
  type ExpenseKind,
  type ExpenseMethod,
  listCategories,
  METHODS,
  registerExpense,
} from '../api/expenses'
import { errorMessage, rd, todayISO } from '../lib/format'
import { notify } from '../lib/toast'
import { Modal } from './Modal'
import { Alert, Button, Field, Input, Select } from './ui'
import { DateInput } from './DateInput'

const listPayAccounts = (): Promise<{ id: string; name: string; kind: string }[]> =>
  api('/api/v1/gastos/cuentas/')

/** New expense or income (P54), or petty cash from the open drawer (P50). */
export function ExpenseDialog({
  kind,
  fromDrawer = false,
  branchId,
  onClose,
}: {
  kind: ExpenseKind
  /** Petty cash: leaves the cashier's open drawer, dated today. */
  fromDrawer?: boolean
  /** The drawer's branch (petty cash). */
  branchId?: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const categories = useQuery({
    queryKey: ['expense-categories', kind],
    queryFn: () => listCategories(kind),
  })
  const branches = useQuery({ queryKey: ['branches'], queryFn: listBranches, enabled: !fromDrawer })
  const accounts = useQuery({
    queryKey: ['expense-accounts'],
    queryFn: listPayAccounts,
    enabled: !fromDrawer,
  })
  const fileInput = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [form, setForm] = useState({
    date: todayISO(),
    branch: branchId ?? '',
    category: '',
    description: '',
    amount: '',
    itbis: '',
    method: (fromDrawer ? 'cash' : 'transfer') as ExpenseMethod,
    account: '',
    party_name: '',
    party_document: '',
    ncf: '',
  })
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }))
  const expense = kind === 'expense'
  const save = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      registerExpense(
        {
          kind,
          date: form.date,
          branch: form.branch || branches.data?.results[0]?.id || '',
          category: form.category,
          description: form.description,
          amount: form.amount.replace(/,/g, ''),
          itbis: expense ? form.itbis.replace(/,/g, '') || '0' : '0',
          method: form.method,
          account: fromDrawer ? null : form.account || accounts.data?.[0]?.id || null,
          from_drawer: fromDrawer,
          party_name: form.party_name,
          party_document: form.party_document,
          ncf: form.ncf,
        },
        files,
      ),
    onSuccess: (result) => {
      notify(
        result.status === 'pending'
          ? `${result.number} quedó por aprobar: supera tu límite.`
          : `${result.kind_label} ${result.number} registrado.`,
        'success',
      )
      for (const key of [['expenses'], ['my-cash'], ['chart'], ['me']])
        void queryClient.invalidateQueries({ queryKey: key })
      onClose()
    },
  })
  const title = fromDrawer ? 'Gasto menor de la caja' : expense ? 'Nuevo gasto' : 'Nuevo ingreso'
  const amount = Number(form.amount.replace(/,/g, '')) || 0
  return (
    <Modal onClose={onClose} labelledBy="expense-title">
      <div className="max-h-[92vh] w-full max-w-xl space-y-3 overflow-y-auto rounded-2xl bg-surface p-5 shadow-xl">
        <h2 id="expense-title" className="text-lg font-semibold">
          {title}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Categoría">
            <Select value={form.category} onChange={(e) => set('category', e.target.value)}>
              <option value="">Elegir…</option>
              {categories.data
                ?.filter((c) => c.is_active && (!fromDrawer || c.nature === 'operating'))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.nature === 'owner' ? ' (del dueño)' : ''}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Monto (RD$)">
            <Input
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => set('amount', e.target.value)}
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
          {fromDrawer ? null : (
            <>
              <Field label="Fecha del comprobante">
                <DateInput
                  value={form.date}
                  max={todayISO()}
                  onChange={(date) => set('date', date)}
                />
              </Field>
              <Field label="Sucursal">
                <Select value={form.branch} onChange={(e) => set('branch', e.target.value)}>
                  {branches.data?.results.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={expense ? 'Sale de' : 'Entra a'}>
                <Select value={form.account} onChange={(e) => set('account', e.target.value)}>
                  {accounts.data?.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Medio">
                <Select
                  value={form.method}
                  onChange={(e) => set('method', e.target.value as ExpenseMethod)}
                >
                  {METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}
          <Field label={expense ? 'Proveedor' : 'Quién paga'}>
            <Input value={form.party_name} onChange={(e) => set('party_name', e.target.value)} />
          </Field>
          <Field label="RNC o cédula">
            <Input
              inputMode="numeric"
              value={form.party_document}
              onChange={(e) => set('party_document', e.target.value)}
            />
          </Field>
          {expense ? (
            <>
              <Field label="NCF del comprobante" hint="B01… o e-CF E31…; vacío si no lo dieron.">
                <Input
                  value={form.ncf}
                  onChange={(e) => set('ncf', e.target.value.toUpperCase())}
                />
              </Field>
              <Field label="ITBIS incluido (RD$)" hint="Para el reporte 606.">
                <Input
                  inputMode="decimal"
                  value={form.itbis}
                  onChange={(e) => set('itbis', e.target.value)}
                />
              </Field>
            </>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input
            ref={fileInput}
            type="file"
            multiple
            accept="application/pdf,image/jpeg,image/png,image/heic"
            className="hidden"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
          <Button variant="secondary" size="sm" onClick={() => fileInput.current?.click()}>
            Adjuntar comprobante
          </Button>
          <span className="text-muted">
            {files.length ? files.map((f) => f.name).join(', ') : 'PDF o foto, hasta 10 MB.'}
          </span>
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
            disabled={!form.category || !form.description.trim() || amount <= 0 || save.isPending}
          >
            Registrar {amount > 0 ? rd(amount) : ''}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
