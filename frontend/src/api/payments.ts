/** Phase 4: the payment screen, receipts, reversals, payoff letters, the
 * delinquency tray and the authorizations (P33-P36, P43, P11). */

import { api, toQuery, type Page } from './client'

export type PaymentKind = 'regular' | 'payoff' | 'prepayment'
export type PaymentMethod = 'cash' | 'transfer' | 'deposit' | 'check'

export interface DueLine {
  id: string
  number: number
  due_date: string
  days_late: number
  charges: string
  late_fee: string
  interest: string
  principal: string
  total: string
  status: string
}

export interface Approval {
  id: string
  kind: 'waive_late_fee' | 'payoff_discount' | 'reversal' | 'correction'
  kind_label: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'used' | 'expired'
  status_label: string
  target_type: string
  target_label: string
  amount: string
  reason_text: string | null
  note: string
  payload: { correct_amount?: string }
  requested_by_name: string | null
  decided_by_name: string | null
  decided_at: string | null
  decision_note: string
  expires_at: string
  created_at: string
  can_decide: boolean
  needs_second_factor: boolean
}

export interface PaymentScreen {
  loan: {
    id: string
    number: string
    status: string
    customer_id: string
    customer_name: string
    customer_document: string
    customer_phone: string
    branch_name: string
    product_name: string
    method: string
    frequency: string
    allocation_order: string
    collector_name: string | null
  }
  as_of: string
  summary: {
    overdue: string
    late_fee: string
    current: string
    current_due_date: string | null
    total_owed: string
    principal: string
    days_past_due: number
    bucket: string
  }
  installments: DueLine[]
  payoff?: {
    total: string
    principal: string
    overdue_interest: string
    current_interest: string
    future_interest: string
    late_fees: string
    charges: string
    interest_waived: string
    valid_until: string
  }
  prepayment?: { allowed: boolean; reason: string | null }
  destination:
    | { kind: 'route'; label: string; cash: string }
    | { kind: 'cash_session'; label: string; cash: string; stale: boolean }
    | null
  limits: { waive_late_fee: string | null; payoff_discount: string | null }
  approvals: Approval[]
  bank_accounts: { id: string; name: string }[]
}

export interface PaymentRequest {
  kind: PaymentKind
  amount: string
  method: PaymentMethod
  received?: string | null
  reference?: string
  bank_account?: string | null
  waive?: string
  waive_note?: string
  waiver_approval?: string | null
  discount?: string
  discount_approval?: string | null
  prepayment_mode?: '' | 'reduce_term' | 'reduce_payment'
  latitude?: string | null
  longitude?: string | null
  idempotency_key?: string
}

export interface ReceiptLine {
  number: number
  due_date: string
  charges: string
  late_fee: string
  interest: string
  principal: string
  total: string
}

export interface Receipt {
  number: string
  status: 'posted' | 'reversed'
  kind: string
  kind_label: string
  paid_at: string
  value_date: string
  method: PaymentMethod
  method_label: string
  reference: string
  received: string
  change: string
  amount: string
  late_fee_waived: string
  interest_waived: string
  discount: string
  principal_after: string
  owed_after: string
  currency: string
  company: { name: string; trade_name: string; rnc: string; phone: string; email: string }
  branch: { name: string; address: string }
  loan: { number: string; product: string }
  customer: { name: string; document: string; phone: string }
  collected_by: string | null
  lines: ReceiptLine[]
  totals: { charges: string; late_fee: string; interest: string; principal: string }
  reversed: { on: string; reason: string; replacement: string | null } | null
  replaces: string | null
  // Internal receipt only:
  id?: string
  loan_status?: string
  cash_session?: string | null
  route?: boolean
  off_route?: boolean
  receipt_path?: string | null
  reversal_note?: string | null
  reversal_authorized_by?: string | null
  can_request_reversal?: boolean
  pending_reversal?: Approval | null
}

export interface PaymentRow {
  id: string
  number: string
  loan_number: string
  customer_name: string
  kind: string
  kind_label: string
  status: 'posted' | 'reversed'
  paid_at: string
  value_date: string
  method: PaymentMethod
  method_label: string
  amount: string
  collected_by_name: string | null
  off_route: boolean
}

export const getPaymentScreen = (number: string): Promise<PaymentScreen> =>
  api(`/api/v1/prestamos/${encodeURIComponent(number)}/cobro/`)

export const previewPayment = (number: string, body: PaymentRequest): Promise<Receipt> =>
  api(`/api/v1/prestamos/${encodeURIComponent(number)}/cobro/simular/`, { method: 'POST', body })

export const collect = (
  number: string,
  body: PaymentRequest,
): Promise<{ number: string; id: string }> =>
  api(`/api/v1/prestamos/${encodeURIComponent(number)}/cobrar/`, { method: 'POST', body })

export const listPayments = (params: {
  loan?: string
  customer?: string
  cash_session?: string
  route_session?: string
  date?: string
  page?: number
}): Promise<Page<PaymentRow>> => api(`/api/v1/pagos/${toQuery(params)}`)

export const getReceipt = (number: string): Promise<Receipt> =>
  api(`/api/v1/pagos/${encodeURIComponent(number)}/`)

export const getPublicReceipt = (token: string): Promise<Receipt> =>
  api(`/api/v1/publico/recibos/${encodeURIComponent(token)}/`)

export const setReceiptLink = (number: string, revoke: boolean): Promise<Receipt> =>
  api(`/api/v1/pagos/${encodeURIComponent(number)}/enlace/`, {
    method: 'POST',
    body: { revoke },
  })

export interface ReversalEffect {
  installments: { number: number; due_date: string; status: string; owed: string }[]
  cash_out: string
  cash_in: string
  principal_before: string
  principal_after: string
}

export const getReversalEffect = (
  number: string,
  correctAmount?: string,
): Promise<ReversalEffect> =>
  api(
    `/api/v1/pagos/${encodeURIComponent(number)}/reverso/efecto/${toQuery({
      correct_amount: correctAmount,
    })}`,
  )

export const requestReversal = (
  number: string,
  body: { reason: string; note: string; correct_amount?: string | null },
): Promise<Approval> =>
  api(`/api/v1/pagos/${encodeURIComponent(number)}/reverso/`, { method: 'POST', body })

export interface PayoffQuote {
  as_of: string
  valid_until: string
  total: string
  principal: string
  overdue_interest: string
  current_interest: string
  future_interest: string
  late_fees: string
  charges: string
  interest_waived: string
}

export const getPayoffQuote = (number: string, date?: string): Promise<PayoffQuote> =>
  api(`/api/v1/prestamos/${encodeURIComponent(number)}/carta-saldo/${toQuery({ fecha: date })}`)

export const issuePayoffLetter = (
  number: string,
  asOf: string,
): Promise<{ number: string; id: string; total: string }> =>
  api(`/api/v1/prestamos/${encodeURIComponent(number)}/carta-saldo/`, {
    method: 'POST',
    body: { as_of: asOf },
  })

export const payoffLetterUrl = (number: string, id: string) =>
  `/api/v1/prestamos/${encodeURIComponent(number)}/carta-saldo/${id}/`

export interface DelinquencyRow {
  number: string
  customer_id: string
  customer_name: string
  customer_phone: string
  branch_name: string
  collector_name: string | null
  /** The collection agent, or the collector when none (decision 079). */
  agent_name: string | null
  promise: { on: string; amount: string } | null
  last_action: { at: string; result: string } | null
  days_past_due: number
  overdue: string
  late_fee: string
  principal_outstanding: string
  next_due_date: string | null
  last_payment_on: string | null
}

export interface Delinquency {
  buckets: { key: string; count: number; principal: string }[]
  selected: string
  totals: { count: number; principal: string }
  results: DelinquencyRow[]
}

export const getDelinquency = (params: {
  tramo?: string
  q?: string
  collector?: string
  /** «mios» or an agent's id (phase 5). */
  gestor?: string
  /** «con» or «sin» a pending promise. */
  promesa?: string
}): Promise<Delinquency> => api(`/api/v1/atrasos/${toQuery(params)}`)

export const listApprovals = (box: 'por_decidir' | 'mias'): Promise<Page<Approval>> =>
  api(`/api/v1/autorizaciones/${toQuery({ bandeja: box })}`)

export const requestAuthorization = (body: {
  loan: string
  kind: 'waive_late_fee' | 'payoff_discount'
  amount: string
  note: string
}): Promise<Approval> => api('/api/v1/autorizaciones/', { method: 'POST', body })

export const decideApproval = (
  id: string,
  approve: boolean,
  body: { note?: string; second_factor?: string },
): Promise<Approval> =>
  api(`/api/v1/autorizaciones/${id}/${approve ? 'aprobar' : 'rechazar'}/`, {
    method: 'POST',
    body,
  })

export const cancelApproval = (id: string): Promise<Approval> =>
  api(`/api/v1/autorizaciones/${id}/cancelar/`, { method: 'POST' })

export const changeLoanDates = (
  number: string,
  body: { first_due: string; reason: string; note: string },
): Promise<unknown> =>
  api(`/api/v1/prestamos/${encodeURIComponent(number)}/cambiar-fecha/`, { method: 'POST', body })
