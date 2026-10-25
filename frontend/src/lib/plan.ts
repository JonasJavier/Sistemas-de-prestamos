import type { Me } from '../api/accounts'

/**
 * What each plan includes (decision 124). The API refuses the endpoints of a
 * feature the company's plan lacks (403 «plan_feature»); here the menu hides
 * them and the screen explains what the next plan adds. The keys and the
 * tiers mirror backend/apps/platform/features.py.
 */

export type Tier = 'esencial' | 'profesional' | 'empresa'

export const TIER_LABELS: Record<Tier, string> = {
  esencial: 'Esencial',
  profesional: 'Profesional',
  empresa: 'Empresa',
}

export type FeatureKey =
  | 'routes'
  | 'collections'
  | 'messaging'
  | 'scores'
  | 'fraud'
  | 'expenses'
  | 'reports'
  | 'recovery'
  | 'accounting'
  | 'fiscal'
  | 'banking'
  | 'payables'
  | 'commissions'
  | 'legal'

export const FEATURES: Record<FeatureKey, { label: string; tier: Tier }> = {
  routes: { label: 'Rutas de cobro y app del cobrador', tier: 'profesional' },
  collections: { label: 'Cobranza: promesas, agenda y escalamiento', tier: 'profesional' },
  messaging: { label: 'Recordatorios por WhatsApp, SMS y correo', tier: 'profesional' },
  scores: { label: 'Clasificación de clientes', tier: 'profesional' },
  fraud: { label: 'Alertas antifraude', tier: 'profesional' },
  expenses: { label: 'Gastos e ingresos', tier: 'profesional' },
  reports: { label: 'Centro de reportes y exportaciones', tier: 'profesional' },
  recovery: { label: 'Castigo y recuperación de cartera', tier: 'profesional' },
  accounting: { label: 'Contabilidad NIIF y cierre de mes', tier: 'empresa' },
  fiscal: { label: 'Comprobantes fiscales, 606 y 607', tier: 'empresa' },
  banking: { label: 'Cuentas, bancos y conciliación', tier: 'empresa' },
  payables: { label: 'Cuentas por pagar', tier: 'empresa' },
  commissions: { label: 'Comisiones', tier: 'empresa' },
  legal: { label: 'Vía legal', tier: 'empresa' },
}

/** The feature each screen belongs to; screens absent here are in every plan. */
const SCREENS: [prefix: string, feature: FeatureKey][] = [
  ['/ruta', 'routes'],
  ['/rutas', 'routes'],
  ['/cobranza', 'collections'],
  ['/ajustes/mensajes', 'messaging'],
  ['/reportes/clasificacion', 'scores'],
  ['/ajustes/alertas', 'fraud'],
  ['/gastos', 'expenses'],
  ['/reportes/resultados', 'accounting'],
  ['/reportes/comisiones', 'commissions'],
  ['/reportes/cartera', 'reports'],
  ['/reportes/cobros', 'reports'],
  ['/contabilidad', 'accounting'],
  ['/comprobantes', 'fiscal'],
  ['/cuentas-por-pagar', 'payables'],
  ['/cuentas', 'banking'],
  ['/legal', 'legal'],
  ['/ajustes/legales', 'legal'],
]

/** Cartera and cobros reports are in every plan; the rest of the center is not. */
const BASIC_REPORTS = ['/reportes/cartera', '/reportes/cobros']

export function featureOfPath(path: string): FeatureKey | null {
  if (BASIC_REPORTS.some((p) => path === p || path.startsWith(`${p}/`))) return null
  if (path === '/reportes' || path.startsWith('/reportes/')) {
    const special = SCREENS.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))
    return special ? special[1] : 'reports'
  }
  const hit = SCREENS.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))
  return hit ? hit[1] : null
}

export function hasFeature(me: Me, feature: FeatureKey): boolean {
  // The platform owner and a company without a plan see everything.
  if (!me.company_id || !me.features) return true
  return me.features.includes(feature)
}

/** The feature a screen needs and the company's plan lacks, if any. */
export function missingFeature(me: Me, path: string): FeatureKey | null {
  const feature = featureOfPath(path)
  return feature && !hasFeature(me, feature) ? feature : null
}

/** What the plans list on the subscription screen and the site. */
export const PLAN_PITCH: Record<Tier, { pitch: string; bullets: string[] }> = {
  esencial: {
    pitch: 'Para ordenar la cartera y la caja de la oficina',
    bullets: [
      'Clientes, solicitudes y préstamos sin límite',
      'Pagos con recibo impreso o por WhatsApp',
      'Atrasos con mora automática',
      'Caja: apertura, cierre y cuadre',
      'Reportes de cartera y cobros del día',
      'Portal del cliente y seguridad en dos pasos',
    ],
  },
  profesional: {
    pitch: 'Para financieras con cobradores en la calle',
    bullets: [
      'Todo lo de Esencial',
      'Rutas con GPS y app del cobrador',
      'Promesas, agenda y escalamiento',
      'Recordatorios por WhatsApp, SMS y correo',
      'Clasificación de clientes y antifraude',
      'Gastos, reportes completos y exportaciones',
    ],
  },
  empresa: {
    pitch: 'Para financieras con contabilidad propia',
    bullets: [
      'Todo lo de Profesional',
      'Contabilidad NIIF, 606 y 607',
      'Comprobantes fiscales y cuentas por pagar',
      'Bancos y conciliación bancaria',
      'Comisiones y vía legal',
      'Soporte prioritario y migración acompañada',
    ],
  },
}
