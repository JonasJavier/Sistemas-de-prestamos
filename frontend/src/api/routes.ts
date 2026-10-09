/** Phase 4: «Mi ruta» (P40-P41), the supervisor's routes and map (P45),
 * visits and the portfolio assignment. */

import { api, toQuery } from './client'

export interface RouteStop {
  loan_number: string
  customer_id: string
  customer_name: string
  phone: string
  address: string
  latitude: string | null
  longitude: string | null
  reason: 'overdue' | 'due_today' | 'promise'
  amount_due: string
  days_past_due: number
  position: number
  visited_at: string | null
  payment: { number: string; amount: string } | null
  action: { result: string; note: string } | null
}

export interface MyRoute {
  date: string
  consent: boolean
  consent_text: string
  route: {
    id: string
    status: 'open' | 'settled'
    business_date: string
    cash: string
    collected: string
    payments: number
    stale: boolean
  } | null
  progress: { stops: number; visited: number; paid: number }
  stops: RouteStop[]
  branches: { id: string; name: string }[]
}

export const getMyRoute = (): Promise<MyRoute> => api('/api/v1/ruta/')

export const acceptLocationConsent = (): Promise<MyRoute> =>
  api('/api/v1/ruta/consentimiento/', { method: 'POST' })

export const openRoute = (branch?: string): Promise<MyRoute> =>
  api('/api/v1/ruta/abrir/', { method: 'POST', body: branch ? { branch } : {} })

export const reorderRoute = (loans: string[]): Promise<MyRoute> =>
  api('/api/v1/ruta/orden/', { method: 'POST', body: { loans } })

export const sendPing = (body: {
  latitude: string
  longitude: string
  accuracy?: number | null
}): Promise<{ recorded: boolean }> => api('/api/v1/ruta/ubicacion/', { method: 'POST', body })

export type VisitResult = 'not_home' | 'promised' | 'refused' | 'other'

export const recordVisit = (
  number: string,
  body: {
    result: VisitResult
    note?: string
    kind?: 'visit' | 'call' | 'message'
    latitude?: string | null
    longitude?: string | null
  },
): Promise<{ id: string }> =>
  api(`/api/v1/prestamos/${encodeURIComponent(number)}/gestiones/`, { method: 'POST', body })

export interface Visit {
  id: string
  kind: string
  result: string
  note: string
  user_name: string | null
  created_at: string
}

export const listVisits = (number: string): Promise<Visit[]> =>
  api(`/api/v1/prestamos/${encodeURIComponent(number)}/gestiones/`)

export const pinCustomer = (
  number: string,
  body: { latitude: string; longitude: string },
): Promise<unknown> =>
  api(`/api/v1/prestamos/${encodeURIComponent(number)}/ubicacion-cliente/`, {
    method: 'POST',
    body,
  })

export interface CollectorDay {
  id: string
  name: string | null
  route: {
    id: string
    status: 'open' | 'settled'
    cash: string
    delivered: string | null
    difference: string | null
  } | null
  stops: { total: number; visited: number; paid: number }
  collected: string
  off_route: number
  last_ping: string | null
  loans: number
  loans_in_arrears: number
}

export const getRoutes = (
  date?: string,
): Promise<{
  date: string
  collectors: CollectorDay[]
  unassigned_loans: number
}> => api(`/api/v1/rutas/${toQuery({ fecha: date })}`)

export interface RouteMap {
  collector_name: string | null
  date: string
  pings: { at: string; lat: string; lng: string }[]
  payments: { number: string; amount: string; at: string; lat: string; lng: string }[]
  visits: { result: string; at: string; lat: string; lng: string }[]
}

export const getRouteMap = (collectorId: string, date?: string): Promise<RouteMap> =>
  api(`/api/v1/rutas/${collectorId}/mapa/${toQuery({ fecha: date })}`)

export const listCollectors = (): Promise<{ id: string; name: string | null }[]> =>
  api('/api/v1/rutas/asignar/')

export const assignCollector = (body: {
  loans: string[]
  collector: string | null
  note?: string
}): Promise<{ changed: number }> => api('/api/v1/rutas/asignar/', { method: 'POST', body })
