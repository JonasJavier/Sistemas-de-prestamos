/** Shared display formats (doc 09 - section 1): RD$ 1,250.00 and 04/10/2026. */

export const rd = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === ''
    ? '—'
    : `RD$ ${Number(value).toLocaleString('es-DO', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`

/** Dominican documents as people write them: 001-1234567-8 (cédula) and
 * 1-01-12345-6 (RNC). Masked values from the API pass through untouched. */
export const documentText = (number: string | null | undefined) => {
  if (!number) return '—'
  if (/^\d{11}$/.test(number))
    return `${number.slice(0, 3)}-${number.slice(3, 10)}-${number.slice(10)}`
  if (/^\d{9}$/.test(number))
    return `${number[0]}-${number.slice(1, 3)}-${number.slice(3, 8)}-${number.slice(8)}`
  return number
}

/** 809-555-0101; anything else (extensions, foreign numbers) as typed. */
export const phoneText = (number: string | null | undefined) => {
  if (!number) return ''
  const digits = number.replace(/\D/g, '')
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  if (digits.length === 11 && digits.startsWith('1'))
    return `1-${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`
  return number
}

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
  value
    ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('es-DO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '—'

/** The local calendar date of an instant (created_at…): never slice a UTC
 * timestamp, after 8 p.m. in Santo Domingo it is already tomorrow in UTC. */
export const dateOf = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleDateString('es-DO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '—'

export const moment = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' }) : '—'

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
    count === 1
      ? (FREQUENCY_TEXT[frequency] ?? frequency).toLowerCase()
      : (FREQUENCY_PLURAL[frequency] ?? frequency)
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

/** Rates travel as fractions (0.05); people read and type percentages (5). */
export function fractionToPercent(fraction: string): string {
  if (!fraction) return ''
  const value = Number(fraction)
  return Number.isFinite(value) ? String(Number((value * 100).toFixed(6))) : fraction
}

export function percentToFraction(percent: string): string {
  const clean = percent.replace(',', '.').trim()
  if (!clean) return ''
  const value = Number(clean)
  // Anything that is not a number goes as typed: the server explains the error.
  return Number.isFinite(value) ? String(Number((value / 100).toFixed(8))) : clean
}

/** A company's lifecycle state (F19), for the owner panel and the subscription. */
export const STATUS_BADGES: Record<
  'trial' | 'active' | 'suspended' | 'closed',
  { text: string; classes: string }
> = {
  trial: { text: 'En prueba', classes: 'bg-gold-100 text-gold-800' },
  active: { text: 'Activa', classes: 'bg-success-600/15 text-success-600' },
  suspended: { text: 'Suspendida', classes: 'bg-warning-700/15 text-warning-700' },
  closed: { text: 'Cerrada', classes: 'bg-danger-600/15 text-danger-600' },
}

/** «Edge en Windows», «Chrome en Android»: enough to recognise a device. */
export function deviceText(userAgent: string) {
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\//.test(userAgent)
      ? 'Opera'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : 'Navegador'
  const system = /Android/.test(userAgent)
    ? 'Android'
    : /iPhone|iPad/.test(userAgent)
      ? 'iPhone o iPad'
      : /Windows/.test(userAgent)
        ? 'Windows'
        : /Mac OS X/.test(userAgent)
          ? 'Mac'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : 'otro sistema'
  return `${browser} en ${system}`
}
