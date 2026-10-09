import { expect, type Browser, type Page } from '@playwright/test'

/** Accounts of `manage.py seed_demo` (fictitious, development only). */
export const PASSWORD = 'demo-cobradia-2026'
export const MODELO = {
  gerente: 'gerente@modelo.test',
  supervisor: 'supervisor@modelo.test',
  oficial: 'oficial@modelo.test',
  cajera: 'cajera@modelo.test',
  cobrador: 'cobrador@modelo.test',
  contabilidad: 'contabilidad@modelo.test',
}
export const CIBAO_GERENTE = 'gerente@cibao.test'

export async function signIn(page: Page, email: string) {
  await page.goto('/entrar')
  await page.getByLabel('Correo').fill(email)
  await page.getByLabel('Contraseña').fill(PASSWORD)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).not.toHaveURL(/\/entrar/)
}

/** One isolated browser session per role, as in real life. */
export async function sessionFor(browser: Browser, email: string) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await signIn(page, email)
  return page
}

/** The cashier's drawer open with a fund (F7 step 1): cash leaves and
 * enters only through an open session from phase 4 on. */
export async function ensureCashOpen(page: Page, fund = '50000') {
  await page.goto('/caja')
  await expect(page.getByRole('heading', { name: 'Mi caja' })).toBeVisible()
  const open = page.getByRole('button', { name: 'Abrir caja' })
  await expect(open.or(page.getByText('Esperado en caja'))).toBeVisible()
  // A drawer left open on an earlier day (the tours ran yesterday) only
  // closes (decision 025): count it as it is and open today's.
  if (await page.getByText('Esta caja es de un día anterior').isVisible()) {
    await page.getByRole('button', { name: 'Arqueo y cierre' }).click()
    const dialog = page.getByRole('dialog')
    const expected = amountOf(
      await dialog.getByText('Esperado', { exact: true }).locator('..').innerText(),
    )
    await dialog.getByLabel('Cantidad de 1', { exact: true }).fill(String(Math.floor(expected)))
    // Back to the general cash, so today's fund can come out of it again.
    await dialog.getByLabel('Trasladar al cerrar (RD$)').fill(String(Math.floor(expected)))
    if (expected !== Math.floor(expected)) {
      await dialog.getByLabel('Motivo de la diferencia').selectOption({ index: 1 })
      await dialog.getByLabel('Explicación').fill('Centavos del recorrido de ayer')
    }
    await dialog.getByRole('button', { name: 'Cerrar caja' }).click()
    await expect(open).toBeVisible()
  }
  if (await open.isVisible()) {
    await page.getByLabel('Fondo que recibes (RD$)').fill(fund)
    await open.click()
  }
  await expect(page.getByText('Esperado en caja')).toBeVisible()
  // Repeated tours lend from this drawer: top it up from the general cash
  // when it no longer covers a disbursement.
  const inDrawer = amountOf(
    await page.getByText('Esperado en caja', { exact: true }).locator('..').innerText(),
  )
  if (inDrawer < Number(fund) / 2) {
    await page.getByRole('button', { name: 'Depositar o trasladar' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Movimiento').selectOption('in')
    await dialog.getByLabel('Desde').selectOption({ label: 'Caja general' })
    await dialog.getByLabel('Monto').fill(String(Number(fund) - Math.floor(inDrawer)))
    await dialog.getByRole('button', { name: 'Registrar' }).click()
    await expect(dialog).toHaveCount(0)
  }
}

/** «RD$ 5,400.00» -> 5400 */
export const amountOf = (text: string) => Number(text.replace(/[^\d.]/g, ''))
