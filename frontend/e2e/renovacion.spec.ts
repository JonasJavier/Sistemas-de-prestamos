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
  await officer.getByRole('button', { name: 'Más ▾' }).click()
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
