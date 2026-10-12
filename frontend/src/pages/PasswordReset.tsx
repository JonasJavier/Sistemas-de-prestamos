import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { authErrorCode, authErrorMessage, resetPassword } from '../api/auth'
import { buttonClass } from '../components/classes'
import { Alert, Button, Card, Field, Input, Outcome, PublicPage } from '../components/ui'

const schema = z
  .object({
    password: z.string().min(12, 'Mínimo 12 caracteres.'),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    path: ['confirm'],
    message: 'Las dos contraseñas no coinciden.',
  })

type FormData = z.infer<typeof schema>

export function PasswordResetPage() {
  const { key } = useParams({ from: '/recuperar/$key' })
  const form = useForm<FormData>({ resolver: zodResolver(schema) })
  const mutation = useMutation({
    meta: { inlineError: true },
    mutationFn: (data: FormData) => resetPassword(key, data.password),
  })
  const badKey = mutation.isError && authErrorCode(mutation.error) === 'invalid_password_reset'

  return (
    <PublicPage subtitle="Crea tu contraseña nueva">
      <Card>
        {mutation.isSuccess ? (
          <div className="space-y-4">
            <Outcome tone="success" title="Listo: tu contraseña cambió">
              Entra con tu correo y la contraseña nueva.
            </Outcome>
            <Link to="/entrar" className={buttonClass('primary', 'w-full')}>
              Iniciar sesión
            </Link>
          </div>
        ) : badKey ? (
          <div className="space-y-4">
            <Outcome tone="danger" title="El enlace no sirve">
              No es válido o ya se usó. Pide otro: llega en un minuto.
            </Outcome>
            <Link to="/recuperar" className={buttonClass('primary', 'w-full')}>
              Pedir un enlace nuevo
            </Link>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
            noValidate
          >
            {mutation.isError ? (
              <Alert tone="danger">
                {authErrorMessage(mutation.error, 'No se pudo cambiar la contraseña.')}
              </Alert>
            ) : null}
            <Field label="Contraseña nueva" error={form.formState.errors.password?.message}>
              <Input
                type="password"
                autoComplete="new-password"
                autoFocus
                {...form.register('password')}
              />
            </Field>
            <Field label="Repítela" error={form.formState.errors.confirm?.message}>
              <Input type="password" autoComplete="new-password" {...form.register('confirm')} />
            </Field>
            <p className="text-[12.5px] text-muted">
              Al menos 12 caracteres; evita tu nombre, tu correo y contraseñas comunes.
            </p>
            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando…' : 'Guardar contraseña'}
            </Button>
          </form>
        )}
      </Card>
    </PublicPage>
  )
}
