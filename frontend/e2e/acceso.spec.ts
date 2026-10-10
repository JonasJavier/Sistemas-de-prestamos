import { expect, test } from '@playwright/test'

import { CIBAO_GERENTE, MODELO, sessionFor, signIn } from './helpers'

test.describe('acceso (doc 06 - 6)', () => {
  test('sin sesión, la app lleva a iniciar sesión', async ({ page }) => {
    await page.goto('/prestamos')
    await expect(page).toHaveURL(/\/entrar/)
  })

  test('una contraseña incorrecta se explica sin revelar si el correo existe', async ({ page }) => {
    await page.goto('/entrar')
    // An address outside the seed: real accounts would add to their lock counter.
    await page.getByLabel('Correo').fill('nadie@modelo.test')
    await page.getByLabel('Contraseña').fill('no-es-la-clave')
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page.getByText('Correo o contraseña incorrectos.')).toBeVisible()
  })

  test('la recuperación responde igual para cualquier correo', async ({ page }) => {
    await page.goto('/entrar')
    await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click()
    await page.getByLabel('Correo').fill('nadie@modelo.test')
    await page.getByRole('button', { name: 'Enviarme el enlace' }).click()
    await expect(page.getByText(/te llegará un enlace|le llegará un enlace/)).toBeVisible()
  })

  test('un enlace de recuperación inválido ofrece pedir otro', async ({ page }) => {
    await page.goto('/recuperar/clave-que-no-existe')
    await page.getByLabel('Contraseña nueva').fill('una-clave-nueva-larga')
    await page.getByLabel('Repítela').fill('una-clave-nueva-larga')
    await page.getByRole('button', { name: 'Guardar contraseña' }).click()
    await expect(page.getByRole('link', { name: 'Pedir un enlace nuevo' })).toBeVisible()
  })

  test('cerrar sesión vuelve a la entrada', async ({ page }) => {
    await signIn(page, MODELO.cobrador)
    await page.getByRole('button', { name: /^Tu cuenta/ }).click()
    await page.getByRole('button', { name: 'Cerrar sesión' }).click()
    await expect(page).toHaveURL(/\/entrar/)
  })

  test('cerrar otra sesión desde Mi cuenta saca a ese dispositivo', async ({ browser }) => {
    const laptop = await sessionFor(browser, MODELO.contabilidad)
    const phone = await sessionFor(browser, MODELO.contabilidad)

    await laptop.goto('/cuenta')
    await expect(laptop.getByText('Esta sesión')).toBeVisible()
    await laptop.getByRole('button', { name: 'Cerrar las demás' }).click()
    await expect(laptop.getByRole('button', { name: 'Cerrar las demás' })).toHaveCount(0)

    // The other device learns it on its next request (401 → «tu sesión se cerró»).
    await phone.goto('/prestamos')
    await expect(phone).toHaveURL(/\/entrar/)
  })

  test('una dirección inexistente muestra la página 404', async ({ page }) => {
    await page.goto('/esto-no-existe')
    await expect(page.getByText('Esta página no existe')).toBeVisible()
  })
})

test.describe('aislamiento entre empresas (decisión 042)', () => {
  test('otra empresa no encuentra ni abre los datos de Financiera Modelo', async ({ browser }) => {
    // Seeded data only: the test must not depend on the order of the others.
    const modelo = await sessionFor(browser, MODELO.gerente)
    await modelo.goto('/clientes')
    const customer = modelo.getByRole('link', { name: /María Gómez/ }).first()
    await expect(customer).toBeVisible()
    const customerPath = new URL(await customer.evaluate((a) => (a as HTMLAnchorElement).href))
      .pathname

    const cibao = await sessionFor(browser, CIBAO_GERENTE)
    await cibao.goto('/clientes')
    await cibao.getByPlaceholder('Buscar por nombre, cédula, RNC o teléfono…').fill('Gómez')
    await expect(cibao.getByText('Ningún cliente coincide con «Gómez».')).toBeVisible()
    await cibao.goto(customerPath)
    await expect(cibao.getByText('No se encontró el cliente.')).toBeVisible()
  })
})
