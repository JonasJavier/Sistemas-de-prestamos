import { expect, test } from '@playwright/test'

import { MODELO, sessionFor } from './helpers'

const OWNER = 'dueno@cobradia.test'

/** Phase 7 (PT2, PT4, decision 091): the platform's dashboard and a support
 * access that is read-only, visible to the company and revocable by it. */
test('el dueño da soporte de solo lectura y la empresa lo ve y lo revoca', async ({ browser }) => {
  const owner = await sessionFor(browser, OWNER)
  await expect(owner).toHaveURL(/\/plataforma/)
  await expect(owner.getByText('Empresas activas')).toBeVisible()

  await owner
    .getByRole('link', { name: /Financiera Modelo SRL/ })
    .first()
    .click()
  await expect(owner).toHaveURL(/\/plataforma\/empresas\//)
  await owner.getByRole('button', { name: 'Más', exact: true }).click()
  await owner.getByRole('button', { name: 'Modo soporte' }).click()
  const dialog = owner.getByRole('dialog')
  await dialog.getByLabel('Motivo').fill('Ayuda con el cierre del recorrido')
  await dialog.getByRole('button', { name: 'Dar acceso de soporte' }).click()
  await expect(owner.getByText(/Acceso de soporte creado/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Entrar', exact: true }).first().click()

  // Inside: the company's screens with the banner, read-only.
  await expect(owner.getByText('Modo soporte · solo lectura')).toBeVisible()
  await owner.goto('/prestamos')
  await expect(owner.getByRole('heading', { name: 'Préstamos' })).toBeVisible()
  await owner.getByRole('button', { name: 'Salir del modo soporte' }).click()
  await expect(owner).toHaveURL(/\/plataforma/)

  // The company sees it in Ajustes and ends it.
  const manager = await sessionFor(browser, MODELO.gerente)
  await manager.goto('/ajustes/empresa')
  await expect(manager.getByText(/Soporte de Cobradía tiene acceso de lectura hasta/)).toBeVisible()
  await manager.getByRole('button', { name: 'Revocar ahora' }).click()
  await expect(manager.getByText('Acceso de soporte revocado.')).toBeVisible()
})
