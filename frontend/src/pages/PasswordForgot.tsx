import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { authErrorMessage, requestPasswordReset } from '../api/auth'
import { Alert, Button, Card, Field, Input, PublicPage } from '../components/ui'

const schema = z.object({ email: z.email('Escribe un correo válido.') })

type FormData = z.infer<typeof schema>

export function PasswordForgotPage() {
  const form = useForm<FormData>({ resolver: zodResolver(schema) })
  const mutation = useMutation({
    meta: { inlineError: true },
    mutationFn: (data: FormData) => requestPasswordReset(data.email),
  })

  return (
    <PublicPage subtitle="Recupera el acceso a tu cuenta">
      <Card>
        {mutation.isSuccess ? (
          <div className="space-y-4">
            <Alert tone="success">
              Si <strong>{form.getValues('email')}</strong> tiene una cuenta, en unos minutos le
              llegará un enlace para crear una contraseña nueva. Revisa también el correo no
              deseado.
            </Alert>
            <p className="text-sm text-muted">El enlace sirve una sola vez.</p>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
            noValidate
          >
            <p className="text-sm text-muted">
              Escribe el correo con el que entras y te enviaremos un enlace para crear una
              contraseña nueva.
            </p>
            {mutation.isError ? (
              <Alert tone="danger">
                {authErrorMessage(mutation.error, 'No se pudo enviar el enlace. Intenta de nuevo.')}
              </Alert>
            ) : null}
            <Field label="Correo" error={form.formState.errors.email?.message}>
              <Input type="email" autoComplete="email" autoFocus {...form.register('email')} />
            </Field>
            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? 'Enviando…' : 'Enviarme el enlace'}
            </Button>
          </form>
        )}
      </Card>
      <p className="text-center text-sm text-muted">
        <Link to="/entrar" className="font-medium text-brand-700 hover:underline">
          Volver a iniciar sesión
        </Link>
      </p>
    </PublicPage>
  )
}
