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

test('el oficial ve la clasificación y su porqué', async ({ browser }) => {
  const officer = await sessionFor(browser, MODELO.oficial)
  await officer.goto('/reportes/clasificacion')
  await expect(officer.getByRole('heading', { name: 'Clasificación de clientes' })).toBeVisible()
  await expect(officer.getByText('A · Excelente')).toBeVisible()
  const why = officer.getByRole('button', { name: '¿Por qué?' }).first()
  await why.click()
  await expect(
    officer.getByText(/Cuotas pagadas a tiempo|Sin cuotas vencidas/).first(),
  ).toBeVisible()
})

test('el gerente define una comisión y calcula el mes', async ({ browser }) => {
  const manager = await sessionFor(browser, MODELO.gerente)
  await manager.goto('/reportes/comisiones')
  await expect(manager.getByRole('heading', { name: 'Comisiones', level: 1 })).toBeVisible()
  // The tours run again on the same data: reuse the rule if a run left it
  // (once the rules have loaded, or the check would race the request).
  const existing = manager.getByText('Cobradores del recorrido')
  await expect(existing.or(manager.getByText(/Sin reglas/)).first()).toBeVisible()
  if (!(await existing.count())) {
    await manager.getByRole('button', { name: 'Nueva regla' }).click()
    const dialog = manager.getByRole('dialog')
    await dialog.getByLabel('Nombre').fill('Cobradores del recorrido')
    await dialog.getByRole('combobox', { name: /^Rol/ }).selectOption('Cobrador')
    await dialog.getByLabel('Porcentaje').fill('10')
    await dialog.getByRole('button', { name: 'Guardar' }).click()
    await expect(manager.getByText('Regla guardada.')).toBeVisible()
  } else {
    await manager
      .getByRole('listitem')
      .filter({ hasText: 'Cobradores del recorrido' })
      .getByRole('button', { name: 'Editar' })
      .first()
      .click()
    await manager.getByRole('dialog').getByLabel('Activa').check()
    await manager.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click()
  }
  await manager.getByRole('button', { name: /^(Calcular|Recalcular)$/ }).click()
  await expect(manager.getByText('Comisiones calculadas.')).toBeVisible()
  await expect(manager.getByRole('cell', { name: /Carlos Cobrador/ })).toBeVisible()

  // Leave no active rule: the month-end close of other tours needs none pending.
  await manager
    .getByRole('listitem')
    .filter({ hasText: 'Cobradores del recorrido' })
    .getByRole('button', { name: 'Editar' })
    .first()
    .click()
  await manager.getByRole('dialog').getByLabel('Activa').uncheck()
  await manager.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click()
  await expect(manager.getByText('Inactiva')).toBeVisible()
})

test('el gerente ajusta una regla antifraude', async ({ browser }) => {
  const manager = await sessionFor(browser, MODELO.gerente)
  await manager.goto('/ajustes/alertas')
  await expect(manager.getByRole('heading', { name: 'Alertas antifraude' })).toBeVisible()
  await manager.getByRole('tab', { name: 'Reglas' }).click()
  const row = manager.getByRole('listitem').filter({ hasText: 'Cobros fuera de la ruta del día' })
  // Repeatable: move the threshold to whichever of 6 and 7 it is not.
  const field = row.getByLabel('Umbral')
  await expect(field).toBeVisible()
  const target = (await field.inputValue()) === '6' ? '7' : '6'
  await field.fill(target)
  await row.getByRole('button', { name: 'Guardar' }).click()
  await expect(manager.getByText('Regla guardada.')).toBeVisible()
  await expect(row.getByText(`Avisa con ${target} o más`, { exact: false })).toBeVisible()
})
