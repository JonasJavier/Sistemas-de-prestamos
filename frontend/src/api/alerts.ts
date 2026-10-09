/** P79 «Alertas antifraude» (decision 090): alerts to review and the rules. */

import { api, toQuery, type Page } from './client'

export interface FraudAlert {
  id: string
  kind: string
  kind_label: string
  subject: { id: string; name: string } | null
  count: number
  threshold: number
  window_days: number
  detail: string
  status: 'open' | 'reviewed'
  status_label: string
  created_at: string
  reviewed_by: string
  reviewed_at: string | null
  review_note: string
}

export interface FraudRule {
  id: string
  kind: string
  label: string
  threshold: number
  window_days: number
  is_active: boolean
}

export function listFraudAlerts(
  estado: FraudAlert['status'],
  page = 1,
): Promise<Page<FraudAlert> & { open: number }> {
  return api(`/api/v1/alertas/${toQuery({ estado, page })}`)
}

export function reviewFraudAlert(id: string, note: string): Promise<FraudAlert> {
  return api(`/api/v1/alertas/${id}/revisar/`, { method: 'POST', body: { note } })
}

export function listFraudRules(): Promise<FraudRule[]> {
  return api('/api/v1/alertas/reglas/')
}

export function updateFraudRule(
  id: string,
  data: Partial<Pick<FraudRule, 'threshold' | 'window_days' | 'is_active'>>,
): Promise<FraudRule> {
  return api(`/api/v1/alertas/reglas/${id}/`, { method: 'PATCH', body: data })
}
