/** The trays of the applications screen; shared with the router's search check. */

export type ApplicationTab =
  | 'por_aprobar'
  | 'mias'
  | 'in_review'
  | 'por_desembolsar'
  | 'rejected'
  | 'todas'

export const APPLICATION_TABS: readonly ApplicationTab[] = [
  'por_aprobar',
  'mias',
  'in_review',
  'por_desembolsar',
  'rejected',
  'todas',
]

export interface ApplicationsSearch {
  bandeja?: ApplicationTab
}
