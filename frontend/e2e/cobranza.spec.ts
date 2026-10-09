import { expect, test } from '@playwright/test'

import { MODELO, sessionFor } from './helpers'

/** Phase 5 demo (doc 10 - 1, F8): an action with a promise from the loan,
 * the agent's agenda, the assignment of the agent from the arrears tray and
 * the escalation rules. The seed has José Pérez Santana a few days late. */

test('el oficial registra una promesa y la ve en su agenda; el supervisor le asigna el préstamo', async ({
  browser,
}) => {
  const officer = await sessionFor(browser, MODELO.oficial)
  await officer.goto('/prestamos')
  await officer.getByPlaceholder('Buscar por número, cliente o cédula…').fill('Pérez Santana')
  await officer
    .getByRole('link', { name: /Pérez Santana/ })
    .first()
    .click()
  await expect(officer).toHaveURL(/\/prestamos\/[^/]+$/)
  const loanNumber = officer.url().split('/').pop()!
  await officer.getByRole('tab', { name: 'Gestiones' }).click()

  // P42: a call where the customer promises a date and an amount.
  await officer.getByRole('button', { name: 'Registrar gestión' }).click()
  const dialog = officer.getByRole('dialog', { name: /Gestión/ })
  await dialog.getByRole('radio', { name: 'Llamada' }).click()
  await dialog.getByRole('radio', { name: 'Prometió pagar' }).click()
  await dialog.getByLabel('Monto (RD$)').fill('300')
  await dialog.getByLabel('Nota').fill('Paga con la quincena')
  await dialog.getByRole('button', { name: 'Guardar promesa' }).click()
  await expect(officer.getByText('Promesa pendiente')).toBeVisible()
  await expect(officer.getByText(/300\.00 para el/).first()).toBeVisible()
  await expect(officer.getByText('Llamada: Prometió pagar').first()).toBeVisible()

  // P44: the promise is in the agenda of the days to come.
  await officer.goto('/cobranza')
  await expect(officer.getByRole('heading', { name: 'Agenda de cobranza' })).toBeVisible()
  await expect(officer.getByText(/300\.00 para el/).first()).toBeVisible()

  // P43: the supervisor makes the officer the agent of that loan.
  const supervisor = await sessionFor(browser, MODELO.supervisor)
  await supervisor.goto('/atrasos')
  await supervisor.getByPlaceholder('Buscar por número o cliente…').fill('Pérez Santana')
  await expect(supervisor.getByText(/Promesa RD\$ 300\.00/)).toBeVisible()
  await supervisor.getByLabel(`Seleccionar ${loanNumber}`).check()
  await supervisor.getByRole('button', { name: 'Asignar gestor' }).click()
  const assign = supervisor.getByRole('dialog', { name: /Asignar gestor/ })
  await assign.getByLabel('Gestor').selectOption({ label: 'Olga Oficial · Oficial de crédito' })
  await assign.getByLabel(/Motivo/).fill('Telecobranza')
  await assign.getByRole('button', { name: 'Asignar' }).click()
  await expect(supervisor.getByText(/Gestor asignado/)).toBeVisible()
  await expect(supervisor.getByText(/gestor Olga/).first()).toBeVisible()
})

test('el gerente ajusta los días del escalamiento', async ({ browser }) => {
  const manager = await sessionFor(browser, MODELO.gerente)
  await manager.goto('/ajustes/empresa')
  await expect(manager.getByRole('heading', { name: 'Escalamiento de la cobranza' })).toBeVisible()
  await manager.getByLabel('Días para Revisar el caso').fill('30')
  await manager.getByRole('button', { name: 'Guardar reglas' }).click()
  await expect(manager.getByText('Reglas de escalamiento guardadas.')).toBeVisible()
})
