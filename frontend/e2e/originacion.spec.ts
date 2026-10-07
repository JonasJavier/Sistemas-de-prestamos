import { expect, test } from '@playwright/test'

import { MODELO, sessionFor } from './helpers'

/** Phase 3 demo (doc 10 - 1): the officer creates, the supervisor approves and
 * the cashier disburses. Nobody approves their own nor disburses what they
 * approved, so each role works in its own session. */
test('una solicitud viaja del oficial a la cajera y termina en préstamo', async ({ browser }) => {
  // 1. Officer: search first, then the conditions with a live quote.
  const officer = await sessionFor(browser, MODELO.oficial)
  await officer.goto('/solicitudes/nueva')
  await officer.getByPlaceholder('Buscar por nombre, cédula o teléfono…').fill('Gómez')
  await officer.getByRole('button', { name: /María Gómez/ }).click()
  await officer.getByLabel('Producto').selectOption({ label: 'Cuota Fija (mensual)' })
  await officer.getByLabel('Monto (RD$)').fill('25000')
  await expect(officer.getByText('Total a pagar')).toBeVisible()
  await officer.getByRole('button', { name: 'Crear borrador' }).click()
  await expect(officer).toHaveURL(/\/solicitudes\/[0-9a-f-]{36}$/)
  const applicationUrl = new URL(officer.url()).pathname

  // Required documents block the approval, so the officer verifies them.
  await expect(officer.getByText('Cédula o RNC')).toBeVisible()
  const pending = officer.getByRole('button', { name: 'Marcar verificado' })
  while ((await pending.count()) > 0) {
    const before = await pending.count()
    await pending.first().click()
    await expect(pending).toHaveCount(before - 1)
  }
  await officer.getByRole('button', { name: 'Enviar a aprobación' }).click()
  await expect(officer.getByText('En evaluación').first()).toBeVisible()
  // The officer cannot decide on their own application.
  await expect(officer.getByRole('heading', { name: 'Decisión' })).toHaveCount(0)

  // 2. Supervisor approves.
  const supervisor = await sessionFor(browser, MODELO.supervisor)
  await supervisor.goto(applicationUrl)
  await expect(supervisor.getByRole('heading', { name: 'Decisión' })).toBeVisible()
  const decision = supervisor.locator('div').filter({
    has: supervisor.getByRole('heading', { name: 'Decisión' }),
  })
  await decision.getByRole('button', { name: 'Aprobar', exact: true }).last().click()
  await expect(supervisor.getByText('Aprobada').first()).toBeVisible()

  // 3. Cashier disburses from the funded cash box.
  const cashier = await sessionFor(browser, MODELO.cajera)
  await cashier.goto('/desembolsos')
  await cashier
    .getByRole('link', { name: /María Gómez/ })
    .first()
    .click()
  await cashier.getByLabel('Caja de origen').selectOption({ index: 1 })
  await cashier.getByText('Verifiqué la identidad del cliente').click()
  await cashier.getByRole('button', { name: /^Desembolsar RD\$/ }).click()

  // Sign before handing over the money, then the loan file.
  await expect(cashier.getByText('antes de entregar el dinero')).toBeVisible()
  await expect(cashier.getByRole('link', { name: /Imprimir/ }).first()).toBeVisible()
  await cashier.getByRole('link', { name: 'Ver el expediente del préstamo' }).click()
  await expect(cashier.getByText('Capital pendiente')).toBeVisible()
  await expect(cashier.getByText('RD$ 25,000.00').first()).toBeVisible()
})
