import { useSyncExternalStore } from 'react'

import { dismiss, getToasts, subscribe } from '../lib/toast'

/** Renders the notices of lib/toast. */

const TONES = {
  danger: 'border-danger-600/30 bg-surface text-danger-600',
  success: 'border-success-600/30 bg-surface text-success-600',
}

export function Toaster() {
  const current = useSyncExternalStore(subscribe, getToasts)
  if (current.length === 0) return null
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-20 z-[60] flex flex-col items-end gap-2 sm:bottom-4 sm:left-auto">
      {current.map((toast) => (
        <div
          key={toast.id}
          role={toast.tone === 'danger' ? 'alert' : 'status'}
          className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${TONES[toast.tone]}`}
        >
          <span className="flex-1">{toast.text}</span>
          <button
            type="button"
            aria-label="Cerrar aviso"
            className="text-muted hover:text-ink"
            onClick={() => dismiss(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
