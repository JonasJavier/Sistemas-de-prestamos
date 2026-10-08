/** P11: the notices of the bell, and who works outside the hours (035). */

import { api, toQuery, type Page } from './client'

export interface Notice {
  id: string
  kind: string
  kind_label: string
  text: string
  link: string
  read_at: string | null
  created_at: string
}

export const listNotices = (unreadOnly = false): Promise<Page<Notice>> =>
  api(`/api/v1/avisos/${toQuery({ sin_leer: unreadOnly ? '1' : undefined })}`)

export const markNoticeRead = (id: string): Promise<unknown> =>
  api(`/api/v1/avisos/${id}/leido/`, { method: 'POST' })

export const markAllNoticesRead = (): Promise<{ read: number }> =>
  api('/api/v1/avisos/leer-todos/', { method: 'POST' })

export interface HoursRow {
  id: string
  name: string
  outside_hours: boolean
  extended_until: string | null
}

export const listWorkingHours = (): Promise<HoursRow[]> => api('/api/v1/horario/')

export const extendHours = (body: {
  user: string
  minutes: number
  note: string
}): Promise<{ until: string }> => api('/api/v1/horario/', { method: 'POST', body })
