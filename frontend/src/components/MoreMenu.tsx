import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

import { buttonClass } from './classes'
import { ChevronDownIcon } from './icons'

export interface MoreItem {
  label: string
  onSelect: () => void
  danger?: boolean
  icon?: ReactNode
}

/** «Más»: the secondary actions of a screen header (doc 07 - section 2).
 * A disclosure menu: Esc or a click outside closes it. */
export function MoreMenu({
  items,
  compact = false,
}: {
  items: MoreItem[]
  /** A square «⋯» button instead of «Más» (decision 114). */
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  if (!items.length) return null
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        aria-label={compact ? 'Más acciones' : undefined}
        title={compact ? 'Más acciones' : undefined}
        className={buttonClass('secondary', compact ? 'w-11 px-0 sm:w-10' : '')}
      >
        {compact ? (
          <span aria-hidden className="text-lg leading-none tracking-[0.08em]">
            ⋯
          </span>
        ) : (
          <>
            Más
            <ChevronDownIcon className="-mr-1 size-4 shrink-0 text-muted" />
          </>
        )}
      </button>
      {open ? (
        <ul
          id={id}
          className="absolute right-0 z-40 mt-2 min-w-56 animate-pop overflow-hidden rounded-xl border border-edge bg-surface p-1.5 shadow-lg"
        >
          {items.map((item) => (
            <li key={item.label}>
              <button
                type="button"
                className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-brand-50 ${
                  item.danger ? 'text-danger-600' : ''
                }`}
                onClick={() => {
                  setOpen(false)
                  item.onSelect()
                }}
              >
                {item.icon ? (
                  <span className={item.danger ? '' : 'text-muted'}>{item.icon}</span>
                ) : null}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
