import { expect, test } from '@playwright/test'

import { MODELO, sessionFor } from './helpers'

const OWNER = 'dueno@cobradia.test'

/** Decision 125: the company pays by transfer and uploads the receipt; the
 * owner reviews it from the company's file. The drill rejects it, so the
 * demo keeps its plan. */
test('la empresa envía un comprobante y el dueño lo revisa', async ({ browser }) => {
  const manager = await sessionFor(browser, MODELO.gerente)
  await manager.goto('/ajustes/suscripcion')
  await expect(manager.getByText('Cuenta de ahorro · DOP')).toBeVisible()
  await manager.getByRole('button', { name: 'Activar Profesional' }).click()
  const dialog = manager.getByRole('dialog')
  await dialog.getByLabel(/Referencia/).fill('E2E-001')
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'comprobante.png',
    mimeType: 'image/png',
    buffer: Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(64),
    ]),
  })
  await dialog.getByRole('button', { name: 'Enviar comprobante' }).click()
  await expect(manager.getByText(/Comprobante enviado/)).toBeVisible()
  await expect(manager.getByText('Por confirmar').first()).toBeVisible()

  const owner = await sessionFor(browser, OWNER)
  await expect(owner.getByText('Comprobantes por confirmar')).toBeVisible()
  await owner
    .getByRole('link', { name: /Financiera Modelo SRL/ })
    .first()
    .click()
  await owner.getByRole('button', { name: 'Rechazar' }).first().click()
  const review = owner.getByRole('dialog')
  await review.getByLabel('Motivo').fill('Prueba automática: no es un pago real')
  await review.getByRole('button', { name: 'Rechazar' }).click()
  await expect(owner.getByText('Comprobante rechazado; la empresa fue avisada.')).toBeVisible()

  await manager.reload()
  await expect(manager.getByText('Rechazado').first()).toBeVisible()
})
