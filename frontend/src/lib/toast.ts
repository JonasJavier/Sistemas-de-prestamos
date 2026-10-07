/** Short notices that do not belong to one form: an action that failed
 * without an inline place to say so, mostly. Lives outside React so the
 * query client can raise them; components/Toaster renders them. */

export interface Toast {
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

export function dismiss(id: number) {
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

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const getToasts = () => toasts
