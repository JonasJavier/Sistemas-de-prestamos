/** Phase 5 (F8 steps 3-6): actions with their promise and follow-up (P42),
 * the agenda (P44), the collection agent and the escalation rules
 * (decisions 076-079). */

import { api } from './client'

export type ActionKind = 'call' | 'visit' | 'message'
export type ActionResult =
  'promised' | 'contacted' | 'not_home' | 'no_answer' | 'wrong_number' | 'refused' | 'other'

export const ACTION_KINDS: { value: ActionKind; label: string }[] = [
  { value: 'call', label: 'Llamada' },
  { value: 'visit', label: 'Visita' },
  { value: 'message', label: 'Mensaje' },
]

export const ACTION_RESULTS: { value: ActionResult; label: string }[] = [
  { value: 'promised', label: 'Prometió pagar' },
  { value: 'contacted', label: 'Habló, sin compromiso' },
  { value: 'no_answer', label: 'No contestó' },
  { value: 'not_home', label: 'No estaba' },
  { value: 'wrong_number', label: 'Número equivocado' },
  { value: 'refused', label: 'Se negó' },
  { value: 'other', label: 'Otro' },
]

export interface ActionRequest {
  kind: ActionKind
  result: ActionResult
  note?: string
  promise_on?: string | null
  promise_amount?: string | null
  follow_up_on?: string | null
  latitude?: string | null
  longitude?: string | null
}

export const recordAction = (number: string, body: ActionRequest): Promise<{ id: string }> =>
  api(`/api/v1/prestamos/${encodeURIComponent(number)}/gestiones/`, { method: 'POST', body })

export interface LoanBrief {
  number: string
  customer_id: string
  customer_name: string
  phone: string
  branch_name: string
  days_past_due: number
  principal_outstanding: string
  agent_name: string | null
}

export interface PaymentPromise {
  id: string
  promised_on: string
  amount: string
  status: 'pending' | 'kept' | 'broken' | 'cancelled'
  status_label: string
  paid: string
  note: string
  created_at: string
  created_by_name: string | null
  resolved_at: string | null
  loan?: LoanBrief
  loan_number?: string
}

export interface Task {
  id: string
  kind: 'follow_up' | 'broken_promise' | 'escalation'
  kind_label: string
  action_label: string | null
  status: 'open' | 'done' | 'cancelled'
  due_on: string
  note: string
  assigned_name: string | null
  done_at: string | null
  done_by_name: string | null
  done_note: string
  can_act: boolean
  loan?: LoanBrief
  loan_number?: string
}

export interface CollectionActionRow {
  id: string
  kind: ActionKind
  kind_label: string
  result: string
  result_label: string
  note: string
  user_name: string | null
  created_at: string
  loan_number: string
}

export interface Timeline {
  pending_promise: PaymentPromise | null
  actions: CollectionActionRow[]
  promises: PaymentPromise[]
  tasks: Task[]
}

export const getLoanTimeline = (number: string): Promise<Timeline> =>
  api(`/api/v1/prestamos/${encodeURIComponent(number)}/cobranza/`)

export const getCustomerTimeline = (id: string): Promise<Timeline> =>
  api(`/api/v1/clientes/${id}/cobranza/`)

export interface Agenda {
  today: string
  scope: 'mine' | 'branch'
  can_switch: boolean
  promises_today: PaymentPromise[]
  tasks: Task[]
  broken: PaymentPromise[]
  upcoming: { promises: PaymentPromise[]; tasks: Task[] }
  month: { kept: number; broken: number; rate: number | null }
}

export const getAgenda = (scope: 'mine' | 'branch'): Promise<Agenda> =>
  api(`/api/v1/agenda/${scope === 'branch' ? '?alcance=sucursal' : ''}`)

export const cancelPromise = (id: string, note: string): Promise<PaymentPromise> =>
  api(`/api/v1/promesas/${id}/cancelar/`, { method: 'POST', body: { note } })

export const createFollowUp = (body: {
  loan: string
  due_on: string
  note: string
  assigned_to?: string | null
}): Promise<Task> => api('/api/v1/seguimientos/', { method: 'POST', body })

export const completeTask = (id: string, note = ''): Promise<Task> =>
  api(`/api/v1/seguimientos/${id}/hecho/`, { method: 'POST', body: { note } })

export const rescheduleTask = (id: string, dueOn: string): Promise<Task> =>
  api(`/api/v1/seguimientos/${id}/reprogramar/`, { method: 'POST', body: { due_on: dueOn } })

export interface Agent {
  id: string
  name: string | null
  roles: string[]
}

export const listAgents = (): Promise<Agent[]> => api('/api/v1/gestores/')

export const assignAgent = (body: {
  loans: string[]
  agent: string | null
  note?: string
}): Promise<{ changed: number }> => api('/api/v1/gestores/asignar/', { method: 'POST', body })

export interface EscalationRule {
  id: string
  action: 'review' | 'intimation' | 'legal'
  action_label: string
  min_days: number
  role: string
  is_active: boolean
}

export const listEscalationRules = (): Promise<EscalationRule[]> =>
  api('/api/v1/reglas-escalamiento/')

export const updateEscalationRules = (
  rows: { id: string; min_days?: number; is_active?: boolean }[],
): Promise<EscalationRule[]> => api('/api/v1/reglas-escalamiento/', { method: 'PATCH', body: rows })
