/** Who reaches what (doc 06 - section 3). One list per screen group, shared by
 * the router guards, the menu and the search; the API always decides again. */

import type { Me } from '../api/accounts'

const G = 'Gerente'
const SU = 'Supervisor'
const OF = 'Oficial de crédito'
const CA = 'Cajero'
const CO = 'Cobrador'
const CT = 'Contabilidad'
const AU = 'Auditoría'

export const ACCESS = {
  /** Create and edit customers and applications. */
  originate: [G, SU, OF],
  /** Approve, reject or return applications. */
  decide: [G, SU],
  /** Read applications (cashier and accounting read the approved ones). */
  applications: [G, SU, OF, CA, CT, AU],
  disburse: [G, CA, CT],
  loans: [G, SU, OF, CA, CO, CT, AU],
  simulate: [G, SU, OF, CA],
  voidLoans: [G, SU],
  finance: [G, CT, AU],
  manageAccounts: [G, CT],
  adjustCapital: [G],
  // Phase 4 (cobros y caja).
  collect: [G, SU, CA, CO],
  receipts: [G, SU, OF, CA, CO, CT, AU],
  requestReversal: [G, SU, CA],
  payoffLetters: [G, SU, OF, CA],
  myCash: [SU, CA],
  cashSessions: [G, SU, CT, AU],
  myRoute: [CO],
  routes: [G, SU],
  delinquency: [G, SU, OF, CT, AU],
  supervise: [G, SU],
  // Phase 5 (cobranza, decisions 076-079).
  /** Register actions and promises; the agenda (P42, P44). */
  manageCollections: [G, SU, OF, CO],
  /** Assign loans to collection agents. */
  assignAgents: [G, SU],
  // Phase 6 (finanzas, decision 080).
  /** The books: chart, journal, ledger and statements. */
  books: [G, CT, AU],
  /** P54: see expenses and income (the cashier, his own). */
  expenses: [G, SU, CA, CT, AU],
  registerExpenses: [G, SU, CA, CT],
  /** P55: payables. */
  payables: [G, CT, AU],
  // Phase 7 (tablero y reportes, decision 086).
  /** Indicators and the portfolio report (P10, P60). */
  indicators: [G, SU, CT, AU],
  /** P64: the report center (the officer reads his branches' arrears). */
  reports: [G, SU, OF, CT, AU],
} as const satisfies Record<string, readonly string[]>

export const hasRole = (me: Me | undefined, roles: readonly string[]) =>
  Boolean(me?.roles?.some((role) => roles.includes(role)))
