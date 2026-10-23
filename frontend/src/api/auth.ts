import { api, ApiError } from './client'

/** allauth headless, browser client. */
const BASE = '/api/v1/auth/browser/v1'

export interface SessionUser {
  id: string
  email: string
  display: string
}

interface AllauthResponse {
  status: number
  data?: { user?: SessionUser; flows?: { id: string; is_pending?: boolean }[] }
  meta?: { is_authenticated?: boolean }
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const response = await api<AllauthResponse>(`${BASE}/auth/session`)
    return response.data?.user ?? null
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 410)) return null
    throw error
  }
}

export interface LoginResult {
  user: SessionUser | null
  pendingFlow: string | null
}

export async function login(email: string, password: string): Promise<LoginResult> {
  try {
    const response = await api<AllauthResponse>(`${BASE}/auth/login`, {
      method: 'POST',
      body: { email, password },
    })
    return { user: response.data?.user ?? null, pendingFlow: null }
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      const data = error.data as AllauthResponse
      const pending = data.data?.flows?.find((flow) => flow.is_pending)
      if (pending) return { user: null, pendingFlow: pending.id }
    }
    throw error
  }
}

export async function logout(): Promise<void> {
  try {
    await api(`${BASE}/auth/session`, { method: 'DELETE' })
  } catch (error) {
    // allauth answers 401 once the session is gone: that is success here.
    if (!(error instanceof ApiError && error.status === 401)) throw error
  }
}

/** Mi cuenta: the current password proves it is you; the session stays open. */
export async function changePassword(current: string, next: string): Promise<void> {
  await api(`${BASE}/account/password/change`, {
    method: 'POST',
    body: { current_password: current, new_password: next },
  })
}

export interface TotpConfig {
  secret: string
  totp_url: string
}

/** 404 means "not configured yet" and carries the fresh secret. */
export async function getTotpConfig(): Promise<{ active: boolean; config: TotpConfig | null }> {
  try {
    await api(`${BASE}/account/authenticators/totp`)
    return { active: true, config: null }
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      const data = error.data as { meta?: TotpConfig }
      if (data?.meta?.secret) return { active: false, config: data.meta }
    }
    throw error
  }
}

export async function activateTotp(code: string): Promise<void> {
  await api(`${BASE}/account/authenticators/totp`, { method: 'POST', body: { code } })
}

/** What protects the account; reading it never asks for the password again. */
export interface AuthenticatorInfo {
  type: 'totp' | 'recovery_codes' | 'webauthn'
  /** Unix seconds. */
  created_at: number
  last_used_at: number | null
  total_code_count?: number
  unused_code_count?: number
}

export async function listAuthenticators(): Promise<AuthenticatorInfo[]> {
  const response = await api<{ data: AuthenticatorInfo[] }>(`${BASE}/account/authenticators`)
  return response.data
}

/**
 * allauth answers 401 while the user is still signed in when a sensitive step
 * (2FA, recovery codes) needs a sign-in from the last 5 minutes: the screen
 * asks for the password again instead of treating it as a closed session.
 */
export function isReauthRequired(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 401) return false
  return (error.data as AllauthResponse | null)?.meta?.is_authenticated === true
}

export async function reauthenticate(password: string): Promise<void> {
  await api(`${BASE}/auth/reauthenticate`, { method: 'POST', body: { password } })
}

interface RecoveryCodesData {
  unused_codes?: string[]
}

export async function regenerateRecoveryCodes(): Promise<string[]> {
  const response = await api<{ data?: RecoveryCodesData }>(
    `${BASE}/account/authenticators/recovery-codes`,
    { method: 'POST', body: {} },
  )
  return response.data?.unused_codes ?? []
}

export async function getRecoveryCodes(): Promise<string[] | null> {
  try {
    const response = await api<{ data?: RecoveryCodesData }>(
      `${BASE}/account/authenticators/recovery-codes`,
    )
    return response.data?.unused_codes ?? null
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

export async function mfaAuthenticate(code: string): Promise<SessionUser | null> {
  const response = await api<AllauthResponse>(`${BASE}/auth/2fa/authenticate`, {
    method: 'POST',
    body: { code },
  })
  return response.data?.user ?? null
}

export async function verifyEmail(key: string): Promise<void> {
  try {
    await api(`${BASE}/auth/email/verify`, { method: 'POST', body: { key } })
  } catch (error) {
    // allauth answers 401 when the email was verified but the user is not
    // signed in yet; an invalid or spent key answers 400.
    if (error instanceof ApiError && error.status === 401) return
    throw error
  }
}

/** allauth headless errors come as { errors: [{ message, code, param }] }. */
export function authErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null
  const errors = (error.data as { errors?: { code?: string }[] } | null)?.errors
  return errors?.[0]?.code ?? null
}

export function authErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback
  const errors = (error.data as { errors?: { message?: string }[] } | null)?.errors
  return errors?.[0]?.message ?? fallback
}

/** Always answers the same, registered or not: no one can probe emails. */
export async function requestPasswordReset(email: string): Promise<void> {
  await api(`${BASE}/auth/password/request`, { method: 'POST', body: { email } })
}

export async function resetPassword(key: string, password: string): Promise<void> {
  try {
    await api(`${BASE}/auth/password/reset`, { method: 'POST', body: { key, password } })
  } catch (error) {
    // 401 = the password changed and the user must sign in again (2FA included).
    if (error instanceof ApiError && error.status === 401) return
    throw error
  }
}

/** allauth.usersessions: where the account is signed in (doc 06 - 6). */
export interface UserSessionInfo {
  id: number
  user_agent: string
  ip: string
  /** Unix seconds. */
  created_at: number
  is_current: boolean
}

export async function listSessions(): Promise<UserSessionInfo[]> {
  const response = await api<{ data: UserSessionInfo[] }>(`${BASE}/auth/sessions`)
  return response.data
}

export async function endSessions(ids: number[]): Promise<UserSessionInfo[]> {
  const response = await api<{ data: UserSessionInfo[] }>(`${BASE}/auth/sessions`, {
    method: 'DELETE',
    body: { sessions: ids },
  })
  return response.data
}
