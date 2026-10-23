import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { getMe, updateProfile, type Me } from '../../api/accounts'
import {
  authErrorMessage,
  continueWithGoogle,
  disconnectAccount,
  listConnectedAccounts,
} from '../../api/auth'
import { ApiError } from '../../api/client'
import { GoogleButton } from '../../components/GoogleButton'
import { Alert, Avatar, Badge, Button, Field, Input, Segmented } from '../../components/ui'
import { errorMessage } from '../../lib/format'
import { useGoogleEnabled } from '../../lib/google'
import { setDark, useDarkTheme } from '../../lib/theme'
import { notify } from '../../lib/toast'
import { Panel } from './Panel'

const fullName = (me: Me) => [me.first_name, me.last_name].filter(Boolean).join(' ')

/** Mi cuenta › Perfil: who the person is in the system (decision 117). */
export function ProfileSection({ me: initial }: { me: Me }) {
  const me = useQuery({ queryKey: ['me'], queryFn: getMe, initialData: initial }).data
  return (
    <>
      <IdentityCard me={me} />
      <NameForm me={me} />
      <GooglePanel me={me} />
      <ThemePanel />
    </>
  )
}

function IdentityCard({ me }: { me: Me }) {
  const name = fullName(me) || me.email
  const role = me.is_platform_admin && !me.company_id ? 'Dueño de la plataforma' : null
  return (
    <section
      aria-label="Tu perfil"
      className="flex items-center gap-4 rounded-card border border-edge bg-surface p-4 shadow-sm sm:p-6"
    >
      <Avatar name={name} size="xl" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="font-display text-lg font-semibold leading-snug sm:text-xl">{name}</div>
        <div className="truncate text-sm text-muted">{me.email}</div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {role ? <Badge tone="brand">{role}</Badge> : null}
          {me.roles.map((item) => (
            <Badge key={item} tone="brand">
              {item}
            </Badge>
          ))}
          {me.company_name ? <Badge>{me.company_name}</Badge> : null}
        </div>
      </div>
    </section>
  )
}

function NameForm({ me }: { me: Me }) {
  const queryClient = useQueryClient()
  const [first, setFirst] = useState(me.first_name)
  const [last, setLast] = useState(me.last_name)
  const save = useMutation({
    meta: { inlineError: true },
    mutationFn: () => updateProfile({ first_name: first.trim(), last_name: last.trim() }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['me'], updated)
      setFirst(updated.first_name)
      setLast(updated.last_name)
      notify('Tu nombre quedó guardado.', 'success')
    },
  })
  const changed = first.trim() !== me.first_name || last.trim() !== me.last_name
  const fieldError = (field: string) => {
    const data =
      save.error instanceof ApiError ? (save.error.data as Record<string, unknown>) : null
    return data && field in data ? errorMessage({ [field]: data[field] }) : undefined
  }
  return (
    <Panel
      title="Datos personales"
      description="Tu nombre aparece en los recibos, en la auditoría y en lo que registras."
      onSubmit={() => {
        if (changed && first.trim()) save.mutate()
      }}
      footer={
        <>
          {changed ? (
            <span className="text-[12.5px] text-muted">Hay cambios sin guardar</span>
          ) : null}
          <Button type="submit" disabled={!changed || !first.trim() || save.isPending}>
            {save.isPending ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </>
      }
    >
      <div className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Nombre"
          error={changed && !first.trim() ? 'Escribe tu nombre.' : fieldError('first_name')}
        >
          <Input
            autoComplete="given-name"
            maxLength={150}
            value={first}
            onChange={(event) => setFirst(event.target.value)}
          />
        </Field>
        <Field label="Apellidos" error={fieldError('last_name')}>
          <Input
            autoComplete="family-name"
            maxLength={150}
            value={last}
            onChange={(event) => setLast(event.target.value)}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Correo" hint="Es con el que entras al sistema; no se cambia desde aquí.">
            <Input value={me.email} disabled readOnly />
          </Field>
        </div>
      </div>
      {save.error && !fieldError('first_name') && !fieldError('last_name') ? (
        <Alert tone="danger">
          {errorMessage(save.error instanceof ApiError ? save.error.data : null)}
        </Alert>
      ) : null}
    </Panel>
  )
}

/** Decision 118: entering with one click through the person's Google account. */
function GooglePanel({ me }: { me: Me }) {
  const queryClient = useQueryClient()
  const enabled = useGoogleEnabled()
  const [leaving, setLeaving] = useState(false)
  const accounts = useQuery({ queryKey: ['connected-accounts'], queryFn: listConnectedAccounts })
  const google = accounts.data?.find((account) => account.provider.id === 'google')
  const disconnect = useMutation({
    meta: { inlineError: true },
    mutationFn: () => disconnectAccount(google!),
    onSuccess: () => {
      notify('Tu cuenta de Google quedó desconectada.', 'success')
      void queryClient.invalidateQueries({ queryKey: ['connected-accounts'] })
    },
  })
  if (!enabled && !google) return null
  const canDisconnect = me.has_password !== false

  return (
    <Panel
      title="Entrar con Google"
      description={
        google
          ? 'Entras con un clic usando tu cuenta de Google, sin escribir la contraseña.'
          : 'Conecta tu cuenta de Google para entrar con un clic, sin escribir la contraseña.'
      }
      aside={
        google ? (
          <Badge tone="success" dot>
            Conectada
          </Badge>
        ) : null
      }
      footer={
        google ? (
          <Button
            type="button"
            variant="secondary"
            disabled={!canDisconnect || disconnect.isPending}
            onClick={() => disconnect.mutate()}
          >
            {disconnect.isPending ? 'Desconectando…' : 'Desconectar'}
          </Button>
        ) : (
          <GoogleButton
            className="w-full sm:w-auto"
            busy={leaving}
            onClick={() => {
              setLeaving(true)
              continueWithGoogle({ kind: 'connect' }).catch(() => setLeaving(false))
            }}
          >
            Conectar con Google
          </GoogleButton>
        )
      }
    >
      {google ? <div className="text-sm font-medium">{google.display}</div> : null}
      {google && !canDisconnect ? (
        <p className="text-[12.5px] text-muted">
          Para desconectarla, primero{' '}
          <Link to="/cuenta/contrasena" className="font-medium text-brand-700 hover:underline">
            crea una contraseña
          </Link>
          : sin ella no podrías entrar.
        </p>
      ) : null}
      {disconnect.error ? (
        <Alert tone="danger">{authErrorMessage(disconnect.error, 'No se pudo desconectar.')}</Alert>
      ) : null}
    </Panel>
  )
}

function ThemePanel() {
  const [dark] = useDarkTheme()
  return (
    <Panel
      title="Apariencia"
      description="Cómo se ve Cobradía en este dispositivo."
      aside={
        <Segmented
          label="Tema"
          value={dark ? 'dark' : 'light'}
          onChange={(value) => setDark(value === 'dark')}
          options={[
            { value: 'light', label: 'Claro' },
            { value: 'dark', label: 'Oscuro' },
          ]}
        />
      }
    />
  )
}
