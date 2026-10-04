import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { login } from '../api/auth'
import { ApiError } from '../api/client'
import { Alert, Brand, Button, Card, Field, Input } from '../components/ui'

const schema = z.object({
  email: z.email('Escribe un correo válido.'),
  password: z.string().min(1, 'Escribe tu contraseña.'),
})

type FormData = z.infer<typeof schema>

export function LoginPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [message, setMessage] = useState<string | null>(null)
  const form = useForm<FormData>({ resolver: zodResolver(schema) })

  const mutation = useMutation({
    mutationFn: (data: FormData) => login(data.email, data.password),
    onSuccess: async (result) => {
      if (result.user) {
        await queryClient.invalidateQueries({ queryKey: ['session'] })
        navigate({ to: '/' })
        return
      }
      if (result.pendingFlow === 'verify_email') {
        setMessage('Tu correo aún no está confirmado. Busca el enlace que te enviamos.')
      } else if (result.pendingFlow) {
        setMessage('Falta un paso de verificación adicional (próximamente en esta pantalla).')
      }
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 400) {
        setMessage('Correo o contraseña incorrectos.')
      } else {
        setMessage('No se pudo iniciar sesión. Intenta de nuevo.')
      }
    },
  })

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Brand />
          <p className="mt-1 text-sm text-muted">Inicia sesión para trabajar</p>
        </div>
        <Card>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
            noValidate
          >
            {message ? <Alert tone="warning">{message}</Alert> : null}
            <Field label="Correo" error={form.formState.errors.email?.message}>
              <Input type="email" autoComplete="email" autoFocus {...form.register('email')} />
            </Field>
            <Field label="Contraseña" error={form.formState.errors.password?.message}>
              <Input
                type="password"
                autoComplete="current-password"
                {...form.register('password')}
              />
            </Field>
            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>
        </Card>
        <p className="text-center text-sm text-muted">
          ¿Tu financiera aún no usa Cobradía?{' '}
          <Link to="/registro" className="font-medium text-brand-700 hover:underline">
            Pruébala gratis
          </Link>
        </p>
      </div>
    </main>
  )
}
