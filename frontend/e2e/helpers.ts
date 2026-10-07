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
