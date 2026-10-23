import { useMutation } from '@tanstack/react-query'
import { useId, useState } from 'react'

import { authErrorCode, reauthenticate } from '../../api/auth'
import { Modal } from '../../components/Modal'
import { ShieldIcon } from '../../components/icons'
import { Alert, Button, Field, PasswordInput } from '../../components/ui'

/** Asks for the password again; onDone(true) once allauth accepts it. */
export function ConfirmIdentityDialog({ onDone }: { onDone: (confirmed: boolean) => void }) {
  const [password, setPassword] = useState('')
  const titleId = useId()
  const confirm = useMutation({
    meta: { inlineError: true },
    mutationFn: () => reauthenticate(password),
    onSuccess: () => onDone(true),
  })
  const code = authErrorCode(confirm.error)
  return (
    <Modal onClose={() => onDone(false)} labelledBy={titleId}>
      <form
        className="w-full max-w-md space-y-4 rounded-2xl border border-edge bg-surface p-6 shadow-xl"
        onSubmit={(event) => {
          event.preventDefault()
          if (password) confirm.mutate()
        }}
      >
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-800">
            <ShieldIcon />
          </span>
          <div className="space-y-1">
            <h2 id={titleId} className="text-lg font-semibold">
              Confirma que eres tú
            </h2>
            <p className="text-sm text-muted">
              Por seguridad, este paso pide tu contraseña cuando entraste hace más de 5 minutos.
            </p>
          </div>
        </div>
        <Field label="Tu contraseña">
          <PasswordInput
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        {confirm.error ? (
          <Alert tone="danger">
            {code === 'incorrect_password'
              ? 'La contraseña no es correcta.'
              : code === 'too_many_login_attempts'
                ? 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.'
                : 'No se pudo confirmar. Intenta de nuevo.'}
          </Alert>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onDone(false)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!password || confirm.isPending}>
            {confirm.isPending ? 'Confirmando…' : 'Confirmar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
