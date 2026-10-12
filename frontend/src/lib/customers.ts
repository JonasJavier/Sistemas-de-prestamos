import type { CustomerListItem } from '../api/customers'
import { nearDay, plural } from './format'

/** The state of a customer at a glance: a chip with its dot (decision 114). */
export function customerState(customer: CustomerListItem): { label: string; tone: string } {
  const p = customer.portfolio
  if (customer.status === 'blocked') return { label: 'Bloqueado', tone: 'danger' }
  if (!p || !p.active_loans) return { label: 'Sin préstamo', tone: 'neutral' }
  if (p.days_past_due > 0)
    return {
      label: `${plural(p.days_past_due, 'día')} de atraso`,
      tone: p.days_past_due > 30 ? 'danger' : 'warning',
    }
  if (p.next_due && nearDay(p.next_due) === 'Hoy') return { label: 'Vence hoy', tone: 'info' }
  return { label: 'Al día', tone: 'brand' }
}

/** Where a customer pays: the collector's route or the office. */
export const routeOf = (customer: CustomerListItem) =>
  !customer.portfolio?.active_loans
    ? 'Sin préstamo activo'
    : (customer.portfolio.collector ?? 'Paga en oficina')
