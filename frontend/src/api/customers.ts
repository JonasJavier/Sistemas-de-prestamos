import { api } from './client'

export interface CustomerListItem {
  id: string
  kind: 'person' | 'company'
  document_type: string
  document_number: string
  display_name: string
  phone: string
  status: 'active' | 'blocked'
  branch_code: string
  created_at: string
}

export interface Customer extends CustomerListItem {
  first_name: string
  last_name: string
  birth_date: string | null
  gender: string
  marital_status: string
  occupation: string
  legal_name: string
  phone2: string
  email: string
  address_line: string
  province: string | null
  home_branch: string
  block_reason: string
  consent_at: string | null
}

export interface CustomerPayload {
  kind: 'person' | 'company'
  document_type: string
  document_number: string
  first_name?: string
  last_name?: string
  legal_name?: string
  phone: string
  phone2?: string
  email?: string
  address_line?: string
  province?: string | null
  home_branch: string
  confirm_duplicate?: boolean
}

export function listCustomers(params: {
  q?: string
  status?: string
}): Promise<{ count: number; results: CustomerListItem[] }> {
  const search = new URLSearchParams()
  if (params.q) search.set('q', params.q)
  if (params.status) search.set('status', params.status)
  const qs = search.toString()
  return api(`/api/v1/clientes/${qs ? `?${qs}` : ''}`)
}

export function getCustomer(id: string): Promise<Customer> {
  return api(`/api/v1/clientes/${id}/`)
}

export function createCustomer(data: CustomerPayload): Promise<Customer> {
  return api('/api/v1/clientes/', { method: 'POST', body: data })
}

export function blockCustomer(id: string, reason: string): Promise<Customer> {
  return api(`/api/v1/clientes/${id}/block/`, { method: 'POST', body: { reason } })
}

export function unblockCustomer(id: string): Promise<Customer> {
  return api(`/api/v1/clientes/${id}/unblock/`, { method: 'POST' })
}

export interface Province {
  id: string
  name: string
}

export function listProvinces(): Promise<Province[]> {
  return api('/api/v1/provincias/')
}
