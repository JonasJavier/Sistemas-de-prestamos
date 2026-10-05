import { api } from './client'

export interface Me {
  id: string
  email: string
  first_name: string
  last_name: string
  is_platform_admin: boolean
  is_manager: boolean
  roles: string[]
  company_id: string | null
  mfa_enabled: boolean
  mfa_required: boolean
}

export function getMe(): Promise<Me> {
  return api('/api/v1/yo/')
}

interface Paginated<T> {
  count: number
  results: T[]
}

export interface Branch {
  id: string
  code: string
  name: string
  address: string
  phone: string
  is_active: boolean
}

export function listBranches(): Promise<Paginated<Branch>> {
  return api('/api/v1/sucursales/')
}

export function createBranch(data: Partial<Branch>): Promise<Branch> {
  return api('/api/v1/sucursales/', { method: 'POST', body: data })
}

export function updateBranch(id: string, data: Partial<Branch>): Promise<Branch> {
  return api(`/api/v1/sucursales/${id}/`, { method: 'PATCH', body: data })
}

export interface Membership {
  id: string
  branch_name: string
  branch_code: string
  role_name: string
}

export interface CompanyUser {
  id: string
  email: string
  first_name: string
  last_name: string
  phone: string
  is_active: boolean
  memberships: Membership[]
}

export function listUsers(): Promise<Paginated<CompanyUser>> {
  return api('/api/v1/usuarios/')
}

export function setUserActive(id: string, active: boolean): Promise<CompanyUser> {
  const action = active ? 'activate' : 'deactivate'
  return api(`/api/v1/usuarios/${id}/${action}/`, { method: 'POST' })
}

export interface Role {
  id: string
  name: string
}

export function listRoles(): Promise<Role[]> {
  return api('/api/v1/roles/')
}

export interface PendingInvitation {
  id: string
  email: string
  branch_name: string
  role_name: string
  invited_by_email: string
  expires_at: string
}

export function listPendingInvitations(): Promise<PendingInvitation[]> {
  return api('/api/v1/invitaciones/pendientes/')
}

export function createInvitation(data: {
  email: string
  branch: string
  role: string
}): Promise<{ id: string }> {
  return api('/api/v1/invitaciones/', { method: 'POST', body: data })
}

export function revokeInvitation(id: string): Promise<null> {
  return api(`/api/v1/invitaciones/pendientes/${id}/`, { method: 'DELETE' })
}

export interface InvitationDetail {
  email: string
  company_name: string
  role_name: string
  branch_name: string
  expires_at: string
  is_expired: boolean
}

export function getInvitation(token: string): Promise<InvitationDetail> {
  return api(`/api/v1/invitaciones/${token}/`)
}

export function acceptInvitation(
  token: string,
  data: { first_name: string; last_name: string; password: string },
): Promise<{ detail: string; email: string }> {
  return api(`/api/v1/invitaciones/${token}/aceptar/`, { method: 'POST', body: data })
}
