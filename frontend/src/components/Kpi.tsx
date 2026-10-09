import { Link } from '@tanstack/react-router'
import { type ReactNode, useId, useState } from 'react'

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
  const amount = typeof value === 'string' && value.startsWith('RD$ ') ? value.slice(4) : null
  return (
    <div className="relative min-w-0 rounded-xl border border-edge bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[12.5px] text-muted">
          {to ? (
            <Link to={to} className="hover:underline">
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
            className="grid size-5 shrink-0 place-items-center rounded-full border border-edge text-[11px] font-bold text-muted hover:bg-surface-2"
          >
            ?
          </button>
        ) : null}
      </div>
      <div
        className={`whitespace-nowrap font-display text-base font-bold tabular-nums min-[400px]:text-lg sm:text-xl ${color}`}
      >
        {amount !== null ? (
          <>
            <span className="mr-1 text-[0.7em] font-semibold opacity-80">RD$</span>
            {amount}
          </>
        ) : (
          value
        )}
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
