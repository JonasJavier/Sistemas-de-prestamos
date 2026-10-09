/** Phase 7 (decision 086): the dashboard by role and the reports, every
 * figure from the same indicator service (doc 09 §3). */

import { api, toQuery } from './client'

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
