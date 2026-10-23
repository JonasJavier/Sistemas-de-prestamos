import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { errorMessage } from '../lib/format'

import { acceptInvitation, getInvitation, type InvitationDetail } from '../api/accounts'
import {
  authErrorMessage,
  completeGoogleSignup,
  continueWithGoogle,
  getGoogleSignup,
} from '../api/auth'
import { ApiError } from '../api/client'
import { buttonClass } from '../components/classes'
import { GoogleButton, OrDivider } from '../components/GoogleButton'
import { Alert, Button, Card, Field, Input, Outcome, PublicPage, Spinner } from '../components/ui'
import { useGoogleEnabled } from '../lib/google'

const schema = z.object({
  first_name: z.string().min(1, 'Escribe tu nombre.'),
  last_name: z.string().min(1, 'Escribe tu apellido.'),
  password: z.string().min(12, 'Mínimo 12 caracteres.'),
})

type FormData = z.infer<typeof schema>

export interface InvitationSearch {
  /** Back from Google (decision 118): «ok» to finish joining, or allauth's error. */
  google?: string
}

export function InvitationAcceptPage() {
  const { token } = useParams({ from: '/invitacion/$token' })
  const { google } = useSearch({ from: '/invitacion/$token' })
  const googleEnabled = useGoogleEnabled()
  const [leaving, setLeaving] = useState(false)
  const [message, setMessage] = useState<string | null>(
    google && google !== 'ok' ? 'No se pudo usar tu cuenta de Google. Intenta de nuevo.' : null,
  )
  const invitation = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => getInvitation(token),
    retry: false,
  })
  const form = useForm<FormData>({ resolver: zodResolver(schema) })

  const accept = useMutation({
    mutationFn: (data: FormData) => acceptInvitation(token, data),
    onError: (error) => {
      let text = 'No se pudo crear la cuenta.'
      if (error instanceof ApiError && error.status === 400 && error.data) {
        const data = error.data as Record<string, string[]>
        text = errorMessage(data, text)
      }
      setMessage(text)
    },
  })

  if (invitation.isError) {
    return (
      <Wrapper>
        <Outcome tone="danger" title="Invitación no válida">
          La invitación no existe o ya fue usada. Si ya creaste tu cuenta, inicia sesión.
        </Outcome>
        <Link to="/entrar" className={buttonClass('secondary', 'w-full')}>
          Ir a iniciar sesión
        </Link>
      </Wrapper>
    )
  }
  if (invitation.data?.is_expired) {
    return (
      <Wrapper>
        <Outcome tone="warning" title="La invitación venció">
          Pide al administrador de tu empresa que te envíe otra.
        </Outcome>
      </Wrapper>
    )
  }
  if (accept.isSuccess) {
    return (
      <Wrapper>
        <Outcome tone="success" title="Tu cuenta quedó creada">
          Ya puedes entrar con tu correo y la contraseña que elegiste.
        </Outcome>
        <Link to="/entrar" className={buttonClass('primary', 'w-full')}>
          Iniciar sesión
        </Link>
      </Wrapper>
    )
  }

  if (google === 'ok' && invitation.data) {
    return <JoinWithGoogle token={token} invitation={invitation.data} />
  }

  return (
    <Wrapper>
      {invitation.data ? (
        <>
          <Welcome invitation={invitation.data} />
          {googleEnabled ? (
            <>
              <GoogleButton
                busy={leaving}
                onClick={() => {
                  setLeaving(true)
                  continueWithGoogle({ kind: 'invitation', token }).catch(() => {
                    setLeaving(false)
                    setMessage('No se pudo abrir Google. Intenta de nuevo.')
                  })
                }}
              >
                Aceptar con Google
              </GoogleButton>
              <OrDivider>o crea una contraseña</OrDivider>
            </>
          ) : null}
          <form
            className="space-y-4 text-left"
            onSubmit={form.handleSubmit((data) => accept.mutate(data))}
            noValidate
          >
            {message ? <Alert tone="danger">{message}</Alert> : null}
            <Field label="Correo">
              <Input value={invitation.data.email} disabled />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tu nombre" error={form.formState.errors.first_name?.message}>
                <Input autoFocus {...form.register('first_name')} />
              </Field>
              <Field label="Tu apellido" error={form.formState.errors.last_name?.message}>
                <Input {...form.register('last_name')} />
              </Field>
            </div>
            <Field
              label="Crea tu contraseña"
              error={form.formState.errors.password?.message}
              hint="Al menos 12 caracteres."
            >
              <Input type="password" autoComplete="new-password" {...form.register('password')} />
            </Field>
            <Button type="submit" className="w-full" disabled={accept.isPending}>
              {accept.isPending ? 'Creando…' : 'Crear mi cuenta'}
            </Button>
          </form>
        </>
      ) : (
        <Spinner />
      )}
    </Wrapper>
  )
}

function Welcome({ invitation }: { invitation: InvitationDetail }) {
  return (
    <p className="text-sm text-muted">
      <strong className="text-ink">{invitation.company_name}</strong> te invitó como{' '}
      <strong className="text-ink">{invitation.role_name}</strong> en la sucursal{' '}
      {invitation.branch_name}.
    </p>
  )
}

const googleSchema = z.object({
  first_name: z.string().min(1, 'Escribe tu nombre.'),
  last_name: z.string().min(1, 'Escribe tu apellido.'),
})

/** Decision 118: the invitation accepted with the Google account of its address. */
function JoinWithGoogle({ token, invitation }: { token: string; invitation: InvitationDetail }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const signup = useQuery({ queryKey: ['google-signup'], queryFn: getGoogleSignup, retry: false })
  const [message, setMessage] = useState<string | null>(null)
  const form = useForm<z.infer<typeof googleSchema>>({
    resolver: zodResolver(googleSchema),
    values: signup.data
      ? { first_name: signup.data.first_name, last_name: signup.data.last_name }
      : undefined,
  })
  const join = useMutation({
    mutationFn: (data: z.infer<typeof googleSchema>) =>
      completeGoogleSignup({ ...data, email: signup.data?.email ?? '', invitation: token }),
    onSuccess: async (result) => {
      if (!result.user) {
        setMessage('Falta un paso de verificación adicional.')
        return
      }
      queryClient.clear()
      await navigate({ to: '/' })
    },
    onError: (error) => setMessage(authErrorMessage(error, 'No se pudo crear la cuenta.')),
  })

  if (signup.isPending) {
    return (
      <Wrapper>
        <Spinner />
      </Wrapper>
    )
  }
  if (signup.isError) {
    return (
      <Wrapper>
        <Outcome tone="warning" title="Vuelve a empezar">
          Pasó demasiado tiempo desde que elegiste tu cuenta de Google. Inténtalo otra vez.
        </Outcome>
        <Link
          to="/invitacion/$token"
          params={{ token }}
          className={buttonClass('primary', 'w-full')}
        >
          Volver a la invitación
        </Link>
      </Wrapper>
    )
  }
  const other = signup.data.email.toLowerCase() !== invitation.email.toLowerCase()
  return (
    <Wrapper>
      <Welcome invitation={invitation} />
      <form
        className="space-y-4 text-left"
        onSubmit={form.handleSubmit((data) => join.mutate(data))}
        noValidate
      >
        {other ? (
          <Alert tone="warning">
            Esta invitación es para {invitation.email} y elegiste {signup.data.email}. Vuelve y
            elige esa cuenta de Google, o crea una contraseña.
          </Alert>
        ) : null}
        {message ? <Alert tone="danger">{message}</Alert> : null}
        <Field label="Tu cuenta de Google">
          <Input value={signup.data.email} disabled readOnly />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tu nombre" error={form.formState.errors.first_name?.message}>
            <Input autoFocus {...form.register('first_name')} />
          </Field>
          <Field label="Tu apellido" error={form.formState.errors.last_name?.message}>
            <Input {...form.register('last_name')} />
          </Field>
        </div>
        {other ? (
          <Link
            to="/invitacion/$token"
            params={{ token }}
            className={buttonClass('secondary', 'w-full')}
          >
            Volver a la invitación
          </Link>
        ) : (
          <Button type="submit" className="w-full" disabled={join.isPending}>
            {join.isPending ? 'Creando…' : 'Crear mi cuenta'}
          </Button>
        )}
      </form>
    </Wrapper>
  )
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <PublicPage>
      <Card className="space-y-4 text-center">{children}</Card>
    </PublicPage>
  )
}
