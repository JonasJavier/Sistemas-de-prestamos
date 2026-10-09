/** P55 «Cuentas por pagar» (F15, decision 082). */

import { api, toQuery, type Page } from './client'
import type { ExpenseMethod } from './expenses'

export interface Payable {
  id: string
  party_name: string
  party_document: string
  ncf: string
  description: string
  category_name: string
  branch_name: string
  amount: string
  paid: string
  outstanding: string
  due_on: string
  overdue: boolean
  status: 'open' | 'partial' | 'paid' | 'cancelled'
  status_label: string
  recognized_on: string | null
  series: { frequency: string; occurrence: number; count: number } | null
}

export interface PayableDetail extends Payable {
  payments: {
    id: string
    date: string
    amount: string
    account_name: string
    method_label: string
    reference: string
    entry_number: string
    created_by_name: string | null
  }[]
  cancel_reason: string
  cancelled_by_name: string | null
}

export type PayableView = 'abiertas' | 'vencidas' | 'proximas' | 'pagadas' | 'canceladas'

export interface PayablePage extends Page<Payable> {
  totals: { outstanding: string; overdue: string; next_7_days: string }
}

export const listPayables = (params: {
  vista: PayableView
  q?: string
  page?: number
}): Promise<PayablePage> => api(`/api/v1/cuentas-por-pagar/${toQuery({ ...params })}`)

export const getPayable = (id: string): Promise<PayableDetail> =>
  api(`/api/v1/cuentas-por-pagar/${id}/`)

export const createPayable = (body: {
  branch: string
  category: string
  party_name: string
  party_document?: string
  ncf?: string
  description: string
  amount: string
  due_on: string
  invoice_on?: string | null
  frequency?: '' | 'weekly' | 'biweekly' | 'monthly'
  count?: number
}): Promise<Payable[]> => api('/api/v1/cuentas-por-pagar/', { method: 'POST', body })

export const payPayable = (
  id: string,
  body: {
    amount: string
    account: string
    date: string
    method: ExpenseMethod
    reference?: string
  },
): Promise<PayableDetail> => api(`/api/v1/cuentas-por-pagar/${id}/pagar/`, { method: 'POST', body })

export const cancelPayable = (id: string, reason: string): Promise<PayableDetail> =>
  api(`/api/v1/cuentas-por-pagar/${id}/cancelar/`, { method: 'POST', body: { reason } })
