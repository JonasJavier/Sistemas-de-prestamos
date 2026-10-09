/** P70 · Empresa: legal data, logo and operating defaults (decision 075). */

import { api, apiUpload } from './client'

export interface CompanySettings {
  legal_name: string
  trade_name: string
  rnc: string
  address: string
  phone: string
  email: string
  has_logo: boolean
  application_validity_days: number
  capacity_alert_ratio: string
  collector_cash_limit: string
  /** The company's own ceiling on a loan's annual effective cost (fraction). */
  max_effective_annual_rate: string | null
  /** The legal ceiling for every company, once the law sets one. */
  legal_max_effective_annual_rate: string | null
  /** F13 (decision 094): days late from which a write-off is suggested. */
  write_off_days: number
}

export type CompanySettingsChange = Partial<
  Omit<CompanySettings, 'has_logo' | 'legal_max_effective_annual_rate'>
> & { remove_logo?: boolean }

const URL = '/api/v1/ajustes/empresa/'
export const COMPANY_LOGO_URL = `${URL}logo/`

export const getCompanySettings = (): Promise<CompanySettings> => api(URL)

export const updateCompanySettings = (body: CompanySettingsChange): Promise<CompanySettings> =>
  api(URL, { method: 'PATCH', body })

export function uploadCompanyLogo(file: File): Promise<CompanySettings> {
  const form = new FormData()
  form.append('logo', file)
  return apiUpload(URL, form, 'PATCH')
}
