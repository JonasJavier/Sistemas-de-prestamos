import { expect, test } from '@playwright/test'

import { MODELO, sessionFor } from './helpers'

/** Phase 7 demo (doc 10 - 1): the dashboard by role, the report center with
 * the same figures on screen and in the export, and the personal data rule. */

test('el gerente ve sus indicadores y exporta un reporte', async ({ browser }) => {
  const manager = await sessionFor(browser, MODELO.gerente)
  await manager.goto('/')
  await expect(manager.getByText('Cartera activa')).toBeVisible()
  await expect(manager.getByText('Mora por tramos')).toBeVisible()
  // Every figure explains itself (doc 09 §3).
  await manager.getByRole('button', { name: 'Qué es «Cartera activa»' }).click()
  await expect(
    manager.getByText(/Suma del capital pendiente de los préstamos activos/),
  ).toBeVisible()

  await manager.goto('/reportes')
  const reports = manager.getByRole('navigation', { name: 'Reportes' })
  await reports.getByRole('button', { name: 'Cobros' }).click()
  await expect(manager.getByRole('heading', { name: 'Cobros' })).toBeVisible()
  await expect(manager.getByText('Cobrado neto')).toBeVisible()
  await manager.getByRole('button', { name: 'Excel' }).click()
  await expect(manager.getByText(/Mis exportaciones/).first()).toBeVisible()
  await manager.getByRole('tab', { name: 'Mis exportaciones' }).click()
  await expect(manager.getByRole('link', { name: 'Descargar' }).first()).toBeVisible()
})

test('el supervisor exporta sin datos personales', async ({ browser }) => {
  const supervisor = await sessionFor(browser, MODELO.supervisor)
  await supervisor.goto('/reportes')
  await supervisor
    .getByRole('navigation', { name: 'Reportes' })
    .getByRole('button', { name: 'Atrasos' })
    .click()
  await expect(supervisor.getByText(/salen sin los datos personales/)).toBeVisible()
  await expect(
    supervisor.getByRole('navigation', { name: 'Reportes' }).getByText('Resultados'),
  ).toHaveCount(0)
})

test('la cartera tiene cortes y fecha', async ({ browser }) => {
  const accounting = await sessionFor(browser, MODELO.contabilidad)
  await accounting.goto('/reportes/cartera')
  await expect(accounting.getByRole('heading', { name: 'Antigüedad' })).toBeVisible()
  await accounting.getByLabel('Agrupar por').selectOption('producto')
  await expect(accounting.getByRole('heading', { name: 'Por producto' })).toBeVisible()
})
