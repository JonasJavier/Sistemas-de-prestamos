import { api } from './client'

/** P92–P93 · Portal del cliente (decision 099): its own session, never the staff's. */
const BASE = '/api/v1/publico/portal'

export interface PortalLoanRow {
  number: string
  product: string
  status: string
  status_label: string
  principal: string
  principal_outstanding: string
  late_fee_outstanding: string
  days_past_due: number
  next_due_date: string | null
  disbursed_on: string
}

export interface PortalMe {
  customer: string
  company: string
  phone: string
  loans: PortalLoanRow[]
}

export interface PortalLoan extends PortalLoanRow {
  installments: {
    number: number
    due_date: string
    total: string
    owed: string
    late_fee: string
    days_late: number
    status: string
    status_label: string
  }[]
  payments: {
    number: string
    date: string
    amount: string
    reversed: boolean
    receipt_path: string | null
  }[]
}

export const requestPortalCode = (token: string) =>
  api<{ customer: string; sent_to: string[] }>(`${BASE}/codigo/`, {
    method: 'POST',
    body: { token },
  })

export const enterPortal = (token: string, code: string) =>
  api<{ customer: string }>(`${BASE}/entrar/`, { method: 'POST', body: { token, code } })

export const leavePortal = () => api<null>(`${BASE}/salir/`, { method: 'POST' })

export const getPortalMe = () => api<PortalMe>(`${BASE}/yo/`)

export const getPortalLoan = (number: string) =>
  api<PortalLoan>(`${BASE}/prestamos/${encodeURIComponent(number)}/`)

export const portalStatementUrl = (number: string) =>
  `${BASE}/prestamos/${encodeURIComponent(number)}/estado-de-cuenta/`

/** Staff: send the personal link (shown too, to share it by hand). */
export const inviteToPortal = (customerId: string) =>
  api<{ link: string }>(`/api/v1/clientes/${customerId}/portal/`, { method: 'POST' })

export const revokePortal = (customerId: string) =>
  api<null>(`/api/v1/clientes/${customerId}/portal/`, { method: 'DELETE' })
