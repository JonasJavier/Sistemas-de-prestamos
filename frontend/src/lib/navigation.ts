/** Only a path of this app: never «//otro.sitio» nor back to the sign-in. */
export function safeReturn(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/')) return undefined
  if (value.startsWith('//') || value.includes('\\') || value.startsWith('/entrar')) {
    return undefined
  }
  return value
}
