import { describe, expect, it } from 'vitest'

import type { Me } from '../api/accounts'
import { ACCESS, hasRole } from './roles'

const me = (...roles: string[]) => ({ roles }) as Me

describe('role groups mirror the API permission classes (doc 06 - 3)', () => {
  it('lets only G, SU and OF originate', () => {
    expect(hasRole(me('Oficial de crédito'), ACCESS.originate)).toBe(true)
    expect(hasRole(me('Cajero'), ACCESS.originate)).toBe(false)
    expect(hasRole(me('Cobrador'), ACCESS.originate)).toBe(false)
  })

  it('keeps whoever disburses apart from the collector', () => {
    expect(hasRole(me('Cajero'), ACCESS.disburse)).toBe(true)
    expect(hasRole(me('Cobrador'), ACCESS.disburse)).toBe(false)
    expect(hasRole(me('Cobrador'), ACCESS.loans)).toBe(true)
  })

  it('separates the cash roles of phase 4 (doc 06 - 3 and 4)', () => {
    expect(hasRole(me('Cajero'), ACCESS.myCash)).toBe(true)
    expect(hasRole(me('Gerente'), ACCESS.myCash)).toBe(false) // approves, never holds a drawer
    expect(hasRole(me('Cobrador'), ACCESS.collect)).toBe(true)
    expect(hasRole(me('Cobrador'), ACCESS.requestReversal)).toBe(false)
    expect(hasRole(me('Cobrador'), ACCESS.myRoute)).toBe(true)
    expect(hasRole(me('Cajero'), ACCESS.routes)).toBe(false)
  })

  it('answers false without a session or roles', () => {
    expect(hasRole(undefined, ACCESS.loans)).toBe(false)
    expect(hasRole(me(), ACCESS.loans)).toBe(false)
  })
})
