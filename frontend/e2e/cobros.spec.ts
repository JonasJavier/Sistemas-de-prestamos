import { expect, test, type Page } from '@playwright/test'

import { amountOf, ensureCashOpen, MODELO, PASSWORD, sessionFor, signIn } from './helpers'

/** Phase 4 demo (doc 10 - 1): collect, correct with someone else's
 * authorization, count and close the cash; the collector's day on the phone
 * and the settlement. The seed's portfolio (seed_demo) has José Pérez a few
 * days late and María Gómez in the collector's route. */

async function openLoanOf(page: Page, customer: string) {
  await page.goto('/prestamos')
  await page.getByPlaceholder('Buscar por número, cliente o cédula…').fill(customer)
  await page
    .getByRole('link', { name: new RegExp(customer) })
    .first()
    .click()
  await expect(page).toHaveURL(/\/prestamos\/[^/]+$/)
}

test('la cajera cobra, corrige con autorización y cierra; el supervisor aprueba', async ({
  browser,
}) => {
  const cashier = await sessionFor(browser, MODELO.cajera)
  await ensureCashOpen(cashier)

  // F5: the payment screen shows what is owed and the exact breakdown first.
  await openLoanOf(cashier, 'Pérez Santana')
  await cashier.getByRole('link', { name: 'Cobrar', exact: true }).click()
  await expect(cashier.getByRole('heading', { name: /Cobrar/ })).toBeVisible()
  await expect(cashier.getByText('Cuotas pendientes')).toBeVisible()
  await cashier.getByLabel('Monto a pagar').fill('500')
  await cashier.getByLabel('Recibido').fill('1000')
  await expect(cashier.getByText('Cambio a devolver')).toBeVisible()
  await cashier.getByRole('button', { name: 'Confirmar cobro de RD$ 500.00' }).click()

  // P34: the receipt, printable, with its WhatsApp link.
  await expect(cashier).toHaveURL(/\/recibos\//)
  await expect(cashier.getByText('Recibo de pago')).toBeVisible()
  await expect(cashier.getByRole('link', { name: 'Enviar por WhatsApp' })).toBeVisible()
  const receiptUrl = cashier.url()
  const publicLink = await cashier.getByLabel('Enlace').inputValue()
  const visitor = await (await browser.newContext()).newPage()
  await visitor.goto(publicLink)
  await expect(visitor.getByText('Recibo de pago')).toBeVisible()
  await expect(visitor.getByText(/•/).first()).toBeVisible() // the document, masked

  // F12 / E14: 500 was a typo, it was 400. Someone else authorizes.
  await cashier.getByRole('button', { name: 'Reversar o corregir' }).click()
  await cashier.getByRole('radio', { name: 'Corregir el monto' }).click()
  await cashier.getByLabel(/Monto correcto/).fill('400')
  await cashier.getByLabel('Motivo').selectOption({ label: 'Monto digitado incorrecto' })
  await cashier.getByLabel('Qué pasó').fill('Se digitó 500 y eran 400')
  await expect(cashier.getByText('Capital pendiente').last()).toBeVisible()
  await cashier.getByRole('button', { name: 'Pedir autorización' }).click()
  await expect(cashier.getByText(/espera la autorización/)).toBeVisible()

  const supervisor = await sessionFor(browser, MODELO.supervisor)
  await supervisor.goto('/avisos')
  await supervisor.getByRole('tab', { name: 'Por autorizar' }).click()
  await supervisor.getByRole('button', { name: 'Autorizar' }).first().click()
  const dialog = supervisor.getByRole('dialog')
  await dialog.getByLabel(/contraseña/).fill(PASSWORD) // no 2FA app in development
  await dialog.getByRole('button', { name: 'Autorizar' }).click()
  await expect(supervisor.getByText('Autorizado.')).toBeVisible()

  await cashier.goto(receiptUrl)
  await expect(cashier.getByText('Reversado').first()).toBeVisible()
  await cashier.getByRole('link', { name: /Ver el recibo correcto/ }).click()
  await expect(cashier.getByText('RD$ 400.00').first()).toBeVisible()

  // F7: count by denomination and close; the supervisor approves.
  await cashier.goto('/caja')
  await cashier.getByRole('button', { name: 'Arqueo y cierre' }).click()
  const counting = cashier.getByRole('dialog')
  const expected = amountOf(
    (await counting.getByText('Esperado', { exact: true }).locator('..').innerText()).replace(
      'Esperado',
      '',
    ),
  )
  await counting.getByLabel('Cantidad de 1000').fill(String(Math.floor(expected / 1000)))
  await counting
    .getByLabel('Cantidad de 1', { exact: true })
    .fill(String(Math.round(expected % 1000)))
  await expect(counting.getByText('cuadra')).toBeVisible()
  await counting.getByRole('button', { name: 'Cerrar caja' }).click()
  await expect(cashier.getByText('Sin caja abierta')).toBeVisible()

  await supervisor.goto('/cajas')
  await supervisor
    .getByRole('link', { name: /Carolina Núñez/ })
    .first()
    .click()
  await supervisor.getByRole('button', { name: 'Aprobar cierre' }).click()
  await expect(supervisor.getByText(/Aprobado por/)).toBeVisible()
  await expect(supervisor.getByRole('link', { name: 'PDF del cierre' })).toBeVisible()
})

test('el cobrador cobra en su ruta desde el celular y la cajera recibe la rendición', async ({
  browser,
}) => {
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: 18.4861, longitude: -69.9312 },
    permissions: ['geolocation'],
  })
  const collector = await phone.newPage()
  await signIn(collector, MODELO.cobrador)
  await expect(collector).toHaveURL(/\/ruta$/) // P10: the collector lands on «Mi ruta»
  const accept = collector.getByRole('button', { name: 'Acepto' })
  const start = collector.getByRole('button', { name: 'Abrir mi ruta de hoy' })
  await expect(accept.or(start).or(collector.getByText('Efectivo en mano')).first()).toBeVisible()
  if (await accept.isVisible()) {
    await accept.click()
    await expect(start).toBeVisible()
  }
  if (await start.isVisible()) {
    await start.click()
    await expect(collector.getByRole('button', { name: 'Cerrar ruta' })).toBeVisible()
  }

  const stop = collector.getByRole('listitem').filter({ hasText: 'María Gómez' }).first()
  await expect(stop).toBeVisible()
  const number = (await stop.innerText()).match(/Préstamo (\S+)/)![1]
  await collector.goto(`/cobrar/${number}`)
  await expect(collector.getByText(/Tu ruta de hoy/)).toBeVisible()
  await collector.getByLabel('Monto a pagar').fill('300')
  await collector.getByRole('button', { name: 'Confirmar cobro de RD$ 300.00' }).click()
  await expect(collector).toHaveURL(/\/recibos\//)
  await expect(collector.getByRole('link', { name: 'Enviar por WhatsApp' })).toBeVisible()

  await collector.goto('/ruta')
  await collector.getByRole('button', { name: 'Cerrar ruta' }).click()
  await expect(collector.getByText('Efectivo a entregar al cajero')).toBeVisible()

  // F6 step 5: the cashier counts the collector's cash into her drawer.
  const cashier = await sessionFor(browser, MODELO.cajera)
  await ensureCashOpen(cashier, '1000')
  const row = cashier.getByRole('listitem').filter({ hasText: 'Carlos Cobrador' })
  await row.getByRole('button', { name: 'Recibir' }).click()
  const settle = cashier.getByRole('dialog')
  const due = amountOf(
    (await settle.getByText('Efectivo que debe entregar').locator('..').innerText()).replace(
      'Efectivo que debe entregar',
      '',
    ),
  )
  await settle.getByLabel('Efectivo contado').fill(due.toFixed(2))
  await settle.getByRole('button', { name: 'Confirmar recepción' }).click()
  await expect(cashier.getByText('Rendición recibida.')).toBeVisible()
})

test('el gerente ve los atrasos por tramo y el avance de las rutas', async ({ browser }) => {
  const manager = await sessionFor(browser, MODELO.gerente)
  await manager.goto('/atrasos')
  await expect(manager.getByRole('tab', { name: /1–7 días/ })).toBeVisible()
  // The seed's late loans change bucket as the days go by: open the first
  // bucket that has any (its name reads «1–7 días 2 RD$ …») and see a row.
  await expect(manager.getByRole('tab').first()).toContainText('RD$')
  const late = manager
    .getByRole('tab')
    .filter({ hasNotText: /días\s*0\s*RD|90\s*0\s*RD/ })
    .first()
  await late.click()
  await expect(late).toHaveAttribute('aria-selected', 'true')
  await expect(manager.getByText(/María Gómez|Pérez Santana/).first()).toBeVisible()
  await manager.goto('/rutas')
  await expect(manager.getByText('Carlos Cobrador').first()).toBeVisible()
  await expect(manager.getByRole('button', { name: 'Mapa' }).first()).toBeVisible()
})
