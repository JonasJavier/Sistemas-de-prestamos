import { expect, test } from '@playwright/test'

import { MODELO, sessionFor } from './helpers'

/** Phase 8 · F9 (decision 095): the manager sends a late loan to the legal
 * path, issues the demand notice with the real data and closes the case
 * (closed again so the tour repeats; no balance is touched). */
test('el gerente lleva un préstamo a la vía legal y emite la intimación', async ({ browser }) => {
  const manager = await sessionFor(browser, MODELO.gerente)

  // P78: the company's lawyer, once.
  await manager.goto('/ajustes/legales')
  await expect(manager.getByRole('heading', { name: 'Profesionales legales' })).toBeVisible()
  const lawyer = manager.getByText('Lic. Ramón del Recorrido')
  await expect(lawyer.or(manager.getByText(/Agrega el abogado|Abogado/)).first()).toBeVisible()
  if (!(await lawyer.count())) {
    await manager.getByRole('button', { name: 'Nuevo profesional' }).click()
    const dialog = manager.getByRole('dialog')
    await dialog.getByLabel('Nombre').fill('Lic. Ramón del Recorrido')
    await dialog.getByLabel('Matrícula').fill('12345-678-90')
    await dialog.getByRole('button', { name: 'Guardar' }).click()
    await expect(manager.getByText('Profesional guardado.')).toBeVisible()
  }

  // José Pérez Santana is a few days late in the demo portfolio.
  await manager.goto('/prestamos')
  await manager.getByPlaceholder('Buscar por número, cliente o cédula…').fill('Pérez Santana')
  await manager
    .getByRole('link', { name: /Pérez Santana/ })
    .first()
    .click()
  await manager.getByRole('button', { name: 'Más ▾' }).click()
  await manager.getByRole('button', { name: 'Enviar a la vía legal' }).click()
  const open = manager.getByRole('dialog')
  await open
    .getByRole('combobox', { name: /^Abogado/ })
    .selectOption({ label: 'Lic. Ramón del Recorrido' })
  await open.getByLabel('Nota').fill('No responde a las gestiones (recorrido)')
  await open.getByRole('button', { name: 'Abrir el caso' }).click()
  await expect(manager).toHaveURL(/\/legal\/[^/]+$/)
  await expect(manager.getByText('Exigible hoy')).toBeVisible()

  // The demand notice, with the real arrears.
  await manager
    .getByRole('listitem')
    .filter({ hasText: 'Acto de intimación de pago' })
    .getByRole('button', { name: 'Emitir PDF' })
    .click()
  await expect(manager.getByText(/Acto de intimación de pago emitido/)).toBeVisible()
  await expect(manager.getByRole('link', { name: 'Acto de intimación de pago' })).toBeVisible()

  await manager.getByRole('button', { name: 'Cerrar el caso' }).click()
  const close = manager.getByRole('dialog')
  await close.getByLabel('Cómo termina').selectOption('other')
  await close.getByLabel('Nota').fill('Cierre del recorrido de prueba')
  await close.getByRole('button', { name: 'Cerrar el caso' }).click()
  await expect(manager.getByText(/Cerrado el/)).toBeVisible()
})
