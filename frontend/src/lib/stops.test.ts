import { describe, expect, it } from 'vitest'

import type { RouteStop } from '../api/routes'
import { activityOf, nextStop, stopResult, tally } from './stops'

const stop = (position: number, extra: Partial<RouteStop> = {}): RouteStop => ({
  loan_number: `01-0000${position}`,
  customer_id: String(position),
  customer_name: `Cliente ${position}`,
  phone: '',
  address: '',
  latitude: null,
  longitude: null,
  reason: 'due_today',
  amount_due: '1000.00',
  days_past_due: 0,
  position,
  visited_at: null,
  payment: null,
  action: null,
  ...extra,
})

describe('the stops of a route (decision 115)', () => {
  const paid = stop(1, {
    visited_at: '2026-10-12T14:04:00Z',
    payment: { number: 'R1', amount: '1000.00', method: 'Efectivo', at: '2026-10-12T14:04:00Z' },
  })
  const partial = stop(2, {
    visited_at: '2026-10-12T14:12:00Z',
    payment: { number: 'R2', amount: '400.00', at: '2026-10-12T14:12:00Z' },
  })
  const promised = stop(3, {
    visited_at: '2026-10-12T14:19:00Z',
    action: { result: 'Prometió pagar', code: 'promised', note: '', at: '2026-10-12T14:19:00Z' },
  })
  const pending = stop(4)
  const later = stop(5)
  const stops = [paid, partial, promised, pending, later]

  it('reads each result and marks the next stop', () => {
    const next = nextStop(stops)
    expect(next).toBe(pending)
    expect(stops.map((s) => stopResult(s, next).label)).toEqual([
      'Pagó',
      'Pago parcial',
      'Prometió',
      'Siguiente',
      'Pendiente',
    ])
  })

  it('counts the day and lists the activity, newest first', () => {
    expect(tally(stops)).toEqual({ visited: 3, paid: 2, promised: 1, notHome: 0 })
    expect(activityOf(stops).map((a) => a.position)).toEqual([3, 2, 1])
  })
})
