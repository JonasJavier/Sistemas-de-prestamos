import { expect, test } from '@playwright/test'

import { MODELO, sessionFor } from './helpers'

test('un bien en garantía se registra y guarda sus fotos y documentos', async ({ browser }) => {
  const officer = await sessionFor(browser, MODELO.oficial)
  await officer.goto('/clientes')
  await officer.getByRole('link', { name: /Ana Luisa Rodríguez/ }).click()
  await officer.getByRole('tab', { name: 'Garantías' }).click()

  // An incomplete vehicle explains what is missing (it used to crash the screen).
  const description = `Motor de prueba ${Date.now()}`
  await officer.getByLabel('Descripción').fill(description)
  await officer.getByRole('button', { name: 'Registrar bien' }).click()
  await expect(officer.getByRole('alert')).toBeVisible()

  await officer.getByLabel('Marca').fill('Honda')
  await officer.getByLabel('Modelo').fill('CG 150')
  await officer.getByRole('button', { name: 'Registrar bien' }).click()
  const asset = officer.locator('li').filter({ hasText: description })
  await expect(asset).toBeVisible()

  await asset.getByText('Fotos y documentos').click()
  await expect(asset.getByLabel('Tipo de archivo')).toBeVisible()
  await expect(asset.getByText('Sin archivos todavía.')).toBeVisible()
})
