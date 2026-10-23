import { expect, test, type Page } from '@playwright/test'

import { MODELO, signIn } from './helpers'

/** A passkey kept by the browser itself (Chromium's virtual authenticator):
 * the fingerprint is simulated, the signing is real. */
async function virtualAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
}

test.describe('llaves de acceso (decisión 121)', () => {
  test.skip(({ isMobile }) => isMobile, 'el autenticador virtual es de escritorio')

  test('se crea en Mi cuenta, entra sola y se quita', async ({ page }) => {
    await signIn(page, MODELO.supervisor)
    await virtualAuthenticator(page)

    await page.goto('/cuenta/llaves')
    await page.getByRole('button', { name: 'Crear una llave en este dispositivo' }).click()
    await page.getByRole('textbox', { name: 'Nombre' }).fill('Llave de prueba')
    await page.getByRole('button', { name: 'Continuar' }).click()
    await expect(page.getByText('Llave de prueba')).toBeVisible()
    await expect(page.getByText(/Creada el/)).toBeVisible()

    await page.getByRole('button', { name: /^Tu cuenta/ }).click()
    await page.getByRole('button', { name: 'Cerrar sesión' }).click()
    await expect(page).toHaveURL(/\/entrar/)

    await page.getByRole('button', { name: 'Entrar con llave de acceso' }).click()
    await expect(page).not.toHaveURL(/\/entrar/)

    // Leaves the demo account as it was.
    await page.goto('/cuenta/llaves')
    await page.getByRole('button', { name: 'Quitar' }).first().click()
    await page.getByRole('button', { name: 'Quitar' }).last().click()
    await expect(page.getByText('Llave quitada.')).toBeVisible()
  })
})
