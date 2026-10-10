import { useSyncExternalStore } from 'react'

import { dismiss, getToasts, subscribe } from '../lib/toast'
import { AlertIcon, CheckCircleIcon } from './icons'

/** Renders the notices of lib/toast. */

const TONES = {
  danger: { icon: 'text-danger-600', Icon: AlertIcon },
  success: { icon: 'text-success-600', Icon: CheckCircleIcon },
}

export function Toaster() {
  const current = useSyncExternalStore(subscribe, getToasts)
  if (current.length === 0) return null
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-20 z-[60] flex flex-col items-end gap-2 sm:bottom-5 sm:left-auto sm:right-5">
      {current.map((toast) => {
        const { icon, Icon } = TONES[toast.tone]
        return (
          <div
            key={toast.id}
            role={toast.tone === 'danger' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full max-w-sm animate-pop items-start gap-3 rounded-xl border border-edge bg-surface px-4 py-3 text-sm text-ink shadow-lg"
          >
            <span className={`mt-px ${icon}`}>
              <Icon />
            </span>
            <span className="flex-1 leading-relaxed">{toast.text}</span>
            <button
              type="button"
              aria-label="Cerrar aviso"
              className="-mr-1 grid size-6 shrink-0 place-items-center rounded-md text-base leading-none text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              onClick={() => dismiss(toast.id)}
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
