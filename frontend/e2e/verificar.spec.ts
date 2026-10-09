import { expect, test } from '@playwright/test'

import { MODELO, sessionFor } from './helpers'

/** Phase 9 · P91 (decision 098): the QR of a receipt leads to a public page
 * that confirms it; an unknown code is flagged. */
test('cualquiera verifica un recibo por su código', async ({ browser }) => {
  const cashier = await sessionFor(browser, MODELO.cajera)
  const list = await cashier.request.get('/api/v1/pagos/')
  const first = (await list.json()).results[0]
  const receipt = await (await cashier.request.get(`/api/v1/pagos/${first.number}/`)).json()
  expect(receipt.qr).toMatch(/^data:image\/svg\+xml;base64,/)
  const token = String(receipt.receipt_path).split('/').pop()

  const visitor = await (await browser.newContext()).newPage()
  await visitor.goto(`/v/${token}`)
  await expect(visitor.getByText(/Recibo auténtico|Documento auténtico/)).toBeVisible()
  await expect(visitor.getByText(first.number)).toBeVisible()
  await visitor.goto('/v/codigo-falso')
  await expect(visitor.getByText(/no corresponde a ningún documento/)).toBeVisible()
})
