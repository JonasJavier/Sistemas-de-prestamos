import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useRouter, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import {
  authErrorCode,
  continueWithGoogle,
  login,
  mfaAuthenticate,
  rememberChoice,
  trustThisBrowser,
  type LoginResult,
} from '../api/auth'
import { ApiError } from '../api/client'
import { GoogleButton, OrDivider } from '../components/GoogleButton'
import { ArrowRightIcon } from '../components/icons'
import { Alert, Button, Card, Field, Input, PasswordInput, PublicPage } from '../components/ui'
import { useGoogleEnabled } from '../lib/google'
import { safeReturn } from '../lib/navigation'
import { keepsSession, lastEmail, saveKeepsSession, saveLastEmail } from '../lib/signInPrefs'

const schema = z.object({
  email: z.email('Escribe un correo válido.'),
  password: z.string().min(1, 'Escribe tu contraseña.'),
})

type FormData = z.infer<typeof schema>

export interface LoginSearch {
  /** «sesion»: the API answered 401 inside the app (idle or 12-hour limit);
   * «horario»: a cashier or collector outside the branch hours (decision 035). */
  motivo?: 'sesion' | 'horario'
  /** Where the user was when the session closed: back there after signing in. */
  desde?: string
  /** Back from Google with the 2FA code still to type (decision 118). */
  paso?: 'codigo'
  /** Back from Google with a problem: allauth's error code. */
  google?: string
}

/** Google's answers, in the words of this screen. */
function googleProblem(code: string) {
  if (code === 'cancelled') return 'Cancelaste la entrada con Google. Puedes intentarlo otra vez.'
  if (code === 'signup_closed' || code === 'permission_denied')
    return 'Esa cuenta de Google no tiene acceso a Cobradía.'
  return 'No se pudo entrar con Google. Intenta de nuevo o usa tu correo y contraseña.'
}

export function LoginPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const router = useRouter()
  const { motivo, desde, paso, google } = useSearch({ from: '/entrar' })
  const googleEnabled = useGoogleEnabled()
  const [message, setMessage] = useState<string | null>(google ? googleProblem(google) : null)
  const [totpStep, setTotpStep] = useState(paso === 'codigo')
  const [code, setCode] = useState('')
  const [keep, setKeep] = useState(keepsSession)
  const [trust, setTrust] = useState(keepsSession)
  const [leaving, setLeaving] = useState(false)
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: lastEmail(), password: '' },
  })
  const remembered = form.getValues('email') !== ''

  const finish = async () => {
    // Drop the anonymous session cached when /entrar loaded: invalidating
    // is not enough, because the route guard reads the cache (ensureQueryData)
    // and would bounce back here with the stale «no session».
    queryClient.clear()
    const back = safeReturn(desde)
    if (back) router.history.push(back)
    else navigate({ to: '/' })
  }

  const next = async (result: LoginResult) => {
    if (result.user) return finish()
    if (result.pendingFlow === 'verify_email') {
      setMessage('Tu correo aún no está confirmado. Busca el enlace que te enviamos.')
    } else if (result.pendingFlow === 'mfa_authenticate') {
      setMessage(null)
      // A device kept signed in is a personal one: trusting it is the default.
      setTrust(keep)
      setTotpStep(true)
    } else if (result.pendingFlow === 'mfa_trust') {
      return next(await trustThisBrowser(trust))
    } else {
      setMessage('Falta un paso de verificación adicional.')
    }
  }

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      saveKeepsSession(keep)
      await rememberChoice(keep)
      const result = await login(data.email, data.password)
      saveLastEmail(data.email)
      return result
    },
    onSuccess: next,
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
    onSuccess: next,
    onError: () =>
      setMessage('Código incorrecto. Usa el código vigente de tu app o uno de respaldo.'),
  })

  const withGoogle = async () => {
    setLeaving(true)
    try {
      saveKeepsSession(keep)
      await rememberChoice(keep)
      await continueWithGoogle({ kind: 'login', desde: safeReturn(desde) ?? undefined })
    } catch {
      setLeaving(false)
      setMessage('No se pudo abrir Google. Intenta de nuevo.')
    }
  }

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
                inputMode="numeric"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="text-center font-mono text-lg tracking-[0.3em] sm:h-11"
              />
            </Field>
            <p className="text-[12.5px] text-muted">
              ¿Perdiste el celular? Escribe uno de tus códigos de respaldo; cada uno sirve una vez.
            </p>
            <CheckRow
              checked={trust}
              onChange={setTrust}
              label="Confiar en este dispositivo por 30 días"
              hint="No volveremos a pedirte el código aquí. No lo marques en una computadora compartida."
            />
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
    <PublicPage tab="entrar" subtitle="Hola de nuevo" lead="Inicia sesión para trabajar.">
      {message ? (
        <Alert tone="warning">{message}</Alert>
      ) : motivo === 'sesion' ? (
        <Alert tone="info">Tu sesión se cerró por seguridad. Vuelve a entrar para seguir.</Alert>
      ) : motivo === 'horario' ? (
        <Alert tone="info">
          Estás fuera del horario de tu sucursal. Si necesitas seguir trabajando, pídele una
          extensión a tu supervisor.
        </Alert>
      ) : null}
      {googleEnabled ? (
        <>
          <GoogleButton onClick={withGoogle} busy={leaving}>
            Continuar con Google
          </GoogleButton>
          <OrDivider>o con tu correo</OrDivider>
        </>
      ) : null}
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
        noValidate
      >
        <Field label="Correo" error={form.formState.errors.email?.message}>
          <Input
            type="email"
            autoComplete="username"
            autoFocus={!remembered}
            className="sm:h-11"
            {...form.register('email')}
          />
        </Field>
        <Field
          label="Contraseña"
          error={form.formState.errors.password?.message}
          aside={
            <Link to="/recuperar" className="font-semibold text-brand-700 hover:underline">
              ¿Olvidaste tu contraseña?
            </Link>
          }
        >
          <PasswordInput
            autoComplete="current-password"
            autoFocus={remembered}
            className="sm:h-11"
            {...form.register('password')}
          />
        </Field>
        <CheckRow
          checked={keep}
          onChange={setKeep}
          label="Mantenerme conectado"
          hint="Hasta 30 días en este dispositivo. No lo marques en una computadora compartida."
        />
        <Button type="submit" className="w-full sm:h-11" disabled={mutation.isPending}>
          {mutation.isPending ? 'Entrando…' : 'Entrar'}
          {mutation.isPending ? null : <ArrowRightIcon />}
        </Button>
      </form>
      <p className="text-center text-[13.5px] text-muted">
        ¿Tu financiera aún no usa Cobradía?{' '}
        <Link to="/registro" className="font-semibold text-brand-700 hover:underline">
          Pruébala gratis
        </Link>
      </p>
    </PublicPage>
  )
}

function CheckRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  hint: string
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        className="mt-0.5 size-4 shrink-0"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="space-y-0.5">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-[12.5px] leading-snug text-muted">{hint}</span>
      </span>
    </label>
  )
}
