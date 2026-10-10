import { expect, test } from '@playwright/test'

import { MODELO, sessionFor } from './helpers'

/** Phase 8 · F11 (decision 092): «Renovar» opens an application prefilled
 * from the loan, which shows the payoff it will settle. */
test('el oficial renueva un préstamo desde su ficha', async ({ browser }) => {
  const officer = await sessionFor(browser, MODELO.oficial)
  await officer.goto('/prestamos')
  await officer.getByPlaceholder('Buscar por número, cliente o cédula…').fill('María Gómez')
  await officer
    .getByRole('link', { name: /María Gómez/ })
    .first()
    .click()
  await expect(officer).toHaveURL(/\/prestamos\/[^/]+$/)
  await officer.getByRole('button', { name: 'Más', exact: true }).click()
  await officer.getByRole('button', { name: 'Renovar' }).click()
  // A run before may have left this loan's renewal in progress: both are fine.
  await expect(
    officer
      .getByText(/Renovación del préstamo/)
      .or(officer.getByText(/ya tiene una renovación en curso/))
      .first(),
  ).toBeVisible()
  if (await officer.getByText(/Renovación del préstamo/).count()) {
    await expect(officer.getByText('Saldo para saldar hoy')).toBeVisible()
  }
})

/** F11 (decision 093): the officer asks for new conditions after seeing the
 * new calendar; the supervisor decides. Rejected here, so the demo
 * portfolio the other tours use keeps its schedule. */
test('el oficial pide una reestructuración y el supervisor la rechaza', async ({ browser }) => {
  const officer = await sessionFor(browser, MODELO.oficial)
  await officer.goto('/prestamos')
  await officer.getByPlaceholder('Buscar por número, cliente o cédula…').fill('María Gómez')
  await officer
    .getByRole('link', { name: /María Gómez/ })
    .first()
    .click()
  await expect(officer).toHaveURL(/\/prestamos\/[^/]+$/)
  await officer.getByRole('button', { name: 'Más', exact: true }).click()
  await officer.getByRole('button', { name: 'Reestructurar' }).click()
  const dialog = officer.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Ver el calendario nuevo' }).click()
  await expect(dialog.getByText(/Total a pagar/)).toBeVisible()
  await dialog.getByLabel('Motivo').fill('Pide cuotas más pequeñas (recorrido)')
  await dialog.getByRole('button', { name: 'Pedir la aprobación' }).click()
  await expect(
    officer
      .getByText(/Reestructuración pedida/)
      .or(officer.getByText(/Ya hay una reestructuración pendiente/))
      .first(),
  ).toBeVisible()

  const supervisor = await sessionFor(browser, MODELO.supervisor)
  await supervisor.goto('/avisos')
  const item = supervisor.getByRole('listitem').filter({ hasText: 'Reestructuración' }).first()
  await item.getByRole('button', { name: 'Rechazar' }).click()
  const decide = supervisor.getByRole('dialog')
  await decide.getByLabel('Por qué la rechazas').fill('Primero que abone lo vencido')
  await decide.getByRole('button', { name: 'Rechazar' }).click()
  await expect(decide).toBeHidden()
})

/** F13 (decision 094): the manager's write-off asks for reason, note and his
 * second factor. Opened and cancelled: the demo portfolio stays as it is. */
test('el gerente ve el castigo con su confirmación', async ({ browser }) => {
  const manager = await sessionFor(browser, MODELO.gerente)
  await manager.goto('/prestamos')
  await manager.getByPlaceholder('Buscar por número, cliente o cédula…').fill('María Gómez')
  await manager
    .getByRole('link', { name: /María Gómez/ })
    .first()
    .click()
  await manager.getByRole('button', { name: 'Más', exact: true }).click()
  await manager.getByRole('button', { name: 'Castigar' }).click()
  const dialog = manager.getByRole('dialog')
  await expect(dialog.getByText(/sale de la cartera como gasto por castigo/)).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Castigar' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Cancelar' }).click()
  await expect(dialog).toBeHidden()
})
