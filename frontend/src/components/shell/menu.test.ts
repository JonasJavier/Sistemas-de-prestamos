import { describe, expect, it } from 'vitest'

import type { Me } from '../../api/accounts'
import { crumbsFor, locate, navFor, owns } from './menu'

const me = (roles: string[], extra: Partial<Me> = {}) => ({ roles, ...extra }) as Me
const manager = me(['Gerente'], { is_manager: true, agenda_today: 3, closings_to_approve: 2 })

const labels = (groups: ReturnType<typeof navFor>) =>
  groups.map((group) => [group.title, group.items.map((item) => item.label)])

describe('the menu of «Bosque y Arena» (decision 114)', () => {
  it('gives the manager three groups and folds the long ones into sections', () => {
    expect(labels(navFor(manager))).toEqual([
      ['Operación', ['Inicio', 'Clientes', 'Solicitudes', 'Préstamos', 'Desembolsos', 'Simulador']],
      ['Cobro', ['Rutas de cobro', 'Cobranza', 'Cajas', 'Atrasos', 'Casos legales']],
      ['Gestión', ['Reportes', 'Finanzas', 'Ajustes']],
    ])
    const settings = navFor(manager)[2].items[2]
    expect(settings.to).toBe('/ajustes/empresa')
    expect(settings.children?.map((child) => child.label)).toContain('Suscripción')
  })

  it('puts the route first for the collector and leaves out what he cannot use', () => {
    const groups = labels(navFor(me(['Cobrador'])))
    expect(groups[0]).toEqual(['Cobro', ['Mi ruta', 'Cobranza']])
    expect(groups[1]).toEqual(['Operación', ['Clientes', 'Préstamos']])
    expect(groups).toHaveLength(2)
  })

  it('shows a section with a single screen as that screen', () => {
    const cashier = navFor(me(['Cajero']))
    const management = cashier.find((group) => group.title === 'Gestión')
    expect(management?.items).toHaveLength(1)
    expect(management?.items[0]).toMatchObject({ to: '/gastos', label: 'Gastos e ingresos' })
    expect(management?.items[0].children).toBeUndefined()
  })

  it('sends audit to the fraud alerts from Reportes', () => {
    const audit = navFor(me(['Auditoría']))
    const reports = audit.flatMap((group) => group.items).find((item) => item.label === 'Reportes')
    expect(reports?.children?.map((child) => child.to)).toContain('/ajustes/alertas')
  })
})

describe('where the person is', () => {
  it('never lets a path borrow a longer name', () => {
    expect(owns('/caja', '/cajas')).toBe(false)
    expect(owns('/cajas', '/cajas/9')).toBe(true)
    expect(owns('/', '/clientes')).toBe(false)
  })

  it('finds the deepest screen and its section', () => {
    const here = locate('/reportes/cartera', navFor(manager))
    expect(here?.leaf.label).toBe('Cartera')
    expect(here?.section?.label).toBe('Reportes')
    expect(locate('/reportes', navFor(manager))?.leaf.label).toBe('Centro de reportes')
  })

  it('builds the breadcrumbs, linking all but the last one', () => {
    const groups = navFor(manager)
    expect(crumbsFor('/', groups)).toEqual([{ label: 'Inicio' }])
    expect(crumbsFor('/ajustes/usuarios', groups)).toEqual([
      { label: 'Ajustes', to: '/ajustes/empresa' },
      { label: 'Usuarios' },
    ])
    expect(crumbsFor('/prestamos/01-000010', groups)).toEqual([
      { label: 'Préstamos', to: '/prestamos' },
      { label: 'Préstamo 01-000010' },
    ])
    expect(crumbsFor('/clientes/nuevo', groups)).toEqual([
      { label: 'Clientes', to: '/clientes' },
      { label: 'Nuevo cliente' },
    ])
    expect(crumbsFor('/cobrar/01-000010', groups)).toEqual([
      { label: 'Préstamos', to: '/prestamos' },
      { label: 'Cobrar 01-000010' },
    ])
    expect(crumbsFor('/avisos', groups)).toEqual([{ label: 'Avisos' }])
    expect(crumbsFor('/cuenta', groups)).toEqual([{ label: 'Mi cuenta' }])
    expect(crumbsFor('/cuenta/dos-pasos', groups)).toEqual([
      { label: 'Mi cuenta', to: '/cuenta' },
      { label: 'Verificación en dos pasos' },
    ])
  })
})
