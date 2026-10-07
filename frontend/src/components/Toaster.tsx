import { useSyncExternalStore } from 'react'

/** Short notices that do not belong to one form: an action that failed
 * without an inline place to say so, mostly. Lives outside React so the
 * query client can raise them. */

interface Toast {
  id: number
  tone: 'danger' | 'success'
  text: string
}

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function dismiss(id: number) {
  toasts = toasts.filter((toast) => toast.id !== id)
  emit()
}

export function notify(text: string, tone: Toast['tone'] = 'danger') {
  const id = nextId++
  // The same message twice in a row (a double click) shows once.
  toasts = [...toasts.filter((toast) => toast.text !== text), { id, tone, text }].slice(-3)
  emit()
  setTimeout(() => dismiss(id), 6000)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const TONES = {
  danger: 'border-danger-600/30 bg-surface text-danger-600',
  success: 'border-success-600/30 bg-surface text-success-600',
}

export function Toaster() {
  const current = useSyncExternalStore(subscribe, () => toasts)
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
