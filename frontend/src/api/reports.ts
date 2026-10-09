/** Phase 7 (decision 086): the dashboard by role and the reports, every
 * figure from the same indicator service (doc 09 §3). */

import { api, toQuery, type Page } from './client'

export interface Bucket {
  key: string
  label: string
  count: number
  principal: string
}

export interface PortfolioFigures {
  count: number
  principal: string
  par7: string | null
  par30: string | null
  par90: string | null
  at_risk30: string
  buckets: Bucket[]
}

export interface Dashboard {
  date: string
  scope: string
  definitions: Record<string, string>
  indicators?: {
    portfolio: PortfolioFigures
    today: { collected: string; expected: string; recovery: string | null }
    disbursed_month: { total: string; count: number }
    promises_month: { kept: number; broken: number; rate: string | null }
    cash_differences_month: { total: string; shortage: string; overage: string; count: number }
    profit_month?: { income: string; expenses: string; result: string }
  }
  operations?: {
    open_cash_sessions: number
    routes_open: number
    routes_total: number
    stops: { total: number; visited: number; paid: number }
  }
  books?: {
    accounts: { id: string; name: string; kind: string; balance: string }[]
    payables_due: { count: number; overdue: number; total: string }
    reconciliations_pending: { month: string; accounts: string[] }
  }
  officer?: {
    applications: { status: string; label: string; count: number }[]
    due_soon: number
    in_arrears: number
  }
}

export function getDashboard(sucursal?: string): Promise<Dashboard> {
  return api(`/api/v1/tablero/${toQuery({ sucursal })}`)
}

export type PortfolioCut = 'sucursal' | 'cobrador' | 'producto'

export interface PortfolioFilters {
  fecha?: string
  corte?: PortfolioCut
  sucursal?: string
  cobrador?: string
  producto?: string
}

export interface PortfolioReport {
  date: string
  scope: string
  snapshot: boolean
  cut: PortfolioCut
  totals: PortfolioFigures
  rows: {
    key: string
    name: string
    count: number
    principal: string
    at_risk30: string
    par30: string | null
    in_arrears: number
  }[]
  definitions: Record<string, string>
}

export function getPortfolioReport(filters: PortfolioFilters): Promise<PortfolioReport> {
  return api(`/api/v1/reportes/cartera/${toQuery({ ...filters })}`)
}

// --- P64 «Centro de reportes» (decision 087) ---------------------------------

export type FilterKind =
  'date' | 'from' | 'to' | 'branch' | 'collector' | 'product' | 'method' | 'cut' | 'bucket'

export interface ReportSpec {
  key: string
  title: string
  description: string
  group: string
  filters: { key: string; label: string; kind: FilterKind }[]
}

export interface Option {
  value: string
  label: string
}

export interface ReportCatalog {
  reports: ReportSpec[]
  options: Partial<Record<FilterKind, Option[]>>
  can_export: boolean
  exports_personal: boolean
}

export type ColumnKind = 'text' | 'money' | 'int' | 'date' | 'pct'

export interface ReportTable {
  title: string
  filters_line: string
  columns: { key: string; label: string; kind: ColumnKind; personal: boolean }[]
  rows: Record<string, string | number | null>[]
  count: number
  truncated: boolean
  totals: Record<string, string>
  summary: { label: string; value: string | number | null; kind: ColumnKind; hint?: string }[]
  note: string
}

export type Filters = Record<string, string | undefined>

export interface ExportJob {
  id: string
  report: string
  title: string
  filters_line: string
  format: 'pdf' | 'xlsx'
  format_label: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'expired'
  status_label: string
  personal: boolean
  rows: number
  error: string
  created_at: string
  finished_at: string | null
}

export function getReportCatalog(): Promise<ReportCatalog> {
  return api('/api/v1/reportes/')
}

export function getReport(key: string, filters: Filters): Promise<ReportTable> {
  return api(`/api/v1/reportes/${key}/datos/${toQuery(filters)}`)
}

export function requestExport(
  key: string,
  format: ExportJob['format'],
  filters: Filters,
): Promise<ExportJob> {
  return api(`/api/v1/reportes/${key}/exportar/`, { method: 'POST', body: { format, filters } })
}

export function listMyExports(): Promise<ExportJob[]> {
  return api('/api/v1/exportaciones/')
}

export const exportFileUrl = (id: string) => `/api/v1/exportaciones/${id}/archivo/`

// --- P62 «Clasificación de clientes» (decision 088) ---------------------------

export type Grade = 'A' | 'B' | 'C' | 'D' | ''

export interface ScoreFactor {
  key: string
  label: string
  detail?: string
  points?: string | null
  max?: number
}

export interface Classification {
  grade: Grade
  label: string
  score: string | null
  factors: ScoreFactor[]
  computed_at: string
}

export interface ScoreRow extends Omit<Classification, 'computed_at'> {
  customer: { id: string; name: string; branch: string }
  previous_grade: Grade
  computed_at: string
}

export interface ScorePage extends Page<ScoreRow> {
  counts: Record<'total' | 'A' | 'B' | 'C' | 'D' | 'none', number>
  grades: { grade: Grade; label: string; min: number }[]
  weights: Record<string, number>
}

export function listScores(params: {
  grado?: string
  sucursal?: string
  q?: string
  page?: number
}): Promise<ScorePage> {
  return api(`/api/v1/clasificacion/${toQuery(params)}`)
}
