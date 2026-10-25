import { api, apiUpload, toQuery } from './client'

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
    started_on: string
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
export type CompanyStatus = 'trial' | 'active' | 'suspended' | 'closed'

export type PlanTier = 'esencial' | 'profesional' | 'empresa'

export interface PlatformPlan {
  id: string
  name: string
  tier: PlanTier
  monthly_price: string
  currency: string
  max_users: number | null
  max_branches: number | null
  max_active_loans: number | null
  is_trial: boolean
  is_active: boolean
  /** Companies on it (closed ones aside). */
  companies: number
}

export interface PlatformCompany {
  id: string
  legal_name: string
  trade_name: string
  rnc: string
  phone: string
  email: string
  status: CompanyStatus
  status_reason: string
  trial_ends_on: string | null
  trial_days_left: number | null
  created_at: string
  users_count: number
  subscription: {
    id: string
    status: 'trial' | 'active' | 'past_due' | 'canceled'
    started_on: string
    paid_until: string | null
    plan: Omit<PlatformPlan, 'is_active' | 'companies'>
  } | null
}

export interface SubscriptionPayment {
  id: string
  period_start: string
  period_end: string
  amount: string
  currency: string
  method: 'transfer' | 'deposit' | 'other'
  reference: string
  recorded_by: string
  created_at: string
}

export interface CompanyManager {
  id: string
  name: string
  email: string
  is_active: boolean
  last_login: string | null
  mfa_enabled: boolean
  email_verified: boolean
}

/** The company's file (decision 122). */
export interface PlatformCompanyDetail extends PlatformCompany {
  address: string
  terms_version: string
  terms_accepted_at: string | null
  usage: Record<'users' | 'branches' | 'active_loans', { used: number; limit: number | null }>
  managers: CompanyManager[]
  payments: SubscriptionPayment[]
  proofs: PaymentProof[]
  support: { id: string; ends_at: string; reason: string } | null
}

export interface CompanyFilters {
  page?: number
  search?: string
  status?: CompanyStatus | ''
}

export function listCompanies(
  filters: CompanyFilters = {},
): Promise<{ count: number; results: PlatformCompany[] }> {
  return api(`/api/v1/plataforma/empresas/${toQuery({ ...filters })}`)
}

export function getCompany(id: string): Promise<PlatformCompanyDetail> {
  return api(`/api/v1/plataforma/empresas/${id}/`)
}

export function extendTrial(
  id: string,
  data: { days: number; reason: string },
): Promise<PlatformCompanyDetail> {
  return api(`/api/v1/plataforma/empresas/${id}/extender-prueba/`, { method: 'POST', body: data })
}

export function changePlan(id: string, plan: string): Promise<PlatformCompanyDetail> {
  return api(`/api/v1/plataforma/empresas/${id}/cambiar-plan/`, {
    method: 'POST',
    body: { plan },
  })
}

export function closeCompany(id: string, reason: string): Promise<PlatformCompanyDetail> {
  return api(`/api/v1/plataforma/empresas/${id}/cerrar/`, { method: 'POST', body: { reason } })
}

export function listPayments(id: string): Promise<SubscriptionPayment[]> {
  return api(`/api/v1/plataforma/empresas/${id}/pagos/`)
}

/** Decision 120: the lone administrator who lost the phone and the codes. */
export function resetManagerMfa(
  companyId: string,
  userId: string,
  note: string,
): Promise<PlatformCompanyDetail> {
  return api(`/api/v1/plataforma/empresas/${companyId}/usuarios/${userId}/restablecer-2fa/`, {
    method: 'POST',
    body: { note },
  })
}

export function resendVerification(companyId: string, userId: string): Promise<void> {
  return api(`/api/v1/plataforma/empresas/${companyId}/usuarios/${userId}/reenviar-confirmacion/`, {
    method: 'POST',
  })
}

// --- PT3: plans (decision 122) -----------------------------------------------

export type PlanPayload = Omit<PlatformPlan, 'id' | 'companies'>

/** Decision 124: the plans on offer, public (the subscription screen). */
export interface PublicPlan {
  id: string
  name: string
  tier: PlanTier
  monthly_price: string
  max_users: number | null
  max_branches: number | null
  max_active_loans: number | null
  features: string[]
}

export function listPublicPlans(): Promise<PublicPlan[]> {
  return api('/api/v1/planes/')
}

export function listPlans(): Promise<PlatformPlan[]> {
  return api('/api/v1/plataforma/planes/')
}

export function createPlan(data: PlanPayload): Promise<PlatformPlan> {
  return api('/api/v1/plataforma/planes/', { method: 'POST', body: data })
}

export function updatePlan(id: string, data: Partial<PlanPayload>): Promise<PlatformPlan> {
  return api(`/api/v1/plataforma/planes/${id}/`, { method: 'PATCH', body: data })
}

export function deletePlan(id: string): Promise<void> {
  return api(`/api/v1/plataforma/planes/${id}/`, { method: 'DELETE' })
}

export function suspendCompany(id: string, reason: string): Promise<PlatformCompanyDetail> {
  return api(`/api/v1/plataforma/empresas/${id}/suspend/`, {
    method: 'POST',
    body: { reason },
  })
}

export function reactivateCompany(id: string, reason: string): Promise<PlatformCompanyDetail> {
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

export function recordPayment(id: string, data: PaymentPayload): Promise<PlatformCompanyDetail> {
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
  pending_proofs: {
    id: string
    company: string
    name: string
    plan: string
    period: 'monthly' | 'annual'
    amount: string
    created_at: string
  }[]
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

// --- Decision 125: paying by transfer ------------------------------------------

export interface BankAccount {
  id: string
  bank: string
  type: 'savings' | 'checking'
  number: string
  iban: string
  holder: string
  currency: string
  is_active: boolean
  position: number
}

export interface PaymentProof {
  id: string
  company: string
  company_name: string
  plan: string
  plan_name: string
  period: 'monthly' | 'annual'
  amount: string
  reference: string
  note: string
  content_type: string
  size: number
  status: 'pending' | 'confirmed' | 'rejected'
  submitted_by: string
  reviewed_at: string | null
  rejection_reason: string
  created_at: string
}

/** The company's side: where to transfer and what it has sent. */
export function getCompanyPayment(): Promise<{ accounts: BankAccount[]; proofs: PaymentProof[] }> {
  return api('/api/v1/mi-empresa/pago/')
}

export function submitPaymentProof(data: {
  plan: string
  period: 'monthly' | 'annual'
  amount: number
  reference: string
  file: File
}): Promise<PaymentProof> {
  const form = new FormData()
  form.set('plan', data.plan)
  form.set('period', data.period)
  form.set('amount', data.amount.toFixed(2))
  form.set('reference', data.reference)
  form.set('file', data.file)
  return apiUpload('/api/v1/mi-empresa/pago/comprobantes/', form)
}

export const companyProofFileUrl = (id: string) =>
  `/api/v1/mi-empresa/pago/comprobantes/${id}/archivo/`

/** The owner's side. */
export function listProofs(
  status: PaymentProof['status'] | '' = 'pending',
): Promise<{ count: number; results: PaymentProof[] }> {
  return api(`/api/v1/plataforma/comprobantes/${toQuery({ status: status || undefined })}`)
}

export const ownerProofFileUrl = (id: string) => `/api/v1/plataforma/comprobantes/${id}/archivo/`

export function confirmProof(id: string): Promise<PaymentProof> {
  return api(`/api/v1/plataforma/comprobantes/${id}/confirmar/`, { method: 'POST' })
}

export function rejectProof(id: string, reason: string): Promise<PaymentProof> {
  return api(`/api/v1/plataforma/comprobantes/${id}/rechazar/`, {
    method: 'POST',
    body: { reason },
  })
}

export type BankAccountPayload = Omit<BankAccount, 'id'>

export function listBankAccounts(): Promise<BankAccount[]> {
  return api('/api/v1/plataforma/cuentas-bancarias/')
}

export function createBankAccount(data: BankAccountPayload): Promise<BankAccount> {
  return api('/api/v1/plataforma/cuentas-bancarias/', { method: 'POST', body: data })
}

export function updateBankAccount(
  id: string,
  data: Partial<BankAccountPayload>,
): Promise<BankAccount> {
  return api(`/api/v1/plataforma/cuentas-bancarias/${id}/`, { method: 'PATCH', body: data })
}

export function deleteBankAccount(id: string): Promise<void> {
  return api(`/api/v1/plataforma/cuentas-bancarias/${id}/`, { method: 'DELETE' })
}
