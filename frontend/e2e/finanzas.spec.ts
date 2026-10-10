import { expect, test } from '@playwright/test'

import { MODELO, sessionFor } from './helpers'

/** Phase 6 demo (doc 10 - 1, F15): an expense with its NCF, a payable paid,
 * the statements that balance and the month-end close. The seed has a bank,
 * two expenses and a monthly rent. */

test('el gerente registra un gasto, paga una cuenta y ve los estados', async ({ browser }) => {
  const manager = await sessionFor(browser, MODELO.gerente)

  // P54: an office expense from the general cash, with its receipt data.
  await manager.goto('/gastos')
  await manager.getByRole('button', { name: 'Nuevo gasto' }).click()
  const expense = manager.getByRole('dialog', { name: 'Nuevo gasto' })
  await expense.getByLabel('Categoría').selectOption({ label: 'Materiales de oficina' })
  await expense.getByLabel('Monto (RD$)').fill('500')
  await expense.getByLabel('Descripción').fill('Sobres manila')
  // A receipt is entered once (the 606): each run brings a new one.
  await expense.getByLabel('NCF del comprobante').fill(`B02${String(Date.now()).slice(-8)}`)
  await expense.getByRole('button', { name: /Registrar/ }).click()
  await expect(manager.getByText(/Gasto .* registrado/)).toBeVisible()
  await expect(manager.getByText('Sobres manila').first()).toBeVisible()

  // P55: paying part of the rent ahead recognizes it and lowers what is owed.
  await manager.goto('/cuentas-por-pagar')
  await manager
    .getByText(/Alquiler del local \(\d\/6\)/)
    .first()
    .click()
  const payable = manager.getByRole('dialog')
  await payable.getByRole('button', { name: 'Pagar', exact: true }).click()
  await payable.getByLabel('Sale de').selectOption({ label: 'Caja general' })
  await payable.getByLabel('Monto (RD$)').fill('1000') // a partial payment (#10)
  await payable.getByRole('button', { name: /Registrar pago/ }).click()
  await expect(manager.getByText(/Pago registrado/)).toBeVisible()
  await payable.getByRole('button', { name: 'Cerrar' }).click()

  // P56: the statements come from the books and the balance sheet balances.
  await manager.goto('/contabilidad')
  await manager.getByRole('tab', { name: 'Resultados' }).click()
  await expect(manager.getByText('Estado de resultados')).toBeVisible()
  await expect(manager.getByText('Materiales y gastos de oficina').first()).toBeVisible()
  await manager.getByRole('tab', { name: 'Balance' }).click()
  await expect(manager.getByText('Activos = pasivos + patrimonio')).toBeVisible()
})

test('el gerente cierra el mes pasado y queda bloqueado', async ({ browser }) => {
  const manager = await sessionFor(browser, MODELO.gerente)
  await manager.goto('/contabilidad')
  await manager.getByRole('tab', { name: 'Cierre de mes' }).click()
  const detail = manager.getByRole('heading', { level: 2 }).filter({ hasText: /\d{4}$/ })
  await expect(detail.first()).toBeVisible()
  // The tours run again on the same data: reopen first if a run closed it.
  const reopen = manager.getByRole('button', { name: 'Reabrir' })
  if (await reopen.isVisible()) {
    await reopen.click()
    await manager.getByLabel('Motivo').fill('Nueva prueba del recorrido')
    await manager.getByRole('dialog').getByRole('button', { name: 'Reabrir' }).click()
    await expect(manager.getByText(/Mes reabierto/)).toBeVisible()
  }
  await manager.getByRole('button', { name: 'Cerrar el mes' }).click()
  await manager.getByRole('dialog').getByRole('button', { name: 'Cerrar el mes' }).click()
  await expect(manager.getByText('Mes cerrado.')).toBeVisible()
  await expect(manager.getByRole('link', { name: 'PDF del cierre' })).toBeVisible()
})
