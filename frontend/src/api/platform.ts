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
    plan: { name: string; monthly_price: string; is_trial: boolean }
  } | null
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
