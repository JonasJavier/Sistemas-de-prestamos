/** Phase 4: my cash (P50-P51), the branch's sessions (P52) and settlements (F6). */

import { api, toQuery } from './client'

export interface CashSession {
  id: string
  number: string
  status: 'open' | 'closed' | 'approved'
  status_label: string
  branch: string
  branch_name: string
  cashier_name: string | null
  business_date: string
  opened_at: string
  carried_over: string
  funded_amount: string
  expected: string
  counted: string | null
  difference: string | null
  difference_reason: string | null
  difference_note: string
  returned_amount: string
  closed_at: string | null
  approved_by_name: string | null
  approved_at: string | null
  by_method: Record<string, { count: number; amount: string }>
  movements?: {
    at: string
    kind: string
    description: string
    in: string | null
    out: string | null
  }[]
  counts?: { denomination: string; quantity: number }[]
  has_pdf?: boolean
  can_approve?: boolean
}

export interface RouteToSettle {
  id: string
  collector_name: string | null
  business_date: string
  expected: string
  payments: number
}

export interface MyCash {
  session: CashSession | null
  last: CashSession | null
  branches: { id: string; name: string }[]
  accounts: { id: string; name: string; kind: 'cash' | 'bank' }[]
  denominations: string[]
  today: string
  routes_to_settle: RouteToSettle[]
}

export const getMyCash = (): Promise<MyCash> => api('/api/v1/caja/')

export const openCash = (body: {
  branch: string
  amount: string
  fund_from?: string | null
}): Promise<CashSession> => api('/api/v1/caja/abrir/', { method: 'POST', body })

export const moveCash = (body: {
  account: string
  amount: string
  incoming: boolean
  note?: string
}): Promise<CashSession> => api('/api/v1/caja/mover/', { method: 'POST', body })

export const closeCash = (body: {
  counts: Record<string, number>
  reason?: string | null
  note?: string
  return_to?: string | null
  return_amount?: string
}): Promise<CashSession> => api('/api/v1/caja/cerrar/', { method: 'POST', body })

export const listSessions = (params: {
  status?: string
  date?: string
  page?: number
}): Promise<{ count: number; results: CashSession[]; to_approve: number }> =>
  api(`/api/v1/cajas/${toQuery(params)}`)

export const getSession = (id: string): Promise<CashSession> => api(`/api/v1/cajas/${id}/`)

export const approveSession = (id: string, note: string): Promise<CashSession> =>
  api(`/api/v1/cajas/${id}/`, { method: 'POST', body: { note } })

export const sessionPdfUrl = (id: string) => `/api/v1/cajas/${id}/pdf/`

export interface Settlement {
  id: string
  collector_name: string | null
  business_date: string
  status: 'open' | 'settled'
  expected: string
  /** Cash left at a drawer before the day ended (decision 075). */
  handovers: { at: string; amount: string; received_by_name: string | null }[]
  payments: {
    number: string
    loan_number: string
    customer_name: string
    method: string
    amount: string
    status: string
  }[]
}

export const getSettlement = (routeId: string): Promise<Settlement> =>
  api(`/api/v1/rendiciones/${routeId}/`)

export const settleRoute = (
  routeId: string,
  body: { delivered: string; reason?: string | null; note?: string },
): Promise<{ status: string; difference: string }> =>
  api(`/api/v1/rendiciones/${routeId}/`, { method: 'POST', body })

export const receiveHandover = (
  routeId: string,
  amount: string,
): Promise<{ amount: string; carried: string }> =>
  api(`/api/v1/rendiciones/${routeId}/entrega/`, { method: 'POST', body: { amount } })

export const settlementPdfUrl = (routeId: string) => `/api/v1/rendiciones/${routeId}/pdf/`

// --- Cash differences (decision 075) --------------------------------------------------------

export interface CashDifference {
  id: string
  kind: 'shortage' | 'overage'
  kind_label: string
  amount: string
  resolved: string
  outstanding: string
  status: 'open' | 'resolved'
  status_label: string
  person_name: string | null
  is_mine: boolean
  branch_name: string
  occurred_on: string
  source: string
  claim_until: string | null
  actions: {
    action: string
    label: string
    amount: string
    user_name: string | null
    note: string
    at: string
  }[]
}

export const listDifferences = (all = false): Promise<CashDifference[]> =>
  api(`/api/v1/diferencias-caja/${all ? '?estado=todas' : ''}`)

export const differenceAction = (
  id: string,
  verb: 'reponer' | 'perdida' | 'aplicar' | 'ingreso',
  body: { amount?: string | null; note?: string },
): Promise<CashDifference> =>
  api(`/api/v1/diferencias-caja/${id}/${verb}/`, { method: 'POST', body })
