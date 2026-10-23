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
  company_name: string | null
  company_status: 'trial' | 'active' | 'suspended' | 'closed' | null
  mfa_enabled: boolean
  mfa_required: boolean
  /** Decision 118: whoever joined with Google may have none yet. */
  has_password?: boolean
  location_consent?: boolean
  /** Badges of the top bar (phase 4). */
  unread_notifications?: number
  pending_approvals?: number
  closings_to_approve?: number
  cash_session?: { id: string; number: string } | null
  route_open?: boolean
  /** Phase 5: my promises and follow-ups due by today (P44). */
  agenda_today?: number
  /** PT4 (decision 091): the platform owner reading a company, read-only. */
  support?: { grant: string; ends_at: string; reason: string } | null
}

export function getMe(): Promise<Me> {
  return api('/api/v1/yo/')
}

/** Mi cuenta: the person corrects their own name; the email does not change. */
export function updateProfile(body: { first_name: string; last_name: string }): Promise<Me> {
  return api('/api/v1/yo/', { method: 'PATCH', body })
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
  /** Decision 035: cashiers and collectors work within these hours. */
  opens_at?: string
  closes_at?: string
  workdays?: number[]
}

export function listBranches(): Promise<Paginated<Branch>> {
  return api('/api/v1/sucursales/?page_size=100')
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
  last_login: string | null
  /** Decision 120: an authenticator app or a passkey is set up. */
  mfa_enabled: boolean
  memberships: Membership[]
}

/** The whole team in one page (up to 100: the API's maximum). */
export function listUsers(): Promise<Paginated<CompanyUser>> {
  return api('/api/v1/usuarios/?page_size=100')
}

export function setUserActive(id: string, active: boolean): Promise<CompanyUser> {
  const action = active ? 'activate' : 'deactivate'
  return api(`/api/v1/usuarios/${id}/${action}/`, { method: 'POST' })
}

/** Decision 120: the person lost the phone and the codes; they set the
 * second step up again at their next sign-in. */
export function resetUserMfa(id: string, note: string): Promise<CompanyUser> {
  return api(`/api/v1/usuarios/${id}/restablecer-2fa/`, { method: 'POST', body: { note } })
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
