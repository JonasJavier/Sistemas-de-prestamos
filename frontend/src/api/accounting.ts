/** P56 «Contabilidad» (decision 080): the chart, the books and manual entries. */

import { api, toQuery, type Page } from './client'

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
