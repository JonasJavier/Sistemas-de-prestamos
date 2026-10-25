import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import { useForm, type FieldErrors, type UseFormRegister } from 'react-hook-form'
import { z } from 'zod'

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
  CheckRow,
  Field,
  Input,
  Outcome,
  PasswordInput,
  PublicPage,
  Spinner,
} from '../components/ui'
import { errorMessage } from '../lib/format'
import { useGoogleEnabled } from '../lib/google'

/** The promotion site, where the terms and the privacy notice live. */
const SITE_URL = 'https://cobradia.com'

/** Decision 119: five fields and the terms. The RNC and the phone wait for
 * «Mi empresa», where the manager fills them with the rest of the data. */
const personFields = {
  first_name: z.string().trim().min(1, 'Escribe tu nombre.'),
  last_name: z.string().trim().min(1, 'Escribe tu apellido.'),
  company_legal_name: z.string().trim().min(3, 'Escribe el nombre de tu financiera.'),
  accept_terms: z.literal(true, {
    error: 'Acepta los términos de servicio y el aviso de privacidad.',
  }),
}

const schema = z.object({
  ...personFields,
  email: z.email('Escribe un correo válido.'),
  password: z.string().min(12, 'Mínimo 12 caracteres.'),
})

type FormData = z.infer<typeof schema>

const googleSchema = z.object(personFields)

type GoogleFormData = z.infer<typeof googleSchema>

function serverError(error: unknown): string {
  if (error instanceof ApiError && error.status === 429) {
    return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.'
  }
  if (error instanceof ApiError && error.status === 400) {
    return errorMessage(error.data, 'Revisa los datos del formulario.')
  }
  return 'No se pudo completar el registro. Intenta de nuevo.'
}

const TRIAL = (
  <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-100 px-3 py-1 text-[12.5px] font-semibold text-gold-800 ring-1 ring-inset ring-gold-500/30">
    ★ 15 días gratis · sin tarjeta
  </span>
)

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
        <div className="space-y-6">
          <Outcome tone="success" title="Revisa tu correo">
            Te enviamos un enlace a <strong>{form.getValues('email')}</strong> para confirmar tu
            cuenta. Ábrelo y entra: tu prueba de 15 días ya está activa.
          </Outcome>
          <Link to="/entrar" className={buttonClass('primary', 'w-full sm:h-11')}>
            Ir a iniciar sesión
          </Link>
        </div>
      </PublicPage>
    )
  }

  return (
    <PublicPage subtitle="Crea tu cuenta" lead={TRIAL}>
      {message ? <Alert tone="danger">{message}</Alert> : null}
      {googleEnabled ? (
        <div className="space-y-5">
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
            Continuar con Google
          </GoogleButton>
          <OrDivider>o</OrDivider>
        </div>
      ) : null}
      <form
        className="space-y-5"
        onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
        noValidate
      >
        <NameFields register={form.register} errors={form.formState.errors} autoFocus />
        <Field label="Correo" error={form.formState.errors.email?.message}>
          <Input
            type="email"
            autoComplete="email"
            className="sm:h-11"
            {...form.register('email')}
          />
        </Field>
        <Field
          label="Contraseña"
          error={form.formState.errors.password?.message}
          hint="Al menos 12 caracteres."
        >
          <PasswordInput
            autoComplete="new-password"
            className="sm:h-11"
            {...form.register('password')}
          />
        </Field>
        <CompanyField register={form.register} errors={form.formState.errors} />
        <TermsCheck register={form.register} errors={form.formState.errors} />
        <Button type="submit" className="w-full sm:h-11" disabled={mutation.isPending}>
          {mutation.isPending ? 'Creando tu cuenta…' : 'Crear mi cuenta'}
        </Button>
      </form>
      <SignInLine />
    </PublicPage>
  )
}

/** The pieces both forms share: the person, the company and the terms. */
type Shared = {
  register: UseFormRegister<FormData> | UseFormRegister<GoogleFormData>
  errors: FieldErrors<GoogleFormData>
}

function NameFields({ register, errors, autoFocus }: Shared & { autoFocus?: boolean }) {
  const field = register as UseFormRegister<GoogleFormData>
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Nombre" error={errors.first_name?.message}>
        <Input
          autoComplete="given-name"
          autoFocus={autoFocus}
          className="sm:h-11"
          {...field('first_name')}
        />
      </Field>
      <Field label="Apellido" error={errors.last_name?.message}>
        <Input autoComplete="family-name" className="sm:h-11" {...field('last_name')} />
      </Field>
    </div>
  )
}

function CompanyField({ register, errors, autoFocus }: Shared & { autoFocus?: boolean }) {
  const field = register as UseFormRegister<GoogleFormData>
  return (
    <Field label="Nombre de tu financiera" error={errors.company_legal_name?.message}>
      <Input
        autoComplete="organization"
        autoFocus={autoFocus}
        className="sm:h-11"
        {...field('company_legal_name')}
      />
    </Field>
  )
}

/** Decision 103: the accepted version is recorded with the company. */
function TermsCheck({ register, errors }: Shared) {
  const field = register as UseFormRegister<GoogleFormData>
  const link = (href: string, text: ReactNode) => (
    <a
      href={`${SITE_URL}${href}`}
      target="_blank"
      rel="noreferrer"
      className="font-semibold text-brand-700 hover:underline"
    >
      {text}
    </a>
  )
  return (
    <CheckRow
      label={
        <>
          Acepto los {link('/terminos', 'términos de servicio')} y el{' '}
          {link('/privacidad', 'aviso de privacidad')}.
        </>
      }
      error={errors.accept_terms?.message}
      {...field('accept_terms')}
    />
  )
}

function SignInLine() {
  return (
    <p className="text-center text-[13.5px] text-muted">
      ¿Ya tienes cuenta?{' '}
      <Link to="/entrar" className="font-semibold text-brand-700 hover:underline">
        Entrar
      </Link>
    </p>
  )
}

/** Decision 118: the company signup after «Continuar con Google». The
 * address is the one Google verified, so there is no password and no code. */
export function GoogleRegisterPage() {
  const { sin_cuenta } = useSearch({ from: '/registro/google' })
  const signup = useQuery({ queryKey: ['google-signup'], queryFn: getGoogleSignup, retry: false })

  if (signup.isPending) {
    return (
      <PublicPage subtitle="Crea tu cuenta">
        <Spinner />
      </PublicPage>
    )
  }
  if (signup.isError) {
    return (
      <PublicPage>
        <div className="space-y-6">
          <Outcome tone="warning" title="Vuelve a empezar">
            Pasó demasiado tiempo desde que elegiste tu cuenta de Google. Inténtalo otra vez.
          </Outcome>
          <Link to="/registro" className={buttonClass('primary', 'w-full sm:h-11')}>
            Volver al registro
          </Link>
        </div>
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
  const named = google.first_name !== '' && google.last_name !== ''

  return (
    <PublicPage subtitle="Casi listo" lead={TRIAL}>
      {withoutAccount ? (
        <Alert tone="info">
          Aún no hay una cuenta con {google.email}. Si tu financiera ya usa Cobradía, pide una
          invitación a su administrador; si no, regístrala aquí.
        </Alert>
      ) : null}
      <form
        className="space-y-5"
        onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
        noValidate
      >
        {message ? <Alert tone="danger">{message}</Alert> : null}
        <p className="flex items-center gap-2.5 rounded-control border border-edge bg-surface px-3 py-2.5 text-[13.5px]">
          <span
            aria-hidden
            className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-100 text-[12px] font-bold text-brand-800"
          >
            {(google.first_name || google.email).charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate">{google.email}</span>
          <span className="shrink-0 text-[12px] text-muted">Google</span>
        </p>
        <NameFields register={form.register} errors={form.formState.errors} autoFocus={!named} />
        <CompanyField register={form.register} errors={form.formState.errors} autoFocus={named} />
        <TermsCheck register={form.register} errors={form.formState.errors} />
        <Button type="submit" className="w-full sm:h-11" disabled={mutation.isPending}>
          {mutation.isPending ? 'Creando tu cuenta…' : 'Crear mi cuenta'}
        </Button>
      </form>
      <SignInLine />
    </PublicPage>
  )
}
