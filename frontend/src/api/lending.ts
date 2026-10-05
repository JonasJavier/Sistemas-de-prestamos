import { api } from './client'

export interface ProductCharge {
  id: string
  name: string
  basis: 'percent' | 'fixed'
  value: string
  mode: 'discounted' | 'financed' | 'cash'
  is_active: boolean
}

export interface LoanProduct {
  id: string
  name: string
  type: string
  method: 'flat' | 'interest_only' | 'fixed_payment' | 'fixed_principal'
  allowed_frequencies: string[]
  rate_unit: 'per_period' | 'monthly' | 'annual'
  min_amount: string
  max_amount: string
  min_rate: string
  max_rate: string
  default_rate: string | null
  min_term: number
  max_term: number
  is_active: boolean
  late_fee_policy: {
    grace_days: number
    fee_method: string
    monthly_rate: string
    cap_pct: string
  }
  charges: ProductCharge[]
}

export function listProducts(): Promise<{ results: LoanProduct[] }> {
  return api('/api/v1/productos/')
}

export interface SimulationRow {
  number: number
  due_date: string
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

export function simulate(data: {
  product: string
  amount: string
  installments: number
  frequency: string
  rate?: string
}): Promise<Simulation> {
  return api('/api/v1/simulador/', { method: 'POST', body: data })
}
