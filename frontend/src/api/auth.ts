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
