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
} as const satisfies Record<string, readonly string[]>

export const hasRole = (me: Me | undefined, roles: readonly string[]) =>
  Boolean(me?.roles?.some((role) => roles.includes(role)))
