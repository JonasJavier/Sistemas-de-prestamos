import { expect, test } from '@playwright/test'

import { MODELO, sessionFor } from './helpers'

/** Phase 9 · F18 (decision 097): a test message is recorded with its status;
 * without a contracted provider WhatsApp is «registrado sin proveedor». */
test('el gerente envía un mensaje de prueba y lo ve en el registro', async ({ browser }) => {
  const manager = await sessionFor(browser, MODELO.gerente)
  await manager.goto('/ajustes/mensajes')
  await expect(manager.getByRole('heading', { name: 'Mensajería' })).toBeVisible()
  await expect(manager.getByText('Confirmación de pago')).toBeVisible()
  await manager.getByRole('combobox', { name: /^Canal/ }).selectOption('whatsapp')
  await manager.getByLabel('Teléfono').fill('809-555-0101')
  await manager.getByRole('button', { name: 'Enviar mensaje de prueba' }).click()
  await expect(manager.getByText(/Mensaje de prueba enviado/)).toBeVisible()
  await manager.getByRole('tab', { name: 'Registro de envíos' }).click()
  // The select also lists «Registrado sin proveedor»: look inside the message row.
  const row = manager.getByRole('listitem').filter({ hasText: '+18095550101' }).first()
  await expect(row.getByText('Registrado sin proveedor')).toBeVisible()
})
