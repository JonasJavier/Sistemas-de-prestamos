import { api, apiUpload, toQuery, type Page } from './client'
import type { Classification } from './reports'

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
  /** Decision 088: the nightly grade with its factors; null before the first night. */
  classification?: Classification | null
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
  page?: number
}): Promise<Page<CustomerListItem>> {
  return api(`/api/v1/clientes/${toQuery(params)}`)
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

// --- Expediente (P22) -------------------------------------------------------

export interface Employment {
  employer: string
  position: string
  since: string | null
  monthly_salary: string | null
  employer_phone: string
  employer_address: string
}

export interface Business {
  name: string
  activity: string
  address: string
  since: string | null
  monthly_sales: string | null
  monthly_expenses: string | null
}

export const getEmployment = (id: string): Promise<Employment> =>
  api(`/api/v1/clientes/${id}/empleo/`)
export const putEmployment = (id: string, data: Partial<Employment>): Promise<Employment> =>
  api(`/api/v1/clientes/${id}/empleo/`, { method: 'PUT', body: data })
export const getBusiness = (id: string): Promise<Business> => api(`/api/v1/clientes/${id}/negocio/`)
export const putBusiness = (id: string, data: Partial<Business>): Promise<Business> =>
  api(`/api/v1/clientes/${id}/negocio/`, { method: 'PUT', body: data })

export interface Relative {
  id: string
  customer: string
  name: string
  relationship: string
  phone: string
  address: string
}

export const listRelatives = (customer: string): Promise<{ results: Relative[] }> =>
  api(`/api/v1/familiares/?customer=${customer}`)
export const createRelative = (data: Omit<Relative, 'id' | 'address'> & { address?: string }) =>
  api<Relative>('/api/v1/familiares/', { method: 'POST', body: data })
export const deleteRelative = (id: string) =>
  api<null>(`/api/v1/familiares/${id}/`, { method: 'DELETE' })

export interface Reference {
  id: string
  customer: string
  name: string
  phone: string
  relationship: string
  verified_by_email: string | null
  verified_at: string | null
  verification_result: string
}

export const listReferences = (customer: string): Promise<{ results: Reference[] }> =>
  api(`/api/v1/referencias/?customer=${customer}`)
export const createReference = (data: {
  customer: string
  name: string
  phone: string
  relationship?: string
}) => api<Reference>('/api/v1/referencias/', { method: 'POST', body: data })
export const verifyReference = (id: string, result: string) =>
  api<Reference>(`/api/v1/referencias/${id}/verify/`, { method: 'POST', body: { result } })

export interface PrivateFileItem {
  id: string
  kind: string
  content_type: string
  size: number
  uploaded_by_email: string | null
  created_at: string
}

/** Whose private files: a customer's or a collateral's (same API shape). */
export interface FileOwner {
  field: 'customer' | 'collateral'
  id: string
}

const FILE_BASE: Record<FileOwner['field'], string> = {
  customer: '/api/v1/archivos/',
  collateral: '/api/v1/archivos-garantia/',
}

export const listPrivateFiles = (owner: FileOwner): Promise<{ results: PrivateFileItem[] }> =>
  api(`${FILE_BASE[owner.field]}?${owner.field}=${owner.id}`)

export function uploadPrivateFile(owner: FileOwner, kind: string, file: File) {
  const form = new FormData()
  form.set(owner.field, owner.id)
  form.set('kind', kind)
  form.set('file', file)
  return apiUpload<PrivateFileItem>(FILE_BASE[owner.field], form)
}

export const deletePrivateFile = (owner: FileOwner, id: string) =>
  api<null>(`${FILE_BASE[owner.field]}${id}/`, { method: 'DELETE' })
export const privateFileUrl = (owner: FileOwner, id: string) =>
  `${FILE_BASE[owner.field]}${id}/download/`
export const privateFileLink = (owner: FileOwner, id: string) =>
  api<{ url: string; expires_in: number }>(`${FILE_BASE[owner.field]}${id}/link/`, {
    method: 'POST',
  })

export interface Collateral {
  id: string
  owner: string
  owner_name: string
  type: 'vehicle' | 'property' | 'other'
  description: string
  status: string
  appraised_value: string | null
  currency: string
  appraised_at: string | null
  appraiser: string
  vehicle: {
    brand: string
    model: string
    year: number | null
    color: string
    plate: string
    chassis: string
    registration: string
  } | null
  property: {
    title_number: string
    cadastral_designation: string
    location: string
    area_m2: string | null
  } | null
}

export const listCollaterals = (owner: string): Promise<{ results: Collateral[] }> =>
  api(`/api/v1/garantias/?owner=${owner}`)
export const createCollateral = (data: Record<string, unknown>) =>
  api<Collateral>('/api/v1/garantias/', { method: 'POST', body: data })

export interface LoanHit {
  number: string
  customer_name: string
  status: string
  principal_outstanding: string
}

export const globalSearch = (
  q: string,
): Promise<{ customers: CustomerListItem[]; loans: LoanHit[] }> =>
  api(`/api/v1/buscar/?q=${encodeURIComponent(q)}`)

/* ---------- Customers of another branch (decisions 033, 059, 070) ---------- */

export interface OtherBranchCustomer {
  id: string
  display_name: string
  document: string
  branch_name: string
}

export const findInOtherBranches = (document: string): Promise<OtherBranchCustomer[]> =>
  api(`/api/v1/clientes/otra-sucursal/?documento=${encodeURIComponent(document)}`)

export const grantBranchAccess = (id: string, note: string): Promise<{ expires_at: string }> =>
  api(`/api/v1/clientes/${id}/acceso-especial/`, { method: 'POST', body: { note } })
