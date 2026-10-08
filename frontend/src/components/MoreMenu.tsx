import { useEffect, useId, useRef, useState } from 'react'

import { buttonClass } from './classes'

export interface MoreItem {
  label: string
  onSelect: () => void
  danger?: boolean
}

/** «Más»: the secondary actions of a screen header (doc 07 - section 2).
 * A disclosure menu: Esc or a click outside closes it. */
export function MoreMenu({ items }: { items: MoreItem[] }) {
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
        className={buttonClass('secondary')}
      >
        Más ▾
      </button>
      {open ? (
        <ul
          id={id}
          className="absolute right-0 z-40 mt-1 min-w-52 overflow-hidden rounded-lg border border-edge bg-surface py-1 shadow-lg"
        >
          {items.map((item) => (
            <li key={item.label}>
              <button
                type="button"
                className={`block w-full px-4 py-2 text-left text-sm hover:bg-brand-100 ${
                  item.danger ? 'text-danger-600' : ''
                }`}
                onClick={() => {
                  setOpen(false)
                  item.onSelect()
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
