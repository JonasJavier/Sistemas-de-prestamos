/** P56 «Contabilidad» (decision 080): the chart, the books and manual entries. */

import { api, apiUpload, toQuery, type Page } from './client'

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense'

export const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'asset', label: 'Activo' },
  { value: 'liability', label: 'Pasivo' },
  { value: 'equity', label: 'Patrimonio' },
  { value: 'income', label: 'Ingreso' },
  { value: 'expense', label: 'Gasto' },
]

export interface ChartAccount {
  id: string
  code: string
  name: string
  type: AccountType
  type_label: string
  parent: string | null
  is_system: boolean
  is_active: boolean
  balance: string
  financial: boolean
}

interface AccountRef {
  id: string
  code: string
  name: string
  type: AccountType
  type_label: string
}

export interface Range {
  desde?: string
  hasta?: string
  sucursal?: string
}

export const listChart = (): Promise<ChartAccount[]> => api('/api/v1/contabilidad/cuentas/')

export const createChartAccount = (body: {
  code: string
  name: string
  type: AccountType
  parent?: string | null
}): Promise<ChartAccount> => api('/api/v1/contabilidad/cuentas/', { method: 'POST', body })

export const updateChartAccount = (
  id: string,
  body: Partial<Pick<ChartAccount, 'name' | 'code' | 'parent' | 'is_active'>>,
): Promise<ChartAccount> => api(`/api/v1/contabilidad/cuentas/${id}/`, { method: 'PATCH', body })

export interface TrialBalance {
  date_from: string
  date_to: string
  rows: (AccountRef & { opening: string; debit: string; credit: string; closing: string })[]
  totals: { debit: string; credit: string }
}

export const getTrialBalance = (range: Range): Promise<TrialBalance> =>
  api(`/api/v1/contabilidad/balanza/${toQuery({ ...range })}`)

export interface Section {
  title: string
  rows: (AccountRef & { amount: string })[]
  total: string
}

export interface IncomeStatement {
  date_from: string
  date_to: string
  income: Section
  expenses: Section
  result: string
}

export const getIncomeStatement = (range: Range): Promise<IncomeStatement> =>
  api(`/api/v1/contabilidad/resultados/${toQuery({ ...range })}`)

export interface BalanceSheet {
  as_of: string
  assets: Section
  liabilities: Section
  equity: Section
  retained: string
  current: string
  equity_total: string
  liabilities_and_equity: string
  balances: boolean
}

export const getBalanceSheet = (params: {
  fecha?: string
  sucursal?: string
}): Promise<BalanceSheet> => api(`/api/v1/contabilidad/balance/${toQuery(params)}`)

export interface AccountLedger {
  account: AccountRef
  date_from: string
  date_to: string
  opening: string
  closing: string
  truncated: boolean
  rows: {
    entry: string
    date: string
    description: string
    memo: string
    debit: string
    credit: string
    balance: string
  }[]
}

export const getAccountLedger = (id: string, range: Range): Promise<AccountLedger> =>
  api(`/api/v1/contabilidad/cuentas/${id}/mayor/${toQuery({ ...range })}`)

export interface JournalEntry {
  id: string
  number: string
  date: string
  description: string
  source_type: string
  branch_name: string
  created_by_name: string | null
  reversal_of: string | null
  lines: (AccountRef & { debit: string; credit: string; memo: string })[]
}

export const getJournal = (range: Range & { page?: number }): Promise<Page<JournalEntry>> =>
  api(`/api/v1/contabilidad/diario/${toQuery({ ...range })}`)

export const postManualEntry = (body: {
  date: string
  branch: string
  description: string
  lines: { account: string; debit: string; credit: string; memo?: string }[]
}): Promise<{ id: string; number: string }> =>
  api('/api/v1/contabilidad/asientos/', { method: 'POST', body })

export interface Period {
  year: number
  month: number
  status: 'open' | 'closed'
  closed_at: string | null
  closed_by_name: string | null
}

export const listPeriods = (): Promise<Period[]> => api('/api/v1/contabilidad/periodos/')

// --- Bank reconciliation (decision 083) ---------------------------------------------------------

export interface BookLine {
  id: string
  date: string
  entry: string
  description: string
  amount: string
}

export interface Reconciliation {
  id: string
  account: string
  account_name: string
  year: number
  month: number
  status: 'draft' | 'closed'
  status_label: string
  closed_at: string | null
  closed_by_name: string | null
  summary: {
    book_balance: string
    in_transit: string
    expected_statement: string
    statement_closing: string
    difference: string
    unmatched_statement: number
    can_close: boolean
  }
  lines: {
    id: string
    date: string
    description: string
    reference: string
    amount: string
    matched: BookLine | null
  }[]
  in_transit: BookLine[]
  imported?: { added: number; skipped: number }
  matched?: number
}

export const startReconciliation = (body: {
  account: string
  year: number
  month: number
  statement_closing: string
}): Promise<Reconciliation> => api('/api/v1/conciliaciones/', { method: 'POST', body })

export const getReconciliation = (id: string): Promise<Reconciliation> =>
  api(`/api/v1/conciliaciones/${id}/`)

export function importStatement(id: string, file: File): Promise<Reconciliation> {
  const form = new FormData()
  form.append('file', file)
  return apiUpload(`/api/v1/conciliaciones/${id}/extracto/`, form)
}

export const autoMatch = (id: string): Promise<Reconciliation> =>
  api(`/api/v1/conciliaciones/${id}/emparejar/`, { method: 'POST' })

export const closeReconciliation = (id: string): Promise<Reconciliation> =>
  api(`/api/v1/conciliaciones/${id}/cerrar/`, { method: 'POST' })

export const statementLineAction = (
  id: string,
  lineId: string,
  verb: 'emparejar' | 'desemparejar' | 'registrar',
  body: { book?: string; counterpart?: string; description?: string } = {},
): Promise<Reconciliation> =>
  api(`/api/v1/conciliaciones/${id}/lineas/${lineId}/${verb}/`, { method: 'POST', body })

// --- Month-end close (F15, decision 084) ------------------------------------------------------

export interface MonthClose {
  year: number
  month: number
  status: 'open' | 'closed'
  closed_at: string | null
  closed_by_name: string | null
  reopen_reason: string
  checklist: {
    ready: boolean
    checks: { key: string; label: string; ok: boolean; detail: string; blocking: boolean }[]
  }
  accrual_preview: string
  accrual: { total: string } | null
  document: string | null
  can_close: boolean
}

export const getMonthClose = (year: number, month: number): Promise<MonthClose> =>
  api(`/api/v1/contabilidad/cierre/${year}/${month}/`)

export const closeMonth = (year: number, month: number): Promise<MonthClose> =>
  api(`/api/v1/contabilidad/cierre/${year}/${month}/cerrar/`, { method: 'POST' })

export const reopenMonth = (year: number, month: number, reason: string): Promise<MonthClose> =>
  api(`/api/v1/contabilidad/cierre/${year}/${month}/reabrir/`, {
    method: 'POST',
    body: { reason },
  })

export const monthClosePdfUrl = (year: number, month: number) =>
  `/api/v1/contabilidad/cierre/${year}/${month}/pdf/`

// --- P61 · Management results and the e-CF queue (decision 085) -------------------------------

export interface ManagementResults {
  date_from: string
  date_to: string
  income: { label: string; amount: string }[]
  income_total: string
  expenses: (AccountRef & { amount: string })[]
  expense_total: string
  result: string
  write_offs: string
  owner_withdrawals: string
  owner_capital: string
  months: { year: number; month: number; income: string; expenses: string; result: string }[]
}

export const getManagementResults = (range: Range): Promise<ManagementResults> =>
  api(`/api/v1/reportes/resultados/${toQuery({ ...range })}`)

export interface FiscalDocument {
  id: string
  kind: 'E31' | 'E32' | 'E34'
  kind_label: string
  status: 'pending' | 'issued' | 'voided'
  status_label: string
  date: string
  buyer_name: string
  buyer_document: string
  concept: string
  exempt_amount: string
  taxed_amount: string
  itbis: string
  total: string
  ncf: string
  modifies_ncf: string | null
  issued_at: string | null
  issued_by_name: string | null
  void_reason: string
}

export interface FiscalPage extends Page<FiscalDocument> {
  totals: { count: number; total: string; pending: number }
}

export const listFiscalDocuments = (params: {
  estado: FiscalDocument['status']
  page?: number
}): Promise<FiscalPage> => api(`/api/v1/comprobantes/${toQuery({ ...params })}`)

export const issueFiscalDocument = (id: string, ncf: string): Promise<FiscalDocument> =>
  api(`/api/v1/comprobantes/${id}/emitir/`, { method: 'POST', body: { ncf } })

export const voidFiscalDocument = (id: string, reason: string): Promise<FiscalDocument> =>
  api(`/api/v1/comprobantes/${id}/anular/`, { method: 'POST', body: { reason } })

export const fiscalExportUrl = (
  kind: 'pendientes' | '606' | '607',
  year?: number,
  month?: number,
) => `/api/v1/comprobantes/exportar/${kind}/${toQuery({ year, month })}`
