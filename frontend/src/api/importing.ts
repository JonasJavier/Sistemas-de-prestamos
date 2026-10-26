import { apiUpload } from './client'

/** D1 (decision 131): the portfolio import from the app. */
export type ImportKind = 'clientes' | 'prestamos'

export interface ImportRow {
  line: number
  status: 'created' | 'existing' | 'error'
  detail: string
}

export interface ImportReport {
  kind: ImportKind
  applied: boolean
  created: number
  existing: number
  errors: number
  summary: string
  rows: ImportRow[]
}

export function templateUrl(kind: ImportKind): string {
  return `/api/v1/importacion/plantillas/${kind}/`
}

export function runImport(kind: ImportKind, file: File, apply: boolean): Promise<ImportReport> {
  const form = new FormData()
  form.append('archivo', file)
  form.append('aplicar', apply ? 'true' : 'false')
  return apiUpload(`/api/v1/importacion/${kind}/`, form)
}
