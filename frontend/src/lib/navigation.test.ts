import { describe, expect, it } from 'vitest'

import { safeReturn } from './navigation'

describe('safeReturn (back where the session closed)', () => {
  it('keeps a path of the app with its search', () => {
    expect(safeReturn('/cobrar/01-000010')).toBe('/cobrar/01-000010')
    expect(safeReturn('/prestamos?estado=active')).toBe('/prestamos?estado=active')
  })

  it('never leaves the app nor loops to the sign-in', () => {
    expect(safeReturn('https://otro.sitio')).toBeUndefined()
    expect(safeReturn('//otro.sitio/x')).toBeUndefined()
    expect(safeReturn('/\\otro.sitio')).toBeUndefined()
    expect(safeReturn('/entrar?motivo=sesion')).toBeUndefined()
    expect(safeReturn(undefined)).toBeUndefined()
    expect(safeReturn(42)).toBeUndefined()
  })
})
