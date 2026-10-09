import { api, apiUpload, toQuery, type Page } from './client'
import type { Classification } from './reports'
import type { Simulation } from './lending'

/* ---------- Applications (F3) ---------- */

export interface ApplicationListItem {
  id: string
  number: string
  status: string
  customer: string
  customer_name: string
  customer_document: string
  product: string
  product_name: string
  amount: string
  approved_amount: string | null
  frequency: string
  installments: number
  created_by_name: string | null
  assigned_approver_name: string | null
  submitted_at: string | null
  valid_until: string | null
  created_at: string
}

export interface BudgetItem {
  id: string
  application: string
  kind: 'income' | 'expense' | 'asset'
  category: string
  description: string
  monthly_amount: string
}

export interface Guarantor {
  id: string
  customer: string
  customer_name: string
  customer_document: string
  customer_status: string
}

export interface ApplicationCollateral {
  id: string
  collateral: string
  considered_value: string
  description: string
  type: string
  status: string
  appraised_value: string | null
}

export interface Requirement {
  id: string
  name: string
  file: string | null
  verified_by_name: string | null
  verified_at: string | null
}

export interface ApplicationFile {
  id: string
  kind: 'bureau_report' | 'document'
  description: string
  content_type: string
  size: number
  uploaded_by_email: string | null
  created_at: string
}

export interface Application {
  id: string
  number: string
  status: string
  branch_code: string
  customer: string
  customer_name: string
  customer_status: string
  product: string
  product_name: string
  amount: string
  frequency: string
  installments: number
  rate: string
  rate_unit: string
  first_due: string | null
  purpose: string
  notes: string
  /** F11 (decision 092): the loan this application renews. */
  renews_number?: string | null
  created_by_name: string | null
  submitted_at: string | null
  assigned_approver_name: string | null
  decided_by_name: string | null
  decided_at: string | null
  decision_reason_text: string | null
  decision_note: string
  approved_amount: string | null
  approved_installments: number | null
  approved_rate: string | null
  approved_frequency: string
  approved_first_due: string | null
  valid_until: string | null
  capacity_ratio: string | null
  bureau_provider: string
  bureau_score: number | null
  bureau_date: string | null
  loan_number: string | null
  budget_items: BudgetItem[]
  guarantors: Guarantor[]
  collaterals: ApplicationCollateral[]
  requirements: Requirement[]
  files: ApplicationFile[]
  can: { edit: boolean; submit: boolean; decide: boolean; disburse: boolean; withdraw: boolean }
}

export interface Alert {
  code: string
  message: string
}

export const renewLoan = (numero: string): Promise<Application> =>
  api(`/api/v1/prestamos/${encodeURIComponent(numero)}/renovar/`, { method: 'POST' })

export interface Evaluation {
  /** F11 (decision 092): the old loan's payoff today and the net it leaves. */
  renewal?: { loan: string; status: string; payoff: string; net: string } | null
  monthly_income: string
  monthly_expenses: string
  available: string
  monthly_payment: string
  capacity_ratio: string | null
  capacity_alert_ratio: string
  coverage: string | null
  min_coverage: string | null
  requirements_total: number
  requirements_verified: number
  references_total: number
  references_verified: number
  previous_applications: Record<string, number>
  loans_total: number
  loans_active: number
  customer_blocked: boolean
  has_bureau: boolean
  guarantors: number
  collaterals: number
  alerts: Alert[]
  simulation: Simulation
  /** Decision 088: the customer's grade and why; null before the first night. */
  classification?: Classification | null
}

export interface DomainEvent {
  id: string
  type: string
  summary: string
  data: Record<string, string>
  actor_name: string | null
  created_at: string
}

export interface ApplicationPayload {
  customer?: string
  product?: string
  amount?: string
  frequency?: string
  installments?: number
  rate?: string | null
  first_due?: string | null
  purpose?: string
  notes?: string
  bureau_provider?: string
  bureau_score?: number | null
  bureau_date?: string | null
}

export function listApplications(params: {
  bandeja?: string
  status?: string
  customer?: string
  q?: string
  page?: number
}): Promise<Page<ApplicationListItem>> {
  return api(`/api/v1/solicitudes/${toQuery(params)}`)
}

export const getApplication = (id: string): Promise<Application> =>
  api(`/api/v1/solicitudes/${id}/`)

export const createApplication = (data: ApplicationPayload): Promise<Application> =>
  api('/api/v1/solicitudes/', { method: 'POST', body: data })

export const updateApplication = (id: string, data: ApplicationPayload): Promise<Application> =>
  api(`/api/v1/solicitudes/${id}/`, { method: 'PATCH', body: data })

export const getEvaluation = (id: string): Promise<Evaluation> =>
  api(`/api/v1/solicitudes/${id}/evaluacion/`)

export const getApplicationEvents = (id: string): Promise<DomainEvent[]> =>
  api(`/api/v1/solicitudes/${id}/eventos/`)

export const submitApplication = (id: string): Promise<Application> =>
  api(`/api/v1/solicitudes/${id}/enviar/`, { method: 'POST' })

export const approveApplication = (
  id: string,
  data: {
    amount?: string
    installments?: number
    frequency?: string
    rate?: string
    note?: string
  },
): Promise<Application> => api(`/api/v1/solicitudes/${id}/aprobar/`, { method: 'POST', body: data })

export const rejectApplication = (id: string, reason: string, note: string): Promise<Application> =>
  api(`/api/v1/solicitudes/${id}/rechazar/`, { method: 'POST', body: { reason, note } })

export const returnApplication = (id: string, note: string): Promise<Application> =>
  api(`/api/v1/solicitudes/${id}/devolver/`, { method: 'POST', body: { note } })

export const withdrawApplication = (id: string, note: string): Promise<Application> =>
  api(`/api/v1/solicitudes/${id}/desistir/`, { method: 'POST', body: { note } })

export const addBudgetItem = (data: Omit<BudgetItem, 'id' | 'category'> & { category?: string }) =>
  api<BudgetItem>('/api/v1/solicitud-presupuesto/', { method: 'POST', body: data })

export const deleteBudgetItem = (id: string) =>
  api<null>(`/api/v1/solicitud-presupuesto/${id}/`, { method: 'DELETE' })

export const addGuarantor = (application: string, customer: string) =>
  api<Guarantor>('/api/v1/solicitud-garantes/', {
    method: 'POST',
    body: { application, customer },
  })

export const removeGuarantor = (id: string) =>
  api<null>(`/api/v1/solicitud-garantes/${id}/`, { method: 'DELETE' })

export const addApplicationCollateral = (
  application: string,
  collateral: string,
  considered_value?: string,
) =>
  api<ApplicationCollateral>('/api/v1/solicitud-garantias/', {
    method: 'POST',
    body: { application, collateral, ...(considered_value ? { considered_value } : {}) },
  })

export const removeApplicationCollateral = (id: string) =>
  api<null>(`/api/v1/solicitud-garantias/${id}/`, { method: 'DELETE' })

export const verifyRequirement = (id: string, file?: string) =>
  api<Requirement>(`/api/v1/solicitud-requisitos/${id}/verificar/`, {
    method: 'POST',
    body: file ? { file } : {},
  })

export const unverifyRequirement = (id: string) =>
  api<Requirement>(`/api/v1/solicitud-requisitos/${id}/desmarcar/`, { method: 'POST' })

export function uploadApplicationFile(
  application: string,
  kind: ApplicationFile['kind'],
  file: File,
  description = '',
): Promise<ApplicationFile> {
  const form = new FormData()
  form.set('application', application)
  form.set('kind', kind)
  form.set('description', description)
  form.set('file', file)
  return apiUpload('/api/v1/solicitud-archivos/', form)
}

export const applicationFileLink = (id: string): Promise<{ url: string }> =>
  api(`/api/v1/solicitud-archivos/${id}/link/`, { method: 'POST' })

/* ---------- Disbursement (F4) ---------- */

export interface DisbursementPreview {
  simulation: Simulation
  discounted_charges: string
  financed_charges: string
  cash_charges: string
  accounts: { id: string; name: string; kind: 'cash' | 'bank'; balance: string }[]
  /** Decision 055 (phase 4): cash leaves the disburser's open drawer. */
  cash_session: { id: string; number: string; cash: string; branch_matches: boolean } | null
  /** F11 (decision 092): the old loan paid off from the new amount. */
  renewal?: { loan: string; payoff: string; net: string } | null
  blockers: string[]
}

export const getDisbursementPreview = (id: string): Promise<DisbursementPreview> =>
  api(`/api/v1/solicitudes/${id}/desembolso/`)

export const disburse = (
  id: string,
  data: {
    source_account?: string | null
    method: 'cash' | 'transfer' | 'check'
    reference?: string
    idempotency_key: string
    charge_account?: string | null
  },
): Promise<{ loan: string; id: string }> =>
  api(`/api/v1/solicitudes/${id}/desembolsar/`, { method: 'POST', body: data })

/* ---------- Loans ---------- */

export interface LoanListItem {
  id: string
  number: string
  status: string
  customer: string
  customer_name: string
  customer_document: string
  product_name: string
  branch_code: string
  principal: string
  principal_outstanding: string
  interest_outstanding: string
  days_past_due: number
  next_due_date: string | null
  disbursed_on: string
}

export interface LoanTerms {
  version: number
  effective_from: string
  reason: string
  principal: string
  method: string
  frequency: string
  rate: string
  rate_unit: string
  periodic_rate: string
  installments: number
  first_due: string
  payment_rounding: string
  late_fee_grace_days: number
  late_fee_method: string
  late_fee_monthly_rate: string
  late_fee_cap_pct: string
  created_by_name: string | null
  approved_by_name: string | null
}

export interface Loan extends LoanListItem {
  /** F11 (decision 092): the renewal chain. */
  renewed_from_number?: string | null
  renewed_by_number?: string | null
  collector: string | null
  collector_name: string | null
  closed_on: string | null
  last_payment_on: string | null
  application: string | null
  application_number: string | null
  officer_name: string | null
  late_fee_outstanding: string
  voided_on: string | null
  written_off_on?: string | null
  void_reason_text: string | null
  void_note: string
  promissory_note_signed_at: string | null
  current_terms: LoanTerms | null
  charges: { id: string; name: string; mode: string; amount: string; status: string }[]
  disbursement: {
    disbursed_on: string
    source_account_name: string
    method: string
    reference: string
    gross: string
    discounted_charges: string
    financed_charges: string
    cash_charges: string
    net: string
    renewal_payoff?: string
    disbursed_by_name: string | null
    entry_number: string
  } | null
  guarantors: { id: string; name: string; document: string }[]
  collaterals: {
    id: string
    description: string
    type: string
    status: string
    considered_value: string
  }[]
}

export interface InstallmentRow {
  id: string
  version: number
  number: number
  due_date: string
  original_due_date: string
  principal_due: string
  interest_due: string
  charges_due: string
  principal_paid: string
  interest_paid: string
  status: string
  total_due: string
}

export function listLoans(params: {
  status?: string
  q?: string
  customer?: string
  collector?: string
  tramo?: string
  page?: number
}): Promise<Page<LoanListItem> & { totals: { principal_outstanding: string } }> {
  return api(`/api/v1/prestamos/${toQuery(params)}`)
}

export const getLoan = (number: string): Promise<Loan> => api(`/api/v1/prestamos/${number}/`)

export const getLoanCalendar = (
  number: string,
): Promise<{ versions: LoanTerms[]; installments: InstallmentRow[] }> =>
  api(`/api/v1/prestamos/${number}/calendario/`)

export const getLoanEvents = (number: string): Promise<DomainEvent[]> =>
  api(`/api/v1/prestamos/${number}/eventos/`)

export const getLoanDocuments = (
  number: string,
): Promise<{
  documents: { id: string; kind: string; label: string; folio: string; legal_status: string }[]
  signed_note: { id: string; uploaded_at: string } | null
}> => api(`/api/v1/prestamos/${number}/documentos/`)

export const loanDocumentUrl = (number: string, docId: string) =>
  `/api/v1/prestamos/${number}/documentos/${docId}/`

export function uploadSignedNote(number: string, file: File): Promise<Loan> {
  const form = new FormData()
  form.set('file', file)
  form.set('kind', 'signed_note')
  return apiUpload(`/api/v1/prestamos/${number}/pagare-firmado/`, form)
}

export const voidLoan = (number: string, reason: string, note: string): Promise<Loan> =>
  api(`/api/v1/prestamos/${number}/anular/`, { method: 'POST', body: { reason, note } })

/* ---------- Catalogs ---------- */

export interface Reason {
  id: string
  kind: string
  text: string
  is_active: boolean
}

export const listReasons = (kind: string): Promise<Reason[]> =>
  api(`/api/v1/motivos/?kind=${kind}&is_active=true`)

/* ---------- Financial accounts (P53) ---------- */

export interface FinancialAccount {
  id: string
  name: string
  kind: 'cash' | 'bank'
  bank_name: string
  account_number_last4: string
  branch: string | null
  branch_name: string
  currency: string
  is_active: boolean
  balance: string
  ledger_code: string
}

export interface Movement {
  id: string
  number: string
  date: string
  description: string
  source_type: string
  debit: string
  credit: string
}

export const listAccounts = (): Promise<FinancialAccount[]> => api('/api/v1/cuentas/')

export const createAccount = (data: {
  name: string
  kind: 'cash' | 'bank'
  bank_name?: string
  account_number?: string
  branch?: string | null
}): Promise<FinancialAccount> => api('/api/v1/cuentas/', { method: 'POST', body: data })

export const accountMovements = (id: string): Promise<{ results: Movement[] }> =>
  api(`/api/v1/cuentas/${id}/movimientos/`)

export const capitalMovement = (
  id: string,
  data: { amount: string; direction: 'in' | 'out'; note: string },
): Promise<{ entry: string }> =>
  api(`/api/v1/cuentas/${id}/capital/`, { method: 'POST', body: data })

export const transferBetween = (data: {
  source: string
  target: string
  amount: string
  note?: string
}): Promise<{ entry: string }> => api('/api/v1/cuentas/transferir/', { method: 'POST', body: data })
