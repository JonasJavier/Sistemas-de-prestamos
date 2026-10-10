import { describe, expect, it } from 'vitest'

import {
  amountValue,
  dateFromText,
  dateOf,
  dateText,
  deviceText,
  documentText,
  day,
  errorMessage,
  fractionToPercent,
  installmentsText,
  pct,
  phoneText,
  percentToFraction,
  rd,
  splitAmount,
  toAmount,
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

  it('puts the sign before the currency and never shows -0.00', () => {
    expect(rd('-117158.99')).toBe('-RD$ 117,158.99')
    expect(rd('-0.001')).toBe('RD$ 0.00')
    expect(splitAmount(rd('-5'))).toEqual({ sign: '-', amount: '5.00' })
    expect(splitAmount('3 de 4')).toBeNull()
  })
})

describe('pct', () => {
  it('drops only the zeros after the decimal point', () => {
    expect(pct('0.025')).toBe('2.5%')
    expect(pct('0.4')).toBe('40%')
    expect(pct('1')).toBe('100%')
    expect(pct('0.10')).toBe('10%')
    expect(pct('14.3641')).toBe('1,436.41%')
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

describe('documents and phones as people write them', () => {
  it('formats cédula, RNC and local phones', () => {
    expect(documentText('00112345674')).toBe('001-1234567-4')
    expect(documentText('101123456')).toBe('1-01-12345-6')
    expect(phoneText('8095550101')).toBe('809-555-0101')
    expect(phoneText('18295550102')).toBe('1-829-555-0102')
  })

  it('leaves masked or foreign values as they come', () => {
    expect(documentText('001-•••••67-4')).toBe('001-•••••67-4')
    expect(documentText('')).toBe('—')
    expect(phoneText('+34 600 123 456')).toBe('+34 600 123 456')
    expect(phoneText(null)).toBe('')
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

  it('finds the message inside nested serializers instead of returning an object', () => {
    expect(errorMessage({ vehicle: { brand: ['La marca es obligatoria.'] } })).toBe(
      'La marca es obligatoria.',
    )
    expect(errorMessage({ status: 400, errors: [{ code: 'x', message: 'Mal.' }] })).toBe('Mal.')
  })
})

describe('deviceText', () => {
  it('names the browser and the system of a session', () => {
    const edge =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0'
    const android =
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'
    expect(deviceText(edge)).toBe('Edge en Windows')
    expect(deviceText(android)).toBe('Chrome en Android')
    expect(deviceText('curl/8.0')).toBe('Navegador en otro sistema')
  })
})

describe('typed amounts («25,000» as people write them)', () => {
  it('reads the thousands comma', () => {
    expect(amountValue('25,000')).toBe(25000)
    expect(amountValue(' 1,250.50 ')).toBe(1250.5)
    expect(toAmount('25,000')).toBe('25000.00')
  })

  it('treats empty or unreadable as nothing', () => {
    expect(amountValue('')).toBe(0)
    expect(amountValue('abc')).toBe(0)
    expect(toAmount('')).toBe('')
    expect(toAmount('abc')).toBe('')
  })
})

describe('date boxes read and write dd/mm/aaaa, whatever the browser language', () => {
  it('writes an ISO date the Dominican way', () => {
    expect(dateText('2026-10-09')).toBe('09/10/2026')
    expect(dateText('')).toBe('')
    expect(dateText(null)).toBe('')
  })
  it('reads what was typed, with one or two digits', () => {
    expect(dateFromText('09/10/2026')).toBe('2026-10-09')
    expect(dateFromText('9/1/2027')).toBe('2027-01-09')
    expect(dateFromText(' 2026-10-09 ')).toBe('2026-10-09') // pasted
  })
  it('waits for a complete, real day', () => {
    expect(dateFromText('09/10/26')).toBeNull()
    expect(dateFromText('09/10/')).toBeNull()
    expect(dateFromText('31/02/2026')).toBeNull()
    expect(dateFromText('29/02/2028')).toBe('2028-02-29')
    expect(dateFromText('10/13/2026')).toBeNull() // no month 13: not mm/dd
  })
})
