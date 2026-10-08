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
  if (await open.isVisible()) {
    await page.getByLabel('Fondo que recibes (RD$)').fill(fund)
    await open.click()
  }
  await expect(page.getByText('Esperado en caja')).toBeVisible()
}

/** «RD$ 5,400.00» -> 5400 */
export const amountOf = (text: string) => Number(text.replace(/[^\d.]/g, ''))
