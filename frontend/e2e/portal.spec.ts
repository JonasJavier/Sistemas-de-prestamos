import { expect, test, type APIRequestContext } from '@playwright/test'

import { MODELO, sessionFor } from './helpers'

const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025'
const EMAIL = 'maria@cliente.test' // seed_demo

/** The newest «Tu código de acceso» that reached the customer's inbox. */
async function latestCode(request: APIRequestContext, after: number): Promise<string> {
  let code = ''
  await expect
    .poll(async () => {
      const found = await request.get(
        `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${EMAIL} subject:"Tu código de acceso"`)}`,
      )
      const first = (await found.json()).messages?.[0]
      if (!first || Date.parse(first.Created) < after) return ''
      const message = await (await request.get(`${MAILPIT}/api/v1/message/${first.ID}`)).json()
      code = /\b(\d{6})\b/.exec(message.Text)?.[1] ?? ''
      return code
    })
    .not.toBe('')
  return code
}

/** Phase 9 · P92–P93 (decision 099): the cashier invites the customer, who
 * enters with a one-time code and sees only their loans. */
test('la clienta entra a su portal con un código y ve sus préstamos', async ({
  browser,
  request,
}) => {
  const cashier = await sessionFor(browser, MODELO.cajera)
  const customers = await cashier.request.get('/api/v1/clientes/?q=0011234567')
  const maria = (await customers.json()).results[0]
  await cashier.goto(`/clientes/${maria.id}`)
  await cashier.getByRole('tab', { name: 'Mensajes' }).click()
  await cashier.getByRole('button', { name: /Invitar al portal|Enviar nueva invitación/ }).click()
  const link = await cashier.getByLabel('Enlace al portal').inputValue()
  expect(link).toContain('/portal/entrar?t=')
  await expect(cashier.getByText(/Tiene acceso desde/)).toBeVisible()

  const visitor = await (await browser.newContext()).newPage()
  await visitor.goto(new URL(link).pathname + new URL(link).search)
  const asked = Date.now() - 5_000
  await visitor.getByRole('button', { name: 'Enviarme el código' }).click()
  await expect(visitor.getByText(/Te enviamos un código a ma•••@cliente\.test/)).toBeVisible()
  await visitor.getByLabel('Código').fill(await latestCode(request, asked))
  await visitor.getByRole('button', { name: 'Entrar', exact: true }).click()

  await expect(visitor.getByRole('heading', { name: /Hola, María Gómez/ })).toBeVisible()
  await expect(visitor.getByRole('heading', { name: /^Préstamo / }).first()).toBeVisible()
  await visitor.getByRole('button', { name: 'Ver cuotas y pagos' }).first().click()
  await expect(visitor.getByRole('heading', { name: 'Calendario de pagos' }).first()).toBeVisible()
  await visitor.getByRole('button', { name: 'Salir' }).click()
  await expect(visitor.getByText('Saliste de tu portal')).toBeVisible()
  await visitor.goto('/portal')
  await expect(visitor.getByText('Tu sesión terminó')).toBeVisible()
})
