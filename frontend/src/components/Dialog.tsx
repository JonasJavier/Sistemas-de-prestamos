import { useCallback, useEffect, useId, useState, type ReactNode } from 'react'

import { Button, Field, Input, Textarea } from './ui'

export interface PromptOptions {
  title: string
  label: string
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

function PromptDialog({
  options,
  onClose,
}: {
  options: PromptOptions
  onClose: (value: string | null) => void
}) {
  const { title, label, description, initial = '', type = 'text', required, danger } = options
  const [value, setValue] = useState(initial)
  const titleId = useId()
  const blocked = Boolean(required) && !value.trim()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4"
      onClick={() => onClose(null)}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md space-y-4 rounded-xl border border-edge bg-surface p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          if (!blocked) onClose(value.trim())
        }}
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        {description ? <div className="text-sm text-muted">{description}</div> : null}
        <Field label={label}>
          {type === 'textarea' ? (
            <Textarea autoFocus value={value} onChange={(event) => setValue(event.target.value)} />
          ) : (
            <Input
              autoFocus
              type={type}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          )}
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onClose(null)}>
            Cancelar
          </Button>
          <Button type="submit" variant={danger ? 'danger' : 'primary'} disabled={blocked}>
            {options.confirmText ?? 'Aceptar'}
          </Button>
        </div>
      </form>
    </div>
  )
}
