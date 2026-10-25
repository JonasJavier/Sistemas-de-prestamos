import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { getMyCompany, listPublicPlans } from '../api/platform'
import { buttonClass } from '../components/classes'
import { BankIcon, CheckIcon } from '../components/icons'
import { Alert, PageHeader, Segmented, Spinner, Texture } from '../components/ui'
import { day, STATUS_BADGES, whole } from '../lib/format'
import { PLAN_PITCH } from '../lib/plan'
import { useDocumentTitle } from '../lib/hooks'

/** The length of the free trial (the sign-up promises 30 days). */
const TRIAL_DAYS = 30

const mailto = (plan: string, yearly: boolean) =>
  `mailto:hola@cobradia.com?subject=${encodeURIComponent(
    `Activar el plan ${plan} (${yearly ? 'anual' : 'mensual'})`,
  )}`

/** The trial as days: the past in gold, today ringed, what is left soft. */
function TrialDays({ left, endsOn }: { left: number; endsOn: string | null }) {
  const used = Math.max(TRIAL_DAYS - left, 0)
  const end = endsOn ? new Date(`${endsOn}T00:00:00`) : null
  const start = end ? new Date(end.getTime() - TRIAL_DAYS * 86_400_000) : null
  const short = (d: Date | null) =>
    d ? d.toLocaleDateString('es-DO', { day: 'numeric', month: 'short' }).replace('.', '') : ''
  return (
    <div className="min-w-0 flex-1 basis-72">
      <div
        aria-hidden
        className="grid gap-[3px]"
        style={{ gridTemplateColumns: `repeat(${TRIAL_DAYS}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: TRIAL_DAYS }, (_, index) => (
          <span
            key={index}
            className={`h-3.5 rounded-[3px] ${
              index < used
                ? 'bg-gold-500'
                : index === used
                  ? 'bg-surface ring-2 ring-inset ring-gold-500'
                  : 'bg-gold-500/20'
            }`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11.5px] text-gold-800/80">
        <span>{short(start)} · inicio</span>
        <span>Hoy, día {Math.min(used + 1, TRIAL_DAYS)}</span>
        <span>{short(end)}</span>
      </div>
    </div>
  )
}

/** P-Suscripción (decision 115): the trial with its days, what the plan caps
 * and uses, the plans and how to pay. */
export function SubscriptionPage() {
  useDocumentTitle('Suscripción')
  const company = useQuery({ queryKey: ['my-company'], queryFn: getMyCompany })
  const plans = useQuery({ queryKey: ['public-plans'], queryFn: listPublicPlans })
  const [yearly, setYearly] = useState(false)
  const data = company.data
  const badge = data ? STATUS_BADGES[data.status] : null
  const trial = data?.status === 'trial' && typeof data.trial_days_left === 'number'
  const plan = data?.subscription?.plan

  return (
    <>
      <PageHeader
        title="Suscripción"
        subtitle="El plan de tu financiera y hasta cuándo está pagado."
        actions={
          badge ? (
            <span className={`rounded-full px-3 py-1 text-[12.5px] font-semibold ${badge.classes}`}>
              {badge.text}
            </span>
          ) : null
        }
      />
      {company.isPending ? <Spinner /> : null}
      {data?.status === 'suspended' ? (
        <Alert tone="warning">
          {data.status_reason ||
            'La empresa está suspendida: puedes consultar y exportar, pero no operar.'}
        </Alert>
      ) : null}

      {trial ? (
        <section className="relative overflow-hidden rounded-card bg-gold-100 px-5 py-5 ring-1 ring-inset ring-gold-500/30 sm:px-7">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <div className="min-w-0 basis-64">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-gold-800">
                <span aria-hidden className="size-1.5 rounded-full bg-gold-500" />
                Prueba gratis
              </p>
              <h2 className="mt-1 text-[24px] font-bold text-ink">
                Te quedan {data!.trial_days_left} {data!.trial_days_left === 1 ? 'día' : 'días'}
              </h2>
              <p className="text-[13.5px] text-gold-800">
                Termina el{' '}
                {data!.trial_ends_on
                  ? new Date(`${data!.trial_ends_on}T00:00:00`).toLocaleDateString('es-DO', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })
                  : '—'}
                . Tus datos se quedan contigo.
              </p>
            </div>
            <TrialDays left={data!.trial_days_left!} endsOn={data!.trial_ends_on} />
            <a href="#planes" className={buttonClass('primary', 'shrink-0')}>
              Activar el plan
            </a>
          </div>
        </section>
      ) : data && plan ? (
        <section className="grid gap-3 rounded-card border border-edge bg-surface px-5 py-4 shadow-sm sm:grid-cols-3">
          {[
            ['Plan', plan.name],
            [
              'Mensualidad',
              Number(plan.monthly_price) > 0 ? `RD$ ${whole(plan.monthly_price)}` : 'Gratis',
            ],
            ['Pagada hasta', day(data.subscription?.paid_until)],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="text-[12.5px] text-muted">{label}</div>
              <div className="font-display text-[19px] font-semibold">{value}</div>
            </div>
          ))}
        </section>
      ) : null}

      {data?.subscription && data.usage ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ['Usuarios (con invitaciones)', data.usage.users, data.subscription.plan.max_users],
              ['Sucursales activas', data.usage.branches, data.subscription.plan.max_branches],
              [
                'Préstamos activos',
                data.usage.active_loans,
                data.subscription.plan.max_active_loans,
              ],
            ] as const
          ).map(([label, used, limit]) => {
            const full = limit !== null && used >= limit
            const share = limit ? Math.min(used / limit, 1) : 0
            return (
              <div
                key={label}
                className="rounded-card border border-edge bg-surface px-5 py-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2 text-[13px] text-muted">
                  <span>{label}</span>
                  {full ? (
                    <span className="font-semibold text-warning-700">En el límite</span>
                  ) : null}
                </div>
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span
                    className={`font-display text-[26px] font-bold tracking-[-0.02em] ${full ? 'text-warning-700' : ''}`}
                  >
                    {used.toLocaleString('es-DO')}
                  </span>
                  <span className="text-[13px] text-muted">
                    {limit === null ? 'sin límite' : `de ${limit.toLocaleString('es-DO')}`}
                  </span>
                </div>
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-edge">
                  <div
                    className={`h-full origin-left animate-grow-x rounded-full ${full ? 'bg-warning-700' : 'bg-brand-700'}`}
                    style={{ width: `${limit === null ? 0 : share * 100}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      <section id="planes" className="scroll-mt-24 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h2 className="text-[19px] font-semibold">Planes</h2>
            <span className="text-[12.5px] text-muted">
              Precio de lanzamiento, en pesos y sin ITBIS. Clientes y préstamos sin límite en todos.
            </span>
          </div>
          <Segmented
            label="Facturación"
            value={yearly ? 'anual' : 'mensual'}
            onChange={(value) => setYearly(value === 'anual')}
            options={[
              { value: 'mensual', label: 'Mensual' },
              { value: 'anual', label: 'Anual', count: '· 2 meses gratis' },
            ]}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {(plans.data ?? []).map((item) => {
            const p = {
              name: item.name,
              price: Number(item.monthly_price),
              pitch: PLAN_PITCH[item.tier].pitch,
              features: [
                [
                  item.max_branches === null
                    ? 'Sucursales sin límite'
                    : `${item.max_branches} ${item.max_branches === 1 ? 'sucursal' : 'sucursales'}`,
                  item.max_users === null ? 'usuarios sin límite' : `${item.max_users} usuarios`,
                ].join(' · '),
                ...PLAN_PITCH[item.tier].bullets,
              ],
              recommended: item.tier === 'profesional',
              current: plan?.name === item.name,
            }
            const price = yearly ? Math.round((p.price * 10) / 12) : p.price
            const dark = Boolean(p.recommended)
            return (
              <article
                key={p.name}
                className={`relative flex flex-col overflow-hidden rounded-card px-6 pb-6 pt-6 ${
                  dark
                    ? 'bg-brand-950 text-on-forest shadow-lg'
                    : 'border border-edge bg-surface shadow-sm'
                }`}
              >
                {dark ? (
                  <>
                    <Texture tone="forest" />
                    <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-gold-500" />
                  </>
                ) : null}
                <div className="relative flex items-center justify-between gap-2">
                  <h3 className="text-[18px] font-semibold">{p.name}</h3>
                  {p.current ? (
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${dark ? 'bg-white/15 text-on-forest' : 'bg-brand-100 text-brand-800'}`}
                    >
                      Tu plan
                    </span>
                  ) : dark ? (
                    <span className="rounded-full bg-gold-500 px-2.5 py-0.5 text-[11px] font-bold text-brand-950">
                      Recomendado
                    </span>
                  ) : null}
                </div>
                <div className="relative mt-3 flex flex-wrap items-baseline gap-x-1.5">
                  <span className="whitespace-nowrap font-display text-[30px] font-bold tracking-[-0.03em] xl:text-[34px]">
                    RD$ {whole(price)}
                  </span>
                  <span className={`text-[13px] ${dark ? 'text-brand-200' : 'text-muted'}`}>
                    / mes
                  </span>
                </div>
                <p className={`relative text-[13px] ${dark ? 'text-brand-200' : 'text-muted'}`}>
                  {yearly ? `Pago anual de RD$ ${whole(p.price * 10)} · ` : ''}
                  {p.pitch}
                </p>
                <ul
                  className={`relative mt-4 flex-1 space-y-2.5 border-t pt-4 text-[13.5px] ${
                    dark ? 'border-white/10' : 'border-edge'
                  }`}
                >
                  {p.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5">
                      <span
                        className={dark ? 'mt-0.5 text-forest-accent' : 'mt-0.5 text-brand-700'}
                      >
                        <CheckIcon />
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>
                <a
                  href={mailto(p.name, yearly)}
                  className={`relative mt-6 ${
                    dark
                      ? 'press press-down flex h-11 items-center justify-center rounded-control bg-forest-accent text-[14px] font-semibold text-on-forest-accent hover:brightness-105'
                      : buttonClass('secondary', 'w-full !h-11')
                  }`}
                >
                  {dark ? `Activar ${p.name}` : `Elegir ${p.name}`}
                </a>
              </article>
            )
          })}
        </div>
      </section>

      <section className="flex items-start gap-4 rounded-card border border-edge bg-surface px-5 py-4 shadow-sm">
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-brand-50 text-brand-700"
        >
          <BankIcon />
        </span>
        <div>
          <h2 className="text-[15px] font-semibold">¿Cómo activo o renuevo mi suscripción?</h2>
          <p className="mt-1 text-[13.5px] text-muted">
            Por ahora el pago es por transferencia o depósito. Escríbenos a{' '}
            <a
              href="mailto:hola@cobradia.com?subject=Suscripci%C3%B3n%20de%20Cobrad%C3%ADa"
              className="font-semibold text-brand-700 hover:underline"
            >
              hola@cobradia.com
            </a>{' '}
            y te enviamos los datos bancarios; al confirmar tu pago, activamos la cuenta el mismo
            día.
          </p>
        </div>
      </section>
    </>
  )
}
