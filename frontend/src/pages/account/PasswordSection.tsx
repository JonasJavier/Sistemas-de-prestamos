import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'

import { changePassword } from '../../api/auth'
import { ApiError } from '../../api/client'
import { CheckIcon } from '../../components/icons'
import { Alert, Button, Field, PasswordInput } from '../../components/ui'
import { errorMessage } from '../../lib/format'
import { notify } from '../../lib/toast'
import { Panel } from './Panel'

const MIN_LENGTH = 12

/** allauth speaks «usted»; every other screen speaks «tú». */
function passwordError(data: unknown) {
  const code = (data as { errors?: { code?: string }[] } | null)?.errors?.[0]?.code
  return code === 'enter_current_password'
    ? 'La contraseña actual no es correcta.'
    : errorMessage(data)
}

/** Mi cuenta › Contraseña (decisions 108 and 117). */
export function PasswordSection() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const change = useMutation({
    meta: { inlineError: true },
    mutationFn: () => changePassword(current, next),
    onSuccess: () => {
      setCurrent('')
      setNext('')
      setRepeat('')
      notify('Contraseña cambiada. Úsala la próxima vez que entres.', 'success')
    },
  })
  const longEnough = next.length >= MIN_LENGTH
  const matches = next !== '' && repeat === next
  const ready = current !== '' && longEnough && matches

  return (
    <>
      <Panel
        title="Cambiar contraseña"
        description="Escribe la que usas ahora y luego la nueva. Tu sesión sigue abierta."
        onSubmit={() => {
          if (ready) change.mutate()
        }}
        footer={
          <Button type="submit" disabled={!ready || change.isPending}>
            {change.isPending ? 'Cambiando…' : 'Cambiar contraseña'}
          </Button>
        }
      >
        <div className="max-w-md space-y-4">
          <Field label="Contraseña actual">
            <PasswordInput
              autoComplete="current-password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
            />
          </Field>
          <Field label="Nueva contraseña">
            <PasswordInput
              autoComplete="new-password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
            />
          </Field>
          <Field
            label="Repite la nueva"
            error={repeat !== '' && repeat !== next ? 'No coincide con la nueva.' : undefined}
          >
            <PasswordInput
              autoComplete="new-password"
              value={repeat}
              onChange={(event) => setRepeat(event.target.value)}
            />
          </Field>
          <ul className="space-y-1.5 text-[13px]" aria-label="Requisitos">
            <Requirement met={longEnough}>Al menos {MIN_LENGTH} caracteres</Requirement>
            <Requirement met={matches}>Las dos nuevas coinciden</Requirement>
            <li className="pl-7 text-[12.5px] text-muted">
              Evita tu nombre, tu correo y contraseñas comunes como «123456789012».
            </li>
          </ul>
        </div>
        {change.error instanceof ApiError ? (
          <Alert tone="danger">{passwordError(change.error.data)}</Alert>
        ) : null}
      </Panel>

      <Panel
        title="¿Crees que alguien más la conoce?"
        description={
          <>
            Cámbiala aquí y luego cierra los dispositivos que no reconozcas en{' '}
            <Link to="/cuenta/sesiones" className="font-medium text-brand-700 hover:underline">
              Sesiones abiertas
            </Link>
            .
          </>
        }
      />
    </>
  )
}

function Requirement({ met, children }: { met: boolean; children: ReactNode }) {
  return (
    <li className={`flex items-center gap-2 ${met ? 'text-success-600' : 'text-muted'}`}>
      <span
        aria-hidden
        className={`grid size-5 place-items-center rounded-full ${
          met ? 'bg-success-600/10' : 'ring-1 ring-inset ring-edge'
        }`}
      >
        {met ? <CheckIcon className="size-3.5" /> : null}
      </span>
      {children}
      <span className="sr-only">{met ? '(cumplido)' : '(pendiente)'}</span>
    </li>
  )
}
