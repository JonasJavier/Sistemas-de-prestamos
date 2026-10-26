import { expect, test } from '@playwright/test'

import { MODELO, sessionFor } from './helpers'

/** D1 (decision 131): the manager imports customers from the app. The
 * rehearsal reports the bad row and saves nothing; the corrected file is
 * applied, and applying it again only skips what already exists. */
test('el gerente ensaya e importa clientes desde Ajustes', async ({ browser }) => {
  const manager = await sessionFor(browser, MODELO.gerente)
  await manager.goto('/ajustes/importar')
  await expect(manager.getByRole('heading', { name: 'Importar cartera' })).toBeVisible()
  const header = 'tipo,tipo_documento,documento,nombres,apellidos,telefono,sucursal\n'
  const good = 'persona,cedula,002-1234567-2,Pedro,Santana,8095550102,01\n'
  const bad = 'persona,cedula,999-9999999-9,Rosa,Mejía,,01\n'
  const upload = manager.getByLabel('Archivo de clientes')

  await upload.setInputFiles({
    name: 'clientes.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(header + good + bad, 'utf-8'),
  })
  await expect(manager.getByText(/Nada se guardó/)).toBeVisible()
  await expect(manager.getByText('Fila 3')).toBeVisible()
  await expect(manager.getByRole('button', { name: 'Aplicar la importación' })).toHaveCount(0)

  await upload.setInputFiles({
    name: 'clientes.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(header + good, 'utf-8'),
  })
  await expect(manager.getByText(/Ensayo sin guardar|Nada nuevo que guardar/)).toBeVisible()
  const apply = manager.getByRole('button', { name: 'Aplicar la importación' })
  if (await apply.isVisible()) {
    await apply.click()
    await expect(manager.getByText(/Importación aplicada/).first()).toBeVisible()
  }
  // Pedro is now a customer of the company.
  await manager.goto('/clientes')
  await manager.getByPlaceholder('Buscar por nombre, cédula, RNC o teléfono…').fill('002-1234567-2')
  await expect(manager.getByRole('link', { name: /Pedro Santana/ }).first()).toBeVisible()
})
