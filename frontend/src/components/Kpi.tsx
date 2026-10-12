import { Link } from '@tanstack/react-router'
import { type ReactNode, useId, useState } from 'react'

import { cardClass } from './classes'
import { Figure } from './ui'

/** One indicator with its exact definition behind a «?» (doc 09 §3, doc 08 §5). */
export function Kpi({
  label,
  value,
  hint,
  help,
  to,
  tone,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  help?: string
  to?: string
  tone?: 'good' | 'bad'
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const color = tone === 'bad' ? 'text-danger-600' : tone === 'good' ? 'text-success-600' : ''
  return (
    <div
      className={`@container relative min-w-0 p-4 transition-shadow duration-200 hover:shadow-md ${cardClass}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[12.5px] font-medium text-muted">
          {to ? (
            <Link to={to} className="transition-colors hover:text-brand-700">
              {label}
            </Link>
          ) : (
            label
          )}
        </div>
        {help ? (
          <button
            type="button"
            aria-label={`Qué es «${label}»`}
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen(!open)}
            className="grid size-5 shrink-0 place-items-center rounded-full border border-edge text-[11px] font-bold text-muted transition-colors hover:border-brand-700/40 hover:text-brand-700"
          >
            ?
          </button>
        ) : null}
      </div>
      <div
        className={`mt-2 whitespace-nowrap font-display font-semibold tracking-[-0.02em] tabular-nums text-sm @min-[9rem]:text-base @min-[11rem]:text-lg @min-[13.5rem]:text-[22px] ${color}`}
      >
        <Figure value={value} />
      </div>
      {hint ? <div className="mt-0.5 text-[12px] text-muted">{hint}</div> : null}
      {help && open ? (
        <p id={id} className="mt-2 border-t border-edge pt-2 text-[12px] text-muted">
          {help}
        </p>
      ) : null}
    </div>
  )
}
