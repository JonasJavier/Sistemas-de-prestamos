import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'

import { ensureCashOpen, MODELO, sessionFor, signIn } from './helpers'

/** C1 (decision 133): the real screens of the demo, for the public site.
 * Runs only when asked (CAPTURAS=1), against the local demo (seed_demo),
 * after a little activity so the pictures show a day at work:
 *
 *   CAPTURAS=1 pnpm exec playwright test e2e/capturas.spec.ts --project=escritorio
 *
 * Writes site/public/capturas/*.png. */
const OUT = fileURLToPath(new URL('../../site/public/capturas', import.meta.url))
const DESKTOP = { width: 1280, height: 800 }
const PHONE = { width: 390, height: 844 }

test.skip(!process.env.CAPTURAS, 'solo cuando se piden las capturas (CAPTURAS=1)')

test('capturas reales de la app para el sitio', async ({ browser }) => {
  mkdirSync(OUT, { recursive: true })
  test.setTimeout(180_000)

  // The collector opens the route and collects the first stop.
  // A phone with its location allowed: the route only opens with GPS.
  const phone = await browser.newContext({
    viewport: PHONE,
    geolocation: { latitude: 18.4861, longitude: -69.9312 },
    permissions: ['geolocation'],
  })
  const collector = await phone.newPage()
  await signIn(collector, MODELO.cobrador)
  await expect(collector).toHaveURL(/\/ruta$/)
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
  const stop = await collector
    .getByText(/Préstamo \d{2}-\d+/)
    .first()
    .innerText()
  const number = stop.replace(/^Préstamo\s+/, '').trim()
  await collector.goto(`/cobrar/${number}`)
  await expect(collector.getByText(/Tu ruta de hoy/)).toBeVisible()
  await collector.getByLabel('Monto a pagar').fill('300')
  await collector.getByRole('button', { name: /Registrar pago/ }).click()
  await expect(collector).toHaveURL(/recibos/)
  await collector.goto('/ruta')
  await collector
    .getByRole('button', { name: 'Cerrar ruta' })
    .or(collector.getByRole('heading', { name: /Mi ruta/ }))
    .first()
    .waitFor()
  await collector.waitForTimeout(800)
  await collector.screenshot({ path: `${OUT}/ruta.png` })

  // The cashier opens today's drawer and collects an installment.
  const cashier = await sessionFor(browser, MODELO.cajera)
  await cashier.setViewportSize(DESKTOP)
  await ensureCashOpen(cashier)
  await cashier.goto(`/cobrar/${number}`)
  await cashier.getByLabel('Monto a pagar').fill('500')
  await cashier.getByLabel('Recibido').fill('1000')
  await cashier.getByRole('button', { name: /Registrar pago/ }).click()
  await expect(cashier).toHaveURL(/recibos/)
  await cashier.goto('/caja')
  await expect(cashier.getByText('Esperado en caja')).toBeVisible()
  await cashier.waitForTimeout(800)
  await cashier.screenshot({ path: `${OUT}/caja.png` })

  // The manager's screens, with the day's activity on them.
  const manager = await sessionFor(browser, MODELO.gerente)
  await manager.setViewportSize(DESKTOP)
  await manager.goto('/')
  await expect(manager.getByText('Cartera activa')).toBeVisible()
  const hide = manager.getByRole('button', { name: 'Ocultar esta guía' })
  if (await hide.isVisible()) await hide.click()
  await manager.waitForTimeout(1200)
  await manager.screenshot({ path: `${OUT}/inicio.png` })

  await manager.goto('/atrasos')
  await expect(manager.getByRole('tab').first()).toBeVisible()
  await manager.waitForTimeout(500)
  await manager.screenshot({ path: `${OUT}/atrasos.png` })

  await manager.goto('/prestamos')
  await expect(manager.getByRole('heading', { name: 'Préstamos' })).toBeVisible()
  await manager.waitForTimeout(800)
  await manager.screenshot({ path: `${OUT}/prestamos.png` })
})
