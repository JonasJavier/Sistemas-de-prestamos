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
    await page.getByRole('button', { name: 'Salir' }).click()
    await expect(page).toHaveURL(/\/entrar/)
  })

  test('una dirección inexistente muestra la página 404', async ({ page }) => {
    await page.goto('/esto-no-existe')
    await expect(page.getByText('Esta página no existe')).toBeVisible()
  })
})

test.describe('aislamiento entre empresas (decisión 042)', () => {
  test('otra empresa no encuentra ni abre los datos de Financiera Modelo', async ({ browser }) => {
    const modelo = await sessionFor(browser, MODELO.gerente)
    await modelo.goto('/prestamos')
    const firstLoan = modelo.getByRole('link', { name: /María Gómez/ }).first()
    await expect(firstLoan).toBeVisible()
    const loanPath = new URL(await firstLoan.evaluate((a) => (a as HTMLAnchorElement).href))
      .pathname

    const cibao = await sessionFor(browser, CIBAO_GERENTE)
    await cibao.goto('/clientes')
    await cibao.getByPlaceholder('Buscar por nombre, cédula, RNC o teléfono…').fill('Gómez')
    await expect(cibao.getByText('Ningún cliente coincide con «Gómez».')).toBeVisible()
    await cibao.goto(loanPath)
    await expect(cibao.getByText('Capital pendiente')).toHaveCount(0)
  })
})
