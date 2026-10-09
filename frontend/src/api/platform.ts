import { api } from './client'

export interface RegistrationPayload {
  company_legal_name: string
  company_trade_name?: string
  rnc?: string
  phone?: string
  first_name: string
  last_name: string
  email: string
  password: string
  accept_terms: boolean
}

export interface RegistrationResponse {
  company_id: string
  trial_ends_on: string
  detail: string
}

export function registerCompany(payload: RegistrationPayload): Promise<RegistrationResponse> {
  return api('/api/v1/registro/', { method: 'POST', body: payload })
}

export interface MyCompany {
  id: string
  legal_name: string
  trade_name: string
  rnc: string
  status: 'trial' | 'active' | 'suspended' | 'closed'
  status_reason: string
  trial_ends_on: string | null
  trial_days_left?: number
  subscription: {
    status: string
    paid_until: string | null
    plan: {
      name: string
      monthly_price: string
      is_trial: boolean
      max_users: number | null
      max_branches: number | null
      max_active_loans: number | null
    }
  } | null
  /** Decision 104: what the plan caps, in use today. */
  usage?: { users: number; branches: number; active_loans: number }
}

export function getMyCompany(): Promise<MyCompany> {
  return api('/api/v1/mi-empresa/')
}

/** Owner panel (PT1): lifecycle data only, never business data. */
export interface PlatformCompany {
  id: string
  legal_name: string
  trade_name: string
  rnc: string
  phone: string
  status: 'trial' | 'active' | 'suspended' | 'closed'
  status_reason: string
  trial_ends_on: string | null
  created_at: string
  subscription: {
    status: string
    paid_until: string | null
    plan: { name: string }
  } | null
}

export function listCompanies(): Promise<{ count: number; results: PlatformCompany[] }> {
  return api('/api/v1/plataforma/empresas/')
}

export function suspendCompany(id: string, reason: string): Promise<PlatformCompany> {
  return api(`/api/v1/plataforma/empresas/${id}/suspend/`, {
    method: 'POST',
    body: { reason },
  })
}

export function reactivateCompany(id: string, reason: string): Promise<PlatformCompany> {
  return api(`/api/v1/plataforma/empresas/${id}/reactivate/`, {
    method: 'POST',
    body: { reason },
  })
}

export interface PaymentPayload {
  period_start: string
  period_end: string
  amount: string
  method: 'transfer' | 'deposit' | 'other'
  reference?: string
}

export function recordPayment(id: string, data: PaymentPayload): Promise<PlatformCompany> {
  return api(`/api/v1/plataforma/empresas/${id}/registrar-pago/`, {
    method: 'POST',
    body: data,
  })
}

// --- PT2 and PT4 (decision 091) ---------------------------------------------

export interface PlatformDashboard {
  date: string
  companies: {
    trial: number
    active: number
    active_paid: number
    suspended: number
    closed: number
  }
  conversion: { days: number; ended: number; converted: number; rate: string | null }
  recent: { id: string; name: string; status: PlatformCompany['status']; created_at: string }[]
  trials_ending: { id: string; name: string; trial_ends_on: string }[]
  payments_due: {
    id: string
    name: string
    plan: string
    paid_until: string | null
    overdue: boolean
  }[]
  usage: {
    days: number
    rows: {
      id: string
      name: string
      users: number
      active_users: number
      active_loans: number
      payments: number
    }[]
    totals: { users: number; active_users: number; active_loans: number; payments: number }
  }
  definitions: Record<string, string>
}

export function getPlatformDashboard(): Promise<PlatformDashboard> {
  return api('/api/v1/plataforma/tablero/')
}

export interface SupportGrant {
  id: string
  company: string
  reason: string
  starts_at: string
  ends_at: string
  revoked_at: string | null
  active: boolean
}

export function listSupportGrants(companyId: string): Promise<SupportGrant[]> {
  return api(`/api/v1/plataforma/empresas/${companyId}/soporte/`)
}

export function grantSupport(
  companyId: string,
  data: { reason: string; hours: number },
): Promise<SupportGrant> {
  return api(`/api/v1/plataforma/empresas/${companyId}/soporte/`, { method: 'POST', body: data })
}

export function enterSupport(id: string): Promise<SupportGrant> {
  return api(`/api/v1/plataforma/soporte/${id}/entrar/`, { method: 'POST' })
}

export function revokeSupportAsOwner(id: string): Promise<SupportGrant> {
  return api(`/api/v1/plataforma/soporte/${id}/revocar/`, { method: 'POST' })
}

export function leaveSupport(): Promise<void> {
  return api('/api/v1/plataforma/soporte/salir/', { method: 'POST' })
}

/** The company's side: Ajustes shows the grants and every screen read. */
export interface CompanySupport {
  active: SupportGrant | null
  grants: SupportGrant[]
  reads: { at: string; path: string }[]
}

export function getCompanySupport(): Promise<CompanySupport> {
  return api('/api/v1/ajustes/soporte/')
}

export function revokeSupport(id: string): Promise<SupportGrant> {
  return api(`/api/v1/ajustes/soporte/${id}/revocar/`, { method: 'POST' })
}
