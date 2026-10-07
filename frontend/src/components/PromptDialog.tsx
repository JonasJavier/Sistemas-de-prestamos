import { useId, useState } from 'react'

import type { PromptOptions } from './Dialog'
import { Modal } from './Modal'
import { Button, Field, Input, Textarea } from './ui'

export function PromptDialog({
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

  return (
    <Modal onClose={() => onClose(null)} labelledBy={titleId}>
      <form
        className="w-full max-w-md space-y-4 rounded-xl border border-edge bg-surface p-6 shadow-xl"
        onSubmit={(event) => {
          event.preventDefault()
          if (!blocked) onClose(value.trim())
        }}
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        {description ? <div className="text-sm text-muted">{description}</div> : null}
        {label ? (
          <Field label={label}>
            {type === 'textarea' ? (
              <Textarea
                autoFocus
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            ) : (
              <Input
                autoFocus
                type={type}
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            )}
          </Field>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onClose(null)}>
            Cancelar
          </Button>
          <Button type="submit" variant={danger ? 'danger' : 'primary'} disabled={blocked}>
            {options.confirmText ?? 'Aceptar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
