import { useCallback, useState, type ReactNode } from 'react'

import { PromptDialog } from './PromptDialog'

export interface PromptOptions {
  title: string
  /** Without a label it only confirms: «Aceptar» resolves to ''. */
  label?: string
  description?: ReactNode
  initial?: string
  type?: 'text' | 'date' | 'textarea'
  /** An empty answer cannot be confirmed. */
  required?: boolean
  confirmText?: string
  danger?: boolean
}

type Pending = PromptOptions & { resolve: (value: string | null) => void }

/** The app's own replacement for window.prompt: same look, keyboard and
 * screen-reader friendly. Render `dialog` once; `ask` resolves to the text
 * typed, or null when the user cancels. */
export function usePrompt() {
  const [pending, setPending] = useState<Pending | null>(null)
  const ask = useCallback(
    (options: PromptOptions) =>
      new Promise<string | null>((resolve) => setPending({ ...options, resolve })),
    [],
  )
  const close = useCallback(
    (value: string | null) => {
      pending?.resolve(value)
      setPending(null)
    },
    [pending],
  )
  const dialog = pending ? <PromptDialog options={pending} onClose={close} /> : null
  return [dialog, ask] as const
}
