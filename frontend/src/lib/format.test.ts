import { describe, expect, it } from 'vitest'

import {
  dateOf,
  day,
  errorMessage,
  fractionToPercent,
  installmentsText,
  pct,
  percentToFraction,
  rd,
} from './format'

describe('rd (doc 09 - 1: RD$ 1,250.00)', () => {
  it('formats with two decimals and thousands separators', () => {
    expect(rd('1250.5')).toBe('RD$ 1,250.50')
    expect(rd(0)).toBe('RD$ 0.00')
  })

  it('shows a dash for missing values, not RD$ 0.00', () => {
    expect(rd(null)).toBe('—')
    expect(rd(undefined)).toBe('—')
    expect(rd('')).toBe('—')
  })
})

describe('pct', () => {
  it('drops only the zeros after the decimal point', () => {
    expect(pct('0.025')).toBe('2.5%')
    expect(pct('0.4')).toBe('40%')
    expect(pct('1')).toBe('100%')
    expect(pct('0.10')).toBe('10%')
  })
})

describe('dates (doc 09 - 1: 04/10/2026)', () => {
  it('pads day and month of business dates', () => {
    expect(day('2026-10-04')).toBe('04/10/2026')
    expect(day('2026-11-06T00:00:00')).toBe('06/11/2026')
    expect(day(null)).toBe('—')
  })

  it('reads instants in local time instead of slicing the UTC text', () => {
    const instant = new Date(2026, 9, 6, 22, 30) // 10:30 p.m. local, already the 7th in UTC
    expect(dateOf(instant.toISOString())).toBe('06/10/2026')
  })
})

describe('rates typed as percentages', () => {
  it('converts both ways without float noise', () => {
    expect(percentToFraction('5')).toBe('0.05')
    expect(percentToFraction('4.5')).toBe('0.045')
    expect(percentToFraction('12,5')).toBe('0.125')
    expect(fractionToPercent('0.045')).toBe('4.5')
    expect(fractionToPercent('0.1000')).toBe('10')
    expect(fractionToPercent(percentToFraction('3.333'))).toBe('3.333')
  })

  it('leaves empty and invalid input for the server to explain', () => {
    expect(percentToFraction('')).toBe('')
    expect(percentToFraction('abc')).toBe('abc')
    expect(fractionToPercent('')).toBe('')
  })
})

describe('installmentsText', () => {
  it('agrees in number', () => {
    expect(installmentsText(12, 'monthly')).toBe('12 cuotas mensuales')
    expect(installmentsText(1, 'weekly')).toBe('1 cuota semanal')
  })
})

describe('errorMessage', () => {
  it('takes the first DRF message', () => {
    expect(errorMessage({ detail: 'Sin permiso.' })).toBe('Sin permiso.')
    expect(errorMessage({ amount: ['Fuera de rango.'] })).toBe('Fuera de rango.')
    expect(errorMessage(null, 'Falló.')).toBe('Falló.')
  })
})
