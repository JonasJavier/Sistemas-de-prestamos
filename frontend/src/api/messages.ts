/** F18 · P80 (decision 097): templates, the record of messages, opt-outs. */

import { api, toQuery, type Page } from './client'

export type Channel = 'email' | 'sms' | 'whatsapp'

export interface MessageTemplate {
  id: string
  event: string
  event_label: string
  channel: Channel
  channel_label: string
  subject: string
  body: string
  is_active: boolean
}

export interface OutboundMessage {
  id: string
  event: string
  event_label: string
  channel: Channel
  channel_label: string
  to: string
  subject: string
  body: string
  status: 'queued' | 'sent' | 'logged' | 'failed' | 'skipped'
  status_label: string
  provider: string
  error: string
  customer: { id: string; name: string } | null
  loan: string | null
  created_at: string
  sent_at: string | null
}

export interface TemplatesPayload {
  templates: MessageTemplate[]
  variables: string[]
  providers: Record<Channel, { provider: string; ready: boolean }>
}

export const getTemplates = (): Promise<TemplatesPayload> => api('/api/v1/mensajes/plantillas/')

export const updateTemplate = (
  id: string,
  data: Partial<Pick<MessageTemplate, 'subject' | 'body' | 'is_active'>>,
): Promise<MessageTemplate> =>
  api(`/api/v1/mensajes/plantillas/${id}/`, { method: 'PATCH', body: data })

export const listMessages = (filters: {
  canal?: string
  estado?: string
  page?: number
}): Promise<Page<OutboundMessage>> => api(`/api/v1/mensajes/${toQuery(filters)}`)

export const sendTest = (channel: Channel, to: string): Promise<OutboundMessage> =>
  api('/api/v1/mensajes/prueba/', { method: 'POST', body: { channel, to } })

export interface CustomerMessages {
  messages: OutboundMessage[]
  opt_outs: { channel: string; channel_label: string; reason: string; created_at: string }[]
  portal_since: string | null
}

export const getCustomerMessages = (customerId: string): Promise<CustomerMessages> =>
  api(`/api/v1/clientes/${customerId}/mensajes/`)

export const optOut = (customerId: string, channel: string, reason: string): Promise<void> =>
  api(`/api/v1/clientes/${customerId}/bajas/`, { method: 'POST', body: { channel, reason } })

export const optIn = (customerId: string, channel: string): Promise<void> =>
  api(`/api/v1/clientes/${customerId}/bajas/${toQuery({ canal: channel })}`, { method: 'DELETE' })

export const STATUS_TONE: Record<OutboundMessage['status'], string> = {
  queued: 'info',
  sent: 'success',
  logged: 'neutral',
  failed: 'danger',
  skipped: 'warning',
}
