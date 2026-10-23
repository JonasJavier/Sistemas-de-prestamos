import { useMutation } from '@tanstack/react-query'
import { useId, useState } from 'react'

import { authErrorCode, reauthenticate, reauthenticateWithCode } from '../../api/auth'
import { Modal } from '../../components/Modal'
import { ShieldIcon } from '../../components/icons'
import { Alert, Button, Field, Input, PasswordInput } from '../../components/ui'

/** Asks for the password again (or the app's code, for whoever has no
 * password); onDone(true) once allauth accepts it. */
export function ConfirmIdentityDialog({
  methods,
  onDone,
}: {
  methods: { password: boolean; code: boolean }
  onDone: (confirmed: boolean) => void
}) {
  const [withCode, setWithCode] = useState(!methods.password)
  const [secret, setSecret] = useState('')
  const titleId = useId()
  const confirm = useMutation({
    meta: { inlineError: true },
    mutationFn: () => (withCode ? reauthenticateWithCode(secret.trim()) : reauthenticate(secret)),
    onSuccess: () => onDone(true),
  })
  const code = authErrorCode(confirm.error)
  return (
    <Modal onClose={() => onDone(false)} labelledBy={titleId}>
      <form
        className="w-full max-w-md space-y-4 rounded-2xl border border-edge bg-surface p-6 shadow-xl"
        onSubmit={(event) => {
          event.preventDefault()
          if (secret) confirm.mutate()
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
              Por seguridad, este paso lo pide cuando entraste hace más de 5 minutos.
            </p>
          </div>
        </div>
        {withCode ? (
          <Field label="Código de tu app autenticadora">
            <Input
              autoFocus
              autoComplete="one-time-code"
              inputMode="numeric"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              className="text-center font-mono text-lg tracking-[0.3em]"
            />
          </Field>
        ) : (
          <Field label="Tu contraseña">
            <PasswordInput
              autoFocus
              autoComplete="current-password"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
            />
          </Field>
        )}
        {methods.password && methods.code ? (
          <button
            type="button"
            className="text-[13px] font-medium text-brand-700 hover:underline"
            onClick={() => {
              setWithCode((value) => !value)
              setSecret('')
              confirm.reset()
            }}
          >
            {withCode ? 'Usar mi contraseña' : 'Usar el código de mi app'}
          </button>
        ) : null}
        {confirm.error ? (
          <Alert tone="danger">
            {code === 'incorrect_password'
              ? 'La contraseña no es correcta.'
              : code === 'incorrect_code'
                ? 'Ese código no es correcto. Escribe el que muestra tu app ahora.'
                : code === 'too_many_login_attempts' || code === 'rate_limited'
                  ? 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.'
                  : 'No se pudo confirmar. Intenta de nuevo.'}
          </Alert>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onDone(false)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!secret || confirm.isPending}>
            {confirm.isPending ? 'Confirmando…' : 'Confirmar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
