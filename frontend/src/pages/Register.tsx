import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm, type UseFormRegisterReturn } from 'react-hook-form'
import { z } from 'zod'
import { errorMessage } from '../lib/format'

import {
  authErrorMessage,
  completeGoogleSignup,
  continueWithGoogle,
  getGoogleSignup,
} from '../api/auth'
import { ApiError } from '../api/client'
import { registerCompany } from '../api/platform'
import { buttonClass } from '../components/classes'
import { GoogleButton, OrDivider } from '../components/GoogleButton'
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  Outcome,
  PasswordInput,
  PublicPage,
  Spinner,
} from '../components/ui'
import { useGoogleEnabled } from '../lib/google'

const schema = z.object({
  company_legal_name: z.string().min(3, 'Escribe el nombre de tu financiera.'),
  rnc: z.string().optional(),
  first_name: z.string().min(1, 'Escribe tu nombre.'),
  last_name: z.string().min(1, 'Escribe tu apellido.'),
  phone: z.string().optional(),
  email: z.email('Escribe un correo válido.'),
  password: z.string().min(12, 'Mínimo 12 caracteres.'),
  accept_terms: z.literal(true, {
    error: 'Acepta los términos de servicio y el aviso de privacidad.',
  }),
})

type FormData = z.infer<typeof schema>

/** The promotion site, where the terms and the privacy notice live. */
const SITE_URL = 'https://cobradia.com'

function serverError(error: unknown): string {
  if (error instanceof ApiError && error.status === 429) {
    return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.'
  }
  if (error instanceof ApiError && error.status === 400) {
    return errorMessage(error.data, 'Revisa los datos del formulario.')
  }
  return 'No se pudo completar el registro. Intenta de nuevo.'
}

export interface RegisterGoogleSearch {
  /** Came from «Continuar con Google» at /entrar with an address that has no account. */
  sin_cuenta?: boolean
}

export function RegisterPage() {
  const [done, setDone] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)
  const googleEnabled = useGoogleEnabled()
  const form = useForm<FormData>({ resolver: zodResolver(schema) })

  const mutation = useMutation({
    mutationFn: registerCompany,
    onSuccess: () => setDone(true),
    onError: (error) => setMessage(serverError(error)),
  })

  if (done) {
    return (
      <PublicPage>
        <Card className="space-y-4 text-center">
          <Outcome tone="success" title="¡Tu prueba de 30 días empezó!">
            Te enviamos un correo para confirmar tu cuenta. Confírmalo y luego inicia sesión.
          </Outcome>
          <Link to="/entrar" className={buttonClass('primary', 'w-full')}>
            Ir a iniciar sesión
          </Link>
        </Card>
      </PublicPage>
    )
  }

  return (
    <PublicPage
      tab="registro"
      subtitle="Crea la cuenta de tu financiera"
      lead={
        <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-gold-100 px-3 py-1 text-[12.5px] font-semibold text-gold-800 ring-1 ring-inset ring-gold-500/30">
          ★ 30 días gratis · sin tarjeta
        </span>
      }
    >
      {googleEnabled ? (
        <>
          <GoogleButton
            busy={leaving}
            onClick={() => {
              setLeaving(true)
              continueWithGoogle({ kind: 'register' }).catch(() => {
                setLeaving(false)
                setMessage('No se pudo abrir Google. Intenta de nuevo.')
              })
            }}
          >
            Registrarme con Google
          </GoogleButton>
          <p className="-mt-2 text-center text-[12.5px] text-muted">
            Sin contraseña nueva ni código por correo: Google ya confirmó tu dirección.
          </p>
          <OrDivider>o con tu correo</OrDivider>
        </>
      ) : null}
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
          <Field
            label="Contraseña"
            error={form.formState.errors.password?.message}
            hint="Al menos 12 caracteres."
          >
            <PasswordInput autoComplete="new-password" {...form.register('password')} />
          </Field>
          <TermsCheck
            field={form.register('accept_terms')}
            error={form.formState.errors.accept_terms?.message}
          />
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
    </PublicPage>
  )
}

/** Decision 103: the accepted version is recorded with the company. */
function TermsCheck({ field, error }: { field: UseFormRegisterReturn; error?: string }) {
  return (
    <div className="space-y-1">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1 size-4 accent-brand-700" {...field} />
        <span>
          Acepto los{' '}
          <a
            href={`${SITE_URL}/terminos`}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-brand-700 hover:underline"
          >
            términos de servicio
          </a>{' '}
          y el{' '}
          <a
            href={`${SITE_URL}/privacidad`}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-brand-700 hover:underline"
          >
            aviso de privacidad
          </a>
          .
        </span>
      </label>
      {error ? <span className="block text-[12.5px] text-danger-600">{error}</span> : null}
    </div>
  )
}

const googleSchema = z.object({
  company_legal_name: z.string().min(3, 'Escribe el nombre de tu financiera.'),
  rnc: z.string().optional(),
  first_name: z.string().min(1, 'Escribe tu nombre.'),
  last_name: z.string().min(1, 'Escribe tu apellido.'),
  phone: z.string().optional(),
  accept_terms: z.literal(true, {
    error: 'Acepta los términos de servicio y el aviso de privacidad.',
  }),
})

type GoogleFormData = z.infer<typeof googleSchema>

/** Decision 118: the company signup after «Registrarme con Google». The
 * address is the one Google verified, so there is no password and no code. */
export function GoogleRegisterPage() {
  const { sin_cuenta } = useSearch({ from: '/registro/google' })
  const signup = useQuery({ queryKey: ['google-signup'], queryFn: getGoogleSignup, retry: false })

  if (signup.isPending) {
    return (
      <PublicPage subtitle="Crea la cuenta de tu financiera">
        <Spinner />
      </PublicPage>
    )
  }
  if (signup.isError) {
    return (
      <PublicPage>
        <Card className="space-y-4 text-center">
          <Outcome tone="warning" title="Vuelve a empezar">
            Pasó demasiado tiempo desde que elegiste tu cuenta de Google. Inténtalo otra vez.
          </Outcome>
          <Link to="/registro" className={buttonClass('primary', 'w-full')}>
            Volver al registro
          </Link>
        </Card>
      </PublicPage>
    )
  }
  return <GoogleRegisterForm google={signup.data} withoutAccount={sin_cuenta === true} />
}

function GoogleRegisterForm({
  google,
  withoutAccount,
}: {
  google: { email: string; first_name: string; last_name: string }
  withoutAccount: boolean
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [message, setMessage] = useState<string | null>(null)
  const form = useForm<GoogleFormData>({
    resolver: zodResolver(googleSchema),
    defaultValues: { first_name: google.first_name, last_name: google.last_name },
  })
  const mutation = useMutation({
    mutationFn: (data: GoogleFormData) => completeGoogleSignup({ ...data, email: google.email }),
    onSuccess: async (result) => {
      if (!result.user) {
        setMessage('Falta un paso de verificación adicional.')
        return
      }
      queryClient.clear()
      await navigate({ to: '/' })
    },
    onError: (error) =>
      setMessage(authErrorMessage(error, 'No se pudo completar el registro. Intenta de nuevo.')),
  })

  return (
    <PublicPage
      subtitle="Crea la cuenta de tu financiera"
      lead={
        <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-gold-100 px-3 py-1 text-[12.5px] font-semibold text-gold-800 ring-1 ring-inset ring-gold-500/30">
          ★ 30 días gratis · sin tarjeta
        </span>
      }
    >
      {withoutAccount ? (
        <Alert tone="info">
          Aún no hay una cuenta con {google.email}. Si tu financiera ya usa Cobradía, pide una
          invitación a su administrador; si no, regístrala aquí.
        </Alert>
      ) : null}
      <Card>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
          noValidate
        >
          {message ? <Alert tone="danger">{message}</Alert> : null}
          <Field label="Tu cuenta de Google" hint="Con ella entrarás a Cobradía.">
            <Input value={google.email} disabled readOnly />
          </Field>
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
          <TermsCheck
            field={form.register('accept_terms')}
            error={form.formState.errors.accept_terms?.message}
          />
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
    </PublicPage>
  )
}
