import { expect, test } from '@playwright/test'

import { MODELO, signIn } from './helpers'

/** Decision 028: web only, made for the phone. Cashiers and collectors work there. */
test.describe('en el celular', () => {
  test('la barra inferior navega y cobra; la de arriba busca (decisión 114)', async ({ page }) => {
    await signIn(page, MODELO.cajera)
    const bar = page.getByRole('navigation', { name: 'Accesos rápidos' })
    await bar.getByRole('link', { name: 'Caja' }).click()
    await expect(page.getByRole('heading', { name: 'Mi caja' })).toBeVisible()

    await page.getByRole('button', { name: 'Buscar', exact: true }).click()
    await page.getByRole('textbox', { name: 'Buscar' }).fill('Pérez')
    await expect(page.getByRole('option', { name: /José Pérez Santana/ }).first()).toBeVisible()
    await page.keyboard.press('Escape')

    // «Cobrar» picks the loan to collect.
    await bar.getByRole('button', { name: 'Cobrar' }).click()
    await page.getByRole('textbox', { name: 'Préstamo a cobrar' }).fill('Pérez')
    await page
      .getByRole('option', { name: /Cobrar .*José Pérez Santana/ })
      .first()
      .click()
    await expect(page.getByRole('heading', { name: /Cobrar/ })).toBeVisible()
  })

  test('las listas caben en la pantalla, sin desplazamiento lateral', async ({ page }) => {
    await signIn(page, MODELO.gerente)
    for (const path of [
      '/',
      '/clientes',
      '/prestamos',
      '/solicitudes',
      '/simulador',
      '/atrasos',
      '/rutas',
      '/cajas',
      '/avisos',
    ]) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `desborde lateral en ${path}`).toBeLessThanOrEqual(0)
    }
  })

  test('«Mi ruta» y el cobro caben en el celular del cobrador', async ({ page }) => {
    await signIn(page, MODELO.cobrador)
    await expect(page).toHaveURL(/\/ruta$/)
    for (const path of ['/ruta', '/prestamos']) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `desborde lateral en ${path}`).toBeLessThanOrEqual(0)
    }
  })
})
