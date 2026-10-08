import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { authErrorCode, login, mfaAuthenticate } from '../api/auth'
import { ApiError } from '../api/client'
import { Alert, Button, Card, Field, Input, PublicPage } from '../components/ui'

const schema = z.object({
  email: z.email('Escribe un correo válido.'),
  password: z.string().min(1, 'Escribe tu contraseña.'),
})

type FormData = z.infer<typeof schema>

export interface LoginSearch {
  /** «sesion»: the API answered 401 inside the app (idle or 12-hour limit);
   * «horario»: a cashier or collector outside the branch hours (decision 035). */
  motivo?: 'sesion' | 'horario'
}

export function LoginPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { motivo } = useSearch({ from: '/entrar' })
  const [message, setMessage] = useState<string | null>(null)
  const [totpStep, setTotpStep] = useState(false)
  const [code, setCode] = useState('')
  const form = useForm<FormData>({ resolver: zodResolver(schema) })

  const finish = async () => {
    // Drop the anonymous session cached when /entrar loaded: invalidating
    // is not enough, because the route guard reads the cache (ensureQueryData)
    // and would bounce back here with the stale «no session».
    queryClient.clear()
    navigate({ to: '/' })
  }

  const mutation = useMutation({
    mutationFn: (data: FormData) => login(data.email, data.password),
    onSuccess: async (result) => {
      if (result.user) {
        await finish()
        return
      }
      if (result.pendingFlow === 'verify_email') {
        setMessage('Tu correo aún no está confirmado. Busca el enlace que te enviamos.')
      } else if (result.pendingFlow === 'mfa_authenticate') {
        setMessage(null)
        setTotpStep(true)
      } else if (result.pendingFlow) {
        setMessage('Falta un paso de verificación adicional.')
      }
    },
    onError: (error) => {
      if (authErrorCode(error) === 'too_many_login_attempts') {
        setMessage(
          'Demasiados intentos fallidos: por seguridad, espera 15 minutos o recupera tu contraseña.',
        )
      } else if (error instanceof ApiError && error.status === 400) {
        setMessage('Correo o contraseña incorrectos.')
      } else {
        setMessage('No se pudo iniciar sesión. Intenta de nuevo.')
      }
    },
  })

  const totpMutation = useMutation({
    mutationFn: () => mfaAuthenticate(code.trim()),
    onSuccess: finish,
    onError: () =>
      setMessage('Código incorrecto. Usa el código vigente de tu app o uno de respaldo.'),
  })

  if (totpStep) {
    return (
      <PublicPage subtitle="Verificación en dos pasos">
        <Card>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              totpMutation.mutate()
            }}
          >
            {message ? <Alert tone="danger">{message}</Alert> : null}
            <Field label="Código de tu app autenticadora">
              <Input
                autoComplete="one-time-code"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </Field>
            <p className="text-[12.5px] text-muted">
              ¿Perdiste el celular? Escribe uno de tus códigos de respaldo; cada uno sirve una vez.
            </p>
            <Button
              type="submit"
              className="w-full"
              disabled={totpMutation.isPending || !code.trim()}
            >
              {totpMutation.isPending ? 'Verificando…' : 'Verificar'}
            </Button>
          </form>
        </Card>
        <p className="text-center text-sm text-muted">
          <button
            type="button"
            className="font-medium text-brand-700 hover:underline"
            onClick={() => {
              setTotpStep(false)
              setCode('')
              setMessage(null)
            }}
          >
            Volver
          </button>
        </p>
      </PublicPage>
    )
  }

  return (
    <PublicPage subtitle="Inicia sesión para trabajar">
      <Card>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
          noValidate
        >
          {message ? (
            <Alert tone="warning">{message}</Alert>
          ) : motivo === 'sesion' ? (
            <Alert tone="info">
              Tu sesión se cerró por seguridad. Vuelve a entrar para seguir.
            </Alert>
          ) : motivo === 'horario' ? (
            <Alert tone="info">
              Estás fuera del horario de tu sucursal. Si necesitas seguir trabajando, pídele una
              extensión a tu supervisor.
            </Alert>
          ) : null}
          <Field label="Correo" error={form.formState.errors.email?.message}>
            <Input type="email" autoComplete="email" autoFocus {...form.register('email')} />
          </Field>
          <Field label="Contraseña" error={form.formState.errors.password?.message}>
            <Input type="password" autoComplete="current-password" {...form.register('password')} />
          </Field>
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? 'Entrando…' : 'Entrar'}
          </Button>
          <p className="text-center text-sm">
            <Link to="/recuperar" className="font-medium text-brand-700 hover:underline">
              ¿Olvidaste tu contraseña?
            </Link>
          </p>
        </form>
      </Card>
      <p className="text-center text-sm text-muted">
        ¿Tu financiera aún no usa Cobradía?{' '}
        <Link to="/registro" className="font-medium text-brand-700 hover:underline">
          Pruébala gratis
        </Link>
      </p>
    </PublicPage>
  )
}
