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
