import { expect, test } from '@playwright/test'

import { MODELO, signIn } from './helpers'

/** Decision 028: web only, made for the phone. Cashiers and collectors work there. */
test.describe('en el celular', () => {
  test('la barra inferior navega y abre la búsqueda', async ({ page }) => {
    await signIn(page, MODELO.cajera)
    const bar = page.getByRole('navigation', { name: 'Accesos rápidos' })
    await bar.getByRole('link', { name: 'Clientes' }).click()
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible()

    await bar.getByRole('button', { name: 'Buscar' }).click()
    await page.getByRole('textbox', { name: 'Buscar' }).fill('Pérez')
    await expect(page.getByRole('option', { name: /José Pérez Santana/ })).toBeVisible()
  })

  test('las listas caben en la pantalla, sin desplazamiento lateral', async ({ page }) => {
    await signIn(page, MODELO.gerente)
    for (const path of ['/', '/clientes', '/prestamos', '/solicitudes', '/simulador']) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `desborde lateral en ${path}`).toBeLessThanOrEqual(0)
    }
  })
})
