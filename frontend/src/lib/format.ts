/** Shared display formats (doc 09 - section 1): RD$ 1,250.00 and 04/10/2026. */

export const rd = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === ''
    ? '—'
    : `RD$ ${Number(value).toLocaleString('es-DO', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`

/** A fraction as a percentage: "0.025" -> "2.5%", "0.4" -> "40%". Only
 * trailing zeros AFTER the decimal point go away. */
export const pct = (value: string | number | null | undefined, places = 2) =>
  value === null || value === undefined || value === ''
    ? '—'
    : `${(Number(value) * 100)
        .toFixed(places)
        .replace(/(\.\d*?)0+$/, '$1')
        .replace(/\.$/, '')}%`

/** Business dates travel as YYYY-MM-DD; never let the browser shift them. */
export const day = (value: string | null | undefined) =>
  value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('es-DO') : '—'

export const moment = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' })
    : '—'

export const FREQUENCY_TEXT: Record<string, string> = {
  daily: 'Diaria',
  interdaily: 'Interdiaria',
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
}

/** «12 cuotas mensuales»: the plural agrees with the count. */
export const FREQUENCY_PLURAL: Record<string, string> = {
  daily: 'diarias',
  interdaily: 'interdiarias',
  weekly: 'semanales',
  biweekly: 'quincenales',
  monthly: 'mensuales',
}

export const installmentsText = (count: number, frequency: string) =>
  `${count} cuota${count === 1 ? '' : 's'} ${
    count === 1 ? (FREQUENCY_TEXT[frequency] ?? frequency).toLowerCase() : (FREQUENCY_PLURAL[frequency] ?? frequency)
  }`

export const RATE_UNIT_TEXT: Record<string, string> = {
  per_period: 'por período',
  monthly: 'mensual',
  annual: 'anual',
}

export const METHOD_TEXT: Record<string, string> = {
  flat: 'Plano («San»)',
  interest_only: 'Solo interés («A rédito»)',
  fixed_payment: 'Cuota fija (francesa)',
  fixed_principal: 'Capital fijo (decreciente)',
  open: 'Abierto (pagaré abierto)',
}

export const APPLICATION_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'Borrador', tone: 'neutral' },
  in_review: { label: 'En evaluación', tone: 'info' },
  returned: { label: 'Devuelta', tone: 'warning' },
  approved: { label: 'Aprobada', tone: 'success' },
  rejected: { label: 'Rechazada', tone: 'danger' },
  disbursed: { label: 'Desembolsada', tone: 'brand' },
  expired: { label: 'Vencida', tone: 'warning' },
  withdrawn: { label: 'Desistida', tone: 'neutral' },
}

export const LOAN_STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: 'Activo', tone: 'brand' },
  paid_off: { label: 'Saldado', tone: 'success' },
  renewed: { label: 'Renovado', tone: 'neutral' },
  written_off: { label: 'Castigado', tone: 'danger' },
  voided: { label: 'Anulado', tone: 'neutral' },
}

export type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'brand'

/** First message of a DRF error payload, for compact alerts. */
export function errorMessage(data: unknown, fallback = 'No se pudo completar la acción.'): string {
  if (!data || typeof data !== 'object') return fallback
  const record = data as Record<string, unknown>
  if (typeof record.detail === 'string') return record.detail
  for (const value of Object.values(record)) {
    if (typeof value === 'string') return value
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  }
  return fallback
}

/** A key per screen visit: a double click never disburses twice (doc 03 - 6). */
export const newIdempotencyKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '')
    : `${Date.now()}${Math.random().toString(16).slice(2)}`
