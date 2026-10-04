import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { ApiError } from '../api/client'
import { registerCompany } from '../api/platform'
import { Alert, Brand, Button, Card, Field, Input } from '../components/ui'

const schema = z.object({
  company_legal_name: z.string().min(3, 'Escribe el nombre de tu financiera.'),
  rnc: z.string().optional(),
  first_name: z.string().min(1, 'Escribe tu nombre.'),
  last_name: z.string().min(1, 'Escribe tu apellido.'),
  phone: z.string().optional(),
  email: z.email('Escribe un correo válido.'),
  password: z.string().min(12, 'Mínimo 12 caracteres.'),
})

type FormData = z.infer<typeof schema>

function serverError(error: unknown): string {
  if (error instanceof ApiError && error.status === 400 && error.data) {
    const data = error.data as Record<string, string[]>
    const first = Object.values(data)[0]
    if (Array.isArray(first) && first.length > 0) return first[0]
  }
  if (error instanceof ApiError && error.status === 429) {
    return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.'
  }
  return 'No se pudo completar el registro. Intenta de nuevo.'
}

export function RegisterPage() {
  const [done, setDone] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const form = useForm<FormData>({ resolver: zodResolver(schema) })

  const mutation = useMutation({
    mutationFn: registerCompany,
    onSuccess: () => setDone(true),
    onError: (error) => setMessage(serverError(error)),
  })

  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <Card className="max-w-md space-y-4 text-center">
          <Brand />
          <h1 className="text-xl font-semibold">¡Tu prueba de 30 días empezó!</h1>
          <p className="text-sm text-muted">
            Te enviamos un correo para confirmar tu cuenta. Confírmalo y luego inicia sesión.
          </p>
          <Link to="/entrar" className="font-medium text-brand-700 hover:underline">
            Ir a iniciar sesión
          </Link>
        </Card>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Brand />
          <p className="mt-1 text-sm text-muted">
            Crea la cuenta de tu financiera · 30 días gratis, sin tarjeta
          </p>
        </div>
        <Card>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
            noValidate
          >
            {message ? <Alert tone="danger">{message}</Alert> : null}
            <Field
              label="Nombre de la financiera"
              error={form.formState.errors.company_legal_name?.message}
            >
              <Input autoFocus {...form.register('company_legal_name')} />
            </Field>
            <Field label="RNC (opcional)" error={form.formState.errors.rnc?.message}>
              <Input inputMode="numeric" {...form.register('rnc')} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tu nombre" error={form.formState.errors.first_name?.message}>
                <Input autoComplete="given-name" {...form.register('first_name')} />
              </Field>
              <Field label="Tu apellido" error={form.formState.errors.last_name?.message}>
                <Input autoComplete="family-name" {...form.register('last_name')} />
              </Field>
            </div>
            <Field label="Teléfono (opcional)" error={form.formState.errors.phone?.message}>
              <Input type="tel" autoComplete="tel" {...form.register('phone')} />
            </Field>
            <Field label="Correo" error={form.formState.errors.email?.message}>
              <Input type="email" autoComplete="email" {...form.register('email')} />
            </Field>
            <Field label="Contraseña" error={form.formState.errors.password?.message}>
              <Input
                type="password"
                autoComplete="new-password"
                {...form.register('password')}
              />
            </Field>
            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? 'Creando tu cuenta…' : 'Empezar mi prueba gratis'}
            </Button>
          </form>
        </Card>
        <p className="text-center text-sm text-muted">
          ¿Ya tienes cuenta?{' '}
          <Link to="/entrar" className="font-medium text-brand-700 hover:underline">
            Inicia sesión
          </Link>
        </p>
      </div>
    </main>
  )
}
