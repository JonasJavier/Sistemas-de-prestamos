import {
  create,
  get,
  supported,
  type CredentialCreationOptionsJSON,
  type CredentialRequestOptionsJSON,
  type PublicKeyCredentialWithAssertionJSON,
  type PublicKeyCredentialWithAttestationJSON,
} from '@github/webauthn-json'

/**
 * Passkeys (decision 121): the browser signs a challenge with the key the
 * device guards behind the fingerprint, the face or the PIN. allauth speaks
 * the standard JSON form of the WebAuthn options and credentials; this
 * module only turns them into the browser calls and back.
 */

/** Whether this browser and device can make and use passkeys. */
export function passkeysSupported(): boolean {
  return typeof window !== 'undefined' && supported()
}

/** The person closed the browser's prompt or the device refused. */
export class PasskeyCancelled extends Error {}

function cancelled(error: unknown): boolean {
  return error instanceof DOMException && ['NotAllowedError', 'AbortError'].includes(error.name)
}

/** Makes a passkey on this device from allauth's creation options. */
export async function createPasskey(
  options: CredentialCreationOptionsJSON,
): Promise<PublicKeyCredentialWithAttestationJSON> {
  try {
    return await create(options)
  } catch (error) {
    if (cancelled(error)) throw new PasskeyCancelled()
    throw error
  }
}

/** Signs allauth's challenge with a passkey of this device. */
export async function signWithPasskey(
  options: CredentialRequestOptionsJSON,
): Promise<PublicKeyCredentialWithAssertionJSON> {
  try {
    return await get(options)
  } catch (error) {
    if (cancelled(error)) throw new PasskeyCancelled()
    throw error
  }
}

/** A name for the new passkey from what the browser says about the device. */
export function suggestedPasskeyName(): string {
  const agent = navigator.userAgent
  if (/iPhone|iPad/.test(agent)) return 'Mi iPhone'
  if (/Android/.test(agent)) return 'Mi celular Android'
  if (/Macintosh/.test(agent)) return 'Mi Mac'
  if (/Windows/.test(agent)) return 'Mi computadora Windows'
  return 'Este dispositivo'
}
