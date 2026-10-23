/** Conveniences of the sign-in screen on this device (decision 118): the last
 * email used and whether this device keeps the session open. Losing the
 * storage only means typing them again. */

const EMAIL_KEY = 'cobradia-email'
const REMEMBER_KEY = 'cobradia-remember'

export function lastEmail(): string {
  try {
    return localStorage.getItem(EMAIL_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveLastEmail(email: string): void {
  try {
    localStorage.setItem(EMAIL_KEY, email)
  } catch {
    // storage unavailable: the next visit types it again
  }
}

export function keepsSession(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) === '1'
  } catch {
    return false
  }
}

export function saveKeepsSession(on: boolean): void {
  try {
    localStorage.setItem(REMEMBER_KEY, on ? '1' : '0')
  } catch {
    // storage unavailable: the box starts unchecked next time
  }
}
