import { api } from './client'

export interface ProductCharge {
  id: string
  product: string
  name: string
  basis: 'percent' | 'fixed'
  value: string
  mode: 'discounted' | 'financed' | 'cash'
  is_active: boolean
}

export interface LateFeePolicy {
  grace_days: number
  fee_method: 'prorated_daily' | 'full_period' | 'fixed'
  monthly_rate: string
  fixed_amount: string | null
  cap_pct: string
}

export interface LoanProduct {
  id: string
  name: string
  type: 'personal' | 'vehicle' | 'mortgage' | 'micro'
  method: 'flat' | 'interest_only' | 'fixed_payment' | 'fixed_principal' | 'open'
  allowed_frequencies: string[]
  rate_unit: 'per_period' | 'monthly' | 'annual'
  min_amount: string
  max_amount: string
  min_rate: string
  max_rate: string
  default_rate: string | null
  min_term: number
  max_term: number
  payment_rounding: 'cent' | 'peso' | 'five' | 'ten'
  collect_saturdays: boolean
  collect_sundays: boolean
  collect_holidays: boolean
  allocation_order: 'standard' | 'proportional'
  payoff_full_current_period: boolean
  payoff_future_interest_pct: string
  guarantee: 'none' | 'guarantor' | 'asset'
  min_coverage: string | null
  required_documents: string[]
  is_active: boolean
  late_fee_policy: LateFeePolicy
  charges: ProductCharge[]
}

export type ProductPayload = Omit<LoanProduct, 'id' | 'charges'>

export function listProducts(): Promise<{ results: LoanProduct[] }> {
  return api('/api/v1/productos/')
}

export const createProduct = (data: ProductPayload): Promise<LoanProduct> =>
  api('/api/v1/productos/', { method: 'POST', body: data })

export const updateProduct = (id: string, data: Partial<ProductPayload>): Promise<LoanProduct> =>
  api(`/api/v1/productos/${id}/`, { method: 'PATCH', body: data })

export const createCharge = (data: Omit<ProductCharge, 'id'>): Promise<ProductCharge> =>
  api('/api/v1/cargos-producto/', { method: 'POST', body: data })

export const updateCharge = (id: string, data: Partial<ProductCharge>): Promise<ProductCharge> =>
  api(`/api/v1/cargos-producto/${id}/`, { method: 'PATCH', body: data })

export interface SimulationRow {
  number: number
  due_date: string
  original_due_date?: string
  principal: string
  interest: string
  total: string
}

export interface Simulation {
  principal: string
  requested_amount: string
  net_disbursed: string
  periodic_rate: string
  monthly_rate: string
  annual_rate: string
  total_interest: string
  total_charges: string
  total_to_pay: string
  charges: { name: string; mode: string; amount: string }[]
  schedule: SimulationRow[]
}

export interface SimulationRequest {
  product: string
  amount: string
  installments: number
  frequency: string
  rate?: string
  first_due?: string
}

export function simulate(data: SimulationRequest): Promise<Simulation> {
  return api('/api/v1/simulador/', { method: 'POST', body: data })
}
