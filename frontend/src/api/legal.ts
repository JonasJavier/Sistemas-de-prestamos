/** F9 · Vía legal (decision 095): professionals, cases, costs and documents. */

import { api, toQuery } from './client'

export type ProfessionalKind = 'lawyer' | 'notary' | 'bailiff' | 'witness'

export const PROFESSIONAL_KINDS: { value: ProfessionalKind; label: string }[] = [
  { value: 'lawyer', label: 'Abogado' },
  { value: 'notary', label: 'Notario' },
  { value: 'bailiff', label: 'Alguacil' },
  { value: 'witness', label: 'Testigo' },
]

export interface Professional {
  id: string
  kind: ProfessionalKind
  kind_label: string
  name: string
  document: string
  license: string
  phone: string
  address: string
  parent: string | null
  is_active: boolean
}

export type CaseStatus = 'open' | 'agreement' | 'execution' | 'closed'

export interface LegalCase {
  id: string
  number: string
  status: CaseStatus
  status_label: string
  outcome: string
  outcome_label: string
  loan: {
    number: string
    status: string
    customer: string
    days_past_due: number
    principal_outstanding: string
  }
  lawyer: Professional
  bailiff: Professional | null
  notary: Professional | null
  opened_on: string
  opened_by: string
  note: string
  closed_on: string | null
  close_note: string
}

export interface LegalCaseDetail extends LegalCase {
  exigible: string
  costs: {
    id: string
    date: string
    description: string
    amount: string
    paid: boolean
    charged: boolean
  }[]
  documents: {
    id: string
    kind: string
    label: string
    folio: string
    legal_status: string
    created_at: string
  }[]
}

export const LEGAL_DOCUMENTS: { kind: string; label: string; needs?: string }[] = [
  { kind: 'demand_notice', label: 'Acto de intimación de pago' },
  { kind: 'payment_order', label: 'Mandamiento de pago', needs: 'alguacil' },
  { kind: 'voluntary_surrender', label: 'Acto de entrega voluntaria', needs: 'bien en garantía' },
  { kind: 'notarial_note', label: 'Pagaré notarial', needs: 'notario' },
]

export const CASE_OUTCOMES = [
  { value: 'paid', label: 'Pagó' },
  { value: 'agreement', label: 'Acuerdo de pago' },
  { value: 'executed', label: 'Garantía ejecutada' },
  { value: 'written_off', label: 'Castigado' },
  { value: 'other', label: 'Otro' },
]

export const listProfessionals = (): Promise<Professional[]> =>
  api('/api/v1/profesionales-legales/')

export const saveProfessional = (
  data: Partial<Professional> & { id?: string },
): Promise<Professional> =>
  data.id
    ? api(`/api/v1/profesionales-legales/${data.id}/`, { method: 'PATCH', body: data })
    : api('/api/v1/profesionales-legales/', { method: 'POST', body: data })

export const listCases = (estado: string): Promise<LegalCase[]> =>
  api(`/api/v1/casos-legales/${toQuery({ estado })}`)

export const getCase = (id: string): Promise<LegalCaseDetail> => api(`/api/v1/casos-legales/${id}/`)

export const openCase = (data: {
  loan: string
  lawyer: string
  bailiff?: string | null
  notary?: string | null
  note: string
}): Promise<LegalCase> => api('/api/v1/casos-legales/', { method: 'POST', body: data })

export const updateCase = (
  id: string,
  data: Partial<{
    status: CaseStatus
    lawyer: string
    bailiff: string | null
    notary: string | null
    note: string
  }>,
): Promise<LegalCase> => api(`/api/v1/casos-legales/${id}/`, { method: 'PATCH', body: data })

export const closeCase = (id: string, outcome: string, note: string): Promise<LegalCase> =>
  api(`/api/v1/casos-legales/${id}/cerrar/`, { method: 'POST', body: { outcome, note } })

export const addCost = (
  id: string,
  data: { description: string; amount: string; account?: string | null; charge_customer: boolean },
): Promise<{ id: string }> =>
  api(`/api/v1/casos-legales/${id}/costas/`, { method: 'POST', body: data })

export const issueLegalDocument = (
  id: string,
  kind: string,
): Promise<{ id: string; folio: string; label: string }> =>
  api(`/api/v1/casos-legales/${id}/documentos/${kind}/`, { method: 'POST' })

export const legalPdfUrl = (caseId: string, docId: string) =>
  `/api/v1/casos-legales/${caseId}/documentos/archivo/?id=${docId}`

export const legalDocxUrl = (caseId: string, kind: string) =>
  `/api/v1/casos-legales/${caseId}/documentos/${kind}/`
