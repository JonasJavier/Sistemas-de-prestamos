import { Link } from '@tanstack/react-router'

import type { Me } from '../api/accounts'
import { buttonClass } from './classes'
import { CheckIcon, LockIcon } from './icons'
import { FEATURES, PLAN_PITCH, TIER_LABELS, type FeatureKey } from '../lib/plan'

/** A screen the company's plan does not include (decision 124): what it is,
 * which plan brings it, and the way to it. */
export function PlanUpsell({ me, feature }: { me: Me; feature: FeatureKey }) {
  const { label, tier } = FEATURES[feature]
  const pitch = PLAN_PITCH[tier]
  const current = me.plan_tier ? TIER_LABELS[me.plan_tier] : null
  return (
    <section className="mx-auto max-w-2xl space-y-5 rounded-card border border-edge bg-surface p-6 shadow-sm sm:p-8">
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-800">
          <LockIcon />
        </span>
        <div className="space-y-1">
          <p className="eyebrow">Plan {TIER_LABELS[tier]}</p>
          <h1 className="text-[22px] leading-tight">{label}</h1>
          <p className="text-[13.5px] text-muted">
            {current ? `Tu plan ${current} no la incluye. ` : ''}
            {pitch.pitch}: el plan {TIER_LABELS[tier]} la trae junto con todo esto.
          </p>
        </div>
      </div>
      <ul className="grid gap-2 text-[13.5px] sm:grid-cols-2">
        {pitch.bullets.map((bullet) => (
          <li key={bullet} className="flex items-start gap-2">
            <span className="mt-0.5 text-brand-700">
              <CheckIcon />
            </span>
            {bullet}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {me.is_manager ? (
          <Link to="/ajustes/suscripcion" className={buttonClass('primary')}>
            Ver los planes
          </Link>
        ) : (
          <p className="text-[13px] text-muted">
            Pídele a tu gerente que cambie el plan en Ajustes · Suscripción.
          </p>
        )}
        <Link to="/" className={buttonClass('secondary')}>
          Ir al inicio
        </Link>
      </div>
    </section>
  )
}
