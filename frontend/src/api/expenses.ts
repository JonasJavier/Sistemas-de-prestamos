/** P54 «Gastos e ingresos» (F15, decision 081). */

import { api, apiUpload, toQuery, type Page } from './client'

export type ExpenseKind = 'expense' | 'income'
export type ExpenseStatus = 'pending' | 'posted' | 'rejected' | 'voided'
export type ExpenseMethod = 'cash' | 'transfer' | 'check' | 'card'

export const METHODS: { value: ExpenseMethod; label: string }[] = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'check', label: 'Cheque' },
  { value: 'card', label: 'Tarjeta' },
]

export interface ExpenseCategory {
  id: string
  name: string
  kind: ExpenseKind
  nature: 'operating' | 'owner'
  nature_label: string
  account: string
  account_code: string
  account_name: string
  is_active: boolean
}

export interface ExpenseRow {
  id: string
  number: string
  kind: ExpenseKind
  kind_label: string
  date: string
  branch_name: string
  category: string
  category_name: string
  nature: 'operating' | 'owner'
  description: string
  amount: string
  itbis: string
  method: ExpenseMethod
  method_label: string
  account_name: string
  from_drawer: boolean
  party_name: string
  party_document: string
  ncf: string
  status: ExpenseStatus
  status_label: string
  created_by_name: string | null
  created_at: string
  /** How many receipts are attached. */
  files: number
}

export interface ExpenseDetail extends Omit<ExpenseRow, 'files'> {
  entry_number: string | null
  decided_by_name: string | null
  decided_at: string | null
  decision_note: string
  voided_by_name: string | null
  voided_at: string | null
  void_reason: string
  void_entry_number: string | null
  files: { id: string; name: string; content_type: string; size: number }[]
  history: {
    at: string
    label: string
    description: string
    ncf: string
    party_name: string
    status: string
  }[]
  can_decide: boolean
  can_void: boolean
}

export interface ExpensePage extends Page<ExpenseRow> {
  totals: { expense: string; income: string; pending: number }
}

export interface ExpenseFilters {
  tipo?: string
  estado?: string
  categoria?: string
  sucursal?: string
  desde?: string
  hasta?: string
  q?: string
  page?: number
}

export const listExpenses = (filters: ExpenseFilters): Promise<ExpensePage> =>
  api(`/api/v1/gastos/${toQuery({ ...filters })}`)

export const getExpense = (id: string): Promise<ExpenseDetail> => api(`/api/v1/gastos/${id}/`)

export const listCategories = (kind?: ExpenseKind): Promise<ExpenseCategory[]> =>
  api(`/api/v1/categorias-gasto/${toQuery({ kind })}`)

export interface ExpenseRequest {
  kind: ExpenseKind
  date: string
  branch: string
  category: string
  description: string
  amount: string
  itbis?: string
  method?: ExpenseMethod
  account?: string | null
  from_drawer?: boolean
  party_name?: string
  party_document?: string
  ncf?: string
}

export function registerExpense(body: ExpenseRequest, files: File[]): Promise<ExpenseDetail> {
  if (!files.length) return api('/api/v1/gastos/', { method: 'POST', body })
  const form = new FormData()
  for (const [key, value] of Object.entries(body)) {
    if (value !== null && value !== undefined) form.append(key, String(value))
  }
  for (const file of files) form.append('files', file)
  return apiUpload('/api/v1/gastos/', form)
}

export const updateExpense = (
  id: string,
  body: Partial<Pick<ExpenseRow, 'description' | 'party_name' | 'party_document' | 'ncf'>>,
): Promise<ExpenseDetail> => api(`/api/v1/gastos/${id}/`, { method: 'PATCH', body })

export const decideExpense = (
  id: string,
  verb: 'aprobar' | 'rechazar' | 'anular',
  note = '',
): Promise<ExpenseDetail> =>
  api(`/api/v1/gastos/${id}/${verb}/`, { method: 'POST', body: { note } })

export function attachExpenseFiles(id: string, files: File[]): Promise<ExpenseDetail> {
  const form = new FormData()
  for (const file of files) form.append('files', file)
  return apiUpload(`/api/v1/gastos/${id}/archivos/`, form)
}

export const expenseFileUrl = (fileId: string) => `/api/v1/gastos/archivos/${fileId}/`
