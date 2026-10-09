import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { errorMessage } from '../lib/format'

import { acceptInvitation, getInvitation } from '../api/accounts'
import { ApiError } from '../api/client'
import { Alert, Button, Card, Field, Input, PublicPage } from '../components/ui'

const schema = z.object({
  first_name: z.string().min(1, 'Escribe tu nombre.'),
  last_name: z.string().min(1, 'Escribe tu apellido.'),
  password: z.string().min(12, 'Mínimo 12 caracteres.'),
})

type FormData = z.infer<typeof schema>

export function InvitationAcceptPage() {
  const { token } = useParams({ from: '/invitacion/$token' })
  const [message, setMessage] = useState<string | null>(null)
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
        <Alert tone="danger">La invitación no existe o ya fue usada.</Alert>
      </Wrapper>
    )
  }
  if (invitation.data?.is_expired) {
    return (
      <Wrapper>
        <Alert tone="warning">
          Esta invitación venció. Pide al administrador de tu empresa que te envíe otra.
        </Alert>
      </Wrapper>
    )
  }
  if (accept.isSuccess) {
    return (
      <Wrapper>
        <Alert tone="success">Tu cuenta quedó creada.</Alert>
        <Link to="/entrar" className="font-medium text-brand-700 hover:underline">
          Iniciar sesión
        </Link>
      </Wrapper>
    )
  }

  return (
    <Wrapper>
      {invitation.data ? (
        <>
          <p className="text-sm text-muted">
            <strong className="text-ink">{invitation.data.company_name}</strong> te invitó como{' '}
            <strong className="text-ink">{invitation.data.role_name}</strong> en la sucursal{' '}
            {invitation.data.branch_name}.
          </p>
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
        <p className="text-sm text-muted">Cargando…</p>
      )}
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
