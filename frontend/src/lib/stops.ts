import type { RouteStop } from '../api/routes'
import { rd } from './format'

export interface StopResult {
  label: string
  tone: string
  /** «Siguiente» is drawn on forest, the rest as soft chips. */
  next?: boolean
}

/** The result of a stop as a chip (decision 114): a payment (whole or part),
 * what the visit left (a promise, nobody home…), the next one or pending. */
export function stopResult(stop: RouteStop, next: RouteStop | undefined): StopResult {
  if (stop.payment)
    return Number(stop.payment.amount) + 0.005 < Number(stop.amount_due)
      ? { label: 'Pago parcial', tone: 'info' }
      : { label: 'Pagó', tone: 'brand' }
  if (stop.action) {
    if (stop.action.code === 'promised') return { label: 'Prometió', tone: 'gold' }
    if (stop.action.code === 'not_home') return { label: 'No estaba', tone: 'warning' }
    if (stop.action.code === 'refused') return { label: 'Se negó', tone: 'danger' }
    return { label: stop.action.result, tone: 'neutral' }
  }
  if (stop === next) return { label: 'Siguiente', tone: 'brand', next: true }
  return { label: 'Pendiente', tone: 'neutral' }
}

/** The first stop without a visit, in the collector's order. */
export const nextStop = (stops: RouteStop[]) =>
  stops.find((stop) => !stop.visited_at && !stop.payment && !stop.action)

/** How the day is going: visits, payments, promises and nobody home. */
export function tally(stops: RouteStop[]) {
  return {
    visited: stops.filter((s) => s.visited_at || s.payment || s.action).length,
    paid: stops.filter((s) => s.payment).length,
    promised: stops.filter((s) => s.action?.code === 'promised').length,
    notHome: stops.filter((s) => s.action?.code === 'not_home').length,
  }
}

export interface Activity {
  at: string
  kind: 'payment' | 'promise' | 'not_home' | 'other'
  text: string
  position: number
}

/** The live feed (decision 114): what happened at each stop, newest first. */
export function activityOf(stops: RouteStop[]): Activity[] {
  const events: Activity[] = []
  for (const stop of stops) {
    const first = stop.customer_name
    if (stop.payment?.at)
      events.push({
        at: stop.payment.at,
        kind: 'payment',
        text: `Cobro ${rd(stop.payment.amount)} a ${first}${stop.payment.method ? ` · ${stop.payment.method.toLowerCase()}` : ''}`,
        position: stop.position,
      })
    if (stop.action?.at && stop.action.code !== 'paid')
      events.push({
        at: stop.action.at,
        kind:
          stop.action.code === 'promised'
            ? 'promise'
            : stop.action.code === 'not_home'
              ? 'not_home'
              : 'other',
        text: `${stop.action.result}: ${first}${stop.action.note ? `. ${stop.action.note}` : ''}`,
        position: stop.position,
      })
  }
  return events.sort((a, b) => b.at.localeCompare(a.at))
}
