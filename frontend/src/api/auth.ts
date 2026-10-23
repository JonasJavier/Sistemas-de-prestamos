import type {
  CredentialCreationOptionsJSON,
  CredentialRequestOptionsJSON,
  PublicKeyCredentialWithAssertionJSON,
  PublicKeyCredentialWithAttestationJSON,
} from '@github/webauthn-json'

import { api, ApiError, ensureCsrf } from './client'

/** allauth headless, browser client. */
const BASE = '/api/v1/auth/browser/v1'

export interface SessionUser {
  id: string
  email: string
  display: string
}

interface AllauthResponse {
  status: number
  data?: { user?: SessionUser; flows?: { id: string; is_pending?: boolean; types?: string[] }[] }
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
  /** The step still missing: «mfa_authenticate», «mfa_trust», «provider_signup»… */
  pendingFlow: string | null
  /** For «mfa_authenticate»: what the person can answer with («totp», «webauthn»…). */
  pendingTypes: string[]
}

/** A sign-in step: allauth answers 401 with the next pending step, if any. */
async function step(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<LoginResult> {
  try {
    const response = await api<AllauthResponse>(`${BASE}${path}`, options)
    return { user: response.data?.user ?? null, pendingFlow: null, pendingTypes: [] }
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      const data = error.data as AllauthResponse
      const pending = data.data?.flows?.find((flow) => flow.is_pending)
      return { user: null, pendingFlow: pending?.id ?? null, pendingTypes: pending?.types ?? [] }
    }
    throw error
  }
}

export function login(email: string, password: string): Promise<LoginResult> {
  return step('/auth/login', { method: 'POST', body: { email, password } })
}

/** Where a sign-in stands now: signed in, a step pending, or neither. */
export async function getAuthStatus(): Promise<LoginResult> {
  try {
    return await step('/auth/session')
  } catch (error) {
    if (error instanceof ApiError && error.status === 410)
      return { user: null, pendingFlow: null, pendingTypes: [] }
    throw error
  }
}

/** Decision 118: «Mantenerme conectado», sent right before signing in. */
export async function rememberChoice(remember: boolean): Promise<void> {
  await api('/api/v1/sesion/recordar/', { method: 'POST', body: { remember } })
}

interface ProviderInfo {
  id: string
  name: string
}

/** The sign-in providers this installation offers (Google once configured). */
export async function getProviders(): Promise<ProviderInfo[]> {
  const response = await api<{ data: { socialaccount?: { providers: ProviderInfo[] } } }>(
    `${BASE}/config`,
  )
  return response.data.socialaccount?.providers ?? []
}

/** Why the person went to Google; the return page (/entrar/google) reads it. */
export type GoogleIntent =
  | { kind: 'login'; desde?: string }
  | { kind: 'register' }
  | { kind: 'invitation'; token: string }
  | { kind: 'connect' }

const INTENT_KEY = 'cobradia-google'

export function readGoogleIntent(): GoogleIntent | null {
  try {
    const text = sessionStorage.getItem(INTENT_KEY)
    return text ? (JSON.parse(text) as GoogleIntent) : null
  } catch {
    return null
  }
}

/** Leaves for Google's page, which sends the person back to /entrar/google.
 * A real form post, as allauth asks: the browser follows the redirects. */
export async function continueWithGoogle(intent: GoogleIntent): Promise<void> {
  try {
    sessionStorage.setItem(INTENT_KEY, JSON.stringify(intent))
  } catch {
    // storage unavailable: the return page still signs in, without the detour
  }
  const fields = {
    provider: 'google',
    process: intent.kind === 'connect' ? 'connect' : 'login',
    callback_url: '/entrar/google',
    csrfmiddlewaretoken: await ensureCsrf(),
  }
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = `${BASE}/auth/provider/redirect`
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    form.append(input)
  }
  document.body.append(form)
  form.submit()
}

export interface GoogleSignup {
  email: string
  first_name: string
  last_name: string
}

/** The Google account waiting to join (409: there is none). */
export async function getGoogleSignup(): Promise<GoogleSignup> {
  const response = await api<{
    data: { user: { email?: string }; account: { display?: string } }
  }>(`${BASE}/auth/provider/signup`)
  const [first = '', ...rest] = (response.data.account.display ?? '').trim().split(/\s+/)
  return { email: response.data.user.email ?? '', first_name: first, last_name: rest.join(' ') }
}

export type GoogleJoin = GoogleSignup &
  (
    | { company_legal_name: string; rnc?: string; phone?: string; accept_terms: boolean }
    | { invitation: string }
  )

/** Joins with Google: the company it registers, or the invitation it accepts. */
export function completeGoogleSignup(body: GoogleJoin): Promise<LoginResult> {
  return step('/auth/provider/signup', { method: 'POST', body })
}

export interface ConnectedAccount {
  uid: string
  display: string
  provider: ProviderInfo
}

export async function listConnectedAccounts(): Promise<ConnectedAccount[]> {
  const response = await api<{ data: ConnectedAccount[] }>(`${BASE}/account/providers`)
  return response.data
}

export async function disconnectAccount(account: ConnectedAccount): Promise<void> {
  await api(`${BASE}/account/providers`, {
    method: 'DELETE',
    body: { provider: account.provider.id, account: account.uid },
  })
}

export async function logout(): Promise<void> {
  try {
    await api(`${BASE}/auth/session`, { method: 'DELETE' })
  } catch (error) {
    // allauth answers 401 once the session is gone: that is success here.
    if (!(error instanceof ApiError && error.status === 401)) throw error
  }
}

/** Mi cuenta: the current password proves it is you; the session stays open.
 * Whoever joined with Google creates their first one without it (null). */
export async function changePassword(current: string | null, next: string): Promise<void> {
  await api(`${BASE}/account/password/change`, {
    method: 'POST',
    body:
      current === null ? { new_password: next } : { current_password: current, new_password: next },
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

// --- Passkeys (decision 121) --------------------------------------------------

export interface PasskeyInfo extends AuthenticatorInfo {
  type: 'webauthn'
  id: number
  name: string
  is_passwordless?: boolean
}

/** The challenge to make a passkey that signs in on its own (no password). */
export async function getPasskeyCreationOptions(): Promise<CredentialCreationOptionsJSON> {
  const response = await api<{ data: { creation_options: CredentialCreationOptionsJSON } }>(
    `${BASE}/account/authenticators/webauthn?passwordless`,
  )
  return response.data.creation_options
}

export async function addPasskey(
  name: string,
  credential: PublicKeyCredentialWithAttestationJSON,
): Promise<PasskeyInfo> {
  const response = await api<{ data: PasskeyInfo }>(`${BASE}/account/authenticators/webauthn`, {
    method: 'POST',
    body: { name, credential },
  })
  return response.data
}

export async function renamePasskey(id: number, name: string): Promise<void> {
  await api(`${BASE}/account/authenticators/webauthn`, { method: 'PUT', body: { id, name } })
}

export async function removePasskey(id: number): Promise<void> {
  await api(`${BASE}/account/authenticators/webauthn`, {
    method: 'DELETE',
    body: { authenticators: [id] },
  })
}

/** allauth's challenge, signed by the device, in one go. */
async function signChallenge(path: string): Promise<PublicKeyCredentialWithAssertionJSON> {
  const { signWithPasskey } = await import('../lib/webauthn')
  const response = await api<{ data: { request_options: CredentialRequestOptionsJSON } }>(
    `${BASE}${path}`,
  )
  return signWithPasskey(response.data.request_options)
}

/** Signs in with a passkey alone: the person, the password and the code in one touch. */
export async function loginWithPasskey(): Promise<LoginResult> {
  const credential = await signChallenge('/auth/webauthn/login')
  return step('/auth/webauthn/login', { method: 'POST', body: { credential } })
}

/** The second step after the password, answered with the passkey instead of a code. */
export async function mfaAuthenticateWithPasskey(): Promise<LoginResult> {
  const credential = await signChallenge('/auth/webauthn/authenticate')
  return step('/auth/webauthn/authenticate', { method: 'POST', body: { credential } })
}

export async function reauthenticateWithPasskey(): Promise<void> {
  const credential = await signChallenge('/auth/webauthn/reauthenticate')
  await api(`${BASE}/auth/webauthn/reauthenticate`, { method: 'POST', body: { credential } })
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

/** Whoever joined with Google has no password: the app's code confirms it. */
export async function reauthenticateWithCode(code: string): Promise<void> {
  await api(`${BASE}/auth/2fa/reauthenticate`, { method: 'POST', body: { code } })
}

export interface ReauthMethods {
  password: boolean
  code: boolean
  passkey: boolean
}

/** The ways this person can confirm it is them (allauth's 401 lists them). */
export function reauthMethods(error: unknown): ReauthMethods {
  const flows =
    error instanceof ApiError ? ((error.data as AllauthResponse | null)?.data?.flows ?? []) : []
  const mfa = flows.find((flow) => flow.id === 'mfa_reauthenticate')
  const types = mfa?.types ?? []
  return {
    password: flows.some((flow) => flow.id === 'reauthenticate'),
    code: Boolean(mfa) && (types.length === 0 || types.includes('totp')),
    passkey: types.includes('webauthn'),
  }
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

export function mfaAuthenticate(code: string): Promise<LoginResult> {
  return step('/auth/2fa/authenticate', { method: 'POST', body: { code } })
}

/** Decision 118: after the code, this browser skips it for 30 days (or not). */
export function trustThisBrowser(trust: boolean): Promise<LoginResult> {
  return step('/auth/2fa/trust', { method: 'POST', body: { trust } })
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
