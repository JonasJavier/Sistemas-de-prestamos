import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { dateOf, errorMessage } from '../lib/format'

import {
  createInvitation,
  listBranches,
  listPendingInvitations,
  listRoles,
  listUsers,
  resetUserMfa,
  revokeInvitation,
  setUserActive,
  type Me,
} from '../api/accounts'
import { ApiError } from '../api/client'
import { usePrompt } from '../components/Dialog'
import { controlClass } from '../components/classes'
import { Modal } from '../components/Modal'
import { MoreMenu } from '../components/MoreMenu'
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Field,
  Input,
  PageHeader,
  Section,
  Spinner,
  Table,
} from '../components/ui'
import { notify } from '../lib/toast'

const schema = z.object({
  email: z.email('Escribe un correo válido.'),
  branch: z.string().min(1, 'Elige la sucursal.'),
  role: z.string().min(1, 'Elige el rol.'),
})

type FormData = z.infer<typeof schema>

const selectClasses = `h-11 sm:h-[38px] ${controlClass}`

export function UsersPage({ me }: { me: Me }) {
  const queryClient = useQueryClient()
  const [inviting, setInviting] = useState(false)
  const users = useQuery({ queryKey: ['users'], queryFn: listUsers })
  const pending = useQuery({ queryKey: ['invitations'], queryFn: listPendingInvitations })

  const [dialog, ask] = usePrompt()
  const toggleUser = useMutation({
    mutationFn: async ({ id, active, name }: { id: string; active: boolean; name: string }) => {
      // Shutting someone out takes a second look; letting them back in does not.
      if (!active) {
        const confirmed = await ask({
          title: `Desactivar a ${name}`,
          description:
            'No podrá entrar a Cobradía hasta que lo actives de nuevo. Lo que registró se conserva.',
          confirmText: 'Desactivar',
          danger: true,
        })
        if (confirmed === null) return null
      }
      return setUserActive(id, active)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    onError: () => notify('No se pudo cambiar el estado del usuario.', 'danger'),
  })

  const resetMfa = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const note = await ask({
        title: `Restablecer la verificación de ${name}`,
        description:
          'Solo si perdió el celular y sus códigos de respaldo, y estás seguro de que es esa persona. Su app, sus llaves de acceso y sus códigos dejan de servir, sus sesiones se cierran y le avisamos por correo; al entrar, la configura de nuevo. Queda en la auditoría.',
        label: 'Motivo',
        type: 'textarea',
        required: true,
        confirmText: 'Restablecer',
        danger: true,
      })
      if (note === null) return null
      return resetUserMfa(id, note)
    },
    onSuccess: (user) => {
      if (!user) return
      notify('Verificación restablecida: la persona la configurará al entrar.', 'success')
      void queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: () => notify('No se pudo restablecer la verificación.', 'danger'),
  })

  const revoke = useMutation({
    mutationFn: revokeInvitation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invitations'] }),
  })

  return (
    <>
      {dialog}
      <PageHeader
        title="Usuarios"
        subtitle="Invita a tu equipo: cada quien crea su propia contraseña."
        actions={<Button onClick={() => setInviting(true)}>Invitar a alguien</Button>}
      />

      {users.isPending ? <Spinner /> : null}
      {users.data ? (
        <Table
          label="Equipo"
          columns="minmax(0,1.3fr) minmax(0,1.2fr) 11rem 3rem"
          head={[{ label: 'Persona' }, { label: 'Roles' }, { label: 'Estado' }, { label: '' }]}
        >
          {users.data.results.map((user) => {
            const name = `${user.first_name} ${user.last_name}`.trim() || user.email
            return (
              <li
                key={user.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 text-[13px] md:grid md:grid-cols-[var(--cols)] md:px-5"
              >
                <div className="flex min-w-0 basis-full items-center gap-3 md:basis-auto">
                  <Avatar name={name} size="sm" />
                  <div className="min-w-0">
                    <div className="truncate font-semibold">
                      {name}
                      {user.id === me.id ? (
                        <span className="ml-1.5 text-[12px] font-normal text-muted">(tú)</span>
                      ) : null}
                    </div>
                    <div className="truncate text-[12px] text-muted">{user.email}</div>
                  </div>
                </div>
                <div className="min-w-0 text-[12.5px] text-muted md:text-[13px] md:text-ink">
                  {user.memberships.map((m) => `${m.role_name} (${m.branch_code})`).join(' · ') ||
                    'Sin roles'}
                </div>
                <span className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={user.is_active ? 'brand' : 'warning'} dot>
                    {user.is_active ? 'Activo' : 'Desactivado'}
                  </Badge>
                  <Badge tone={user.mfa_enabled ? 'success' : 'neutral'}>
                    {user.mfa_enabled ? 'Dos pasos' : 'Sin dos pasos'}
                  </Badge>
                </span>
                <span className="flex justify-end">
                  {user.id !== me.id ? (
                    <MoreMenu
                      compact
                      items={[
                        {
                          label: user.is_active ? 'Desactivar' : 'Activar',
                          onSelect: () =>
                            toggleUser.mutate({ id: user.id, active: !user.is_active, name }),
                        },
                        ...(user.mfa_enabled
                          ? [
                              {
                                label: 'Restablecer verificación en dos pasos',
                                danger: true,
                                onSelect: () => resetMfa.mutate({ id: user.id, name }),
                              },
                            ]
                          : []),
                      ]}
                    />
                  ) : null}
                </span>
              </li>
            )
          })}
        </Table>
      ) : null}

      {pending.data && pending.data.length > 0 ? (
        <Section title="Invitaciones pendientes">
          <Table
            label="Invitaciones pendientes"
            columns="minmax(0,1.3fr) minmax(0,1.2fr) 7.5rem 7.5rem"
          >
            {pending.data.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 text-[13px] md:grid md:grid-cols-[var(--cols)] md:px-5"
              >
                <div className="flex min-w-0 basis-full items-center gap-3 md:basis-auto">
                  <span
                    aria-hidden
                    className="grid size-8 shrink-0 place-items-center rounded-full border border-dashed border-muted/50 text-[12px] text-muted"
                  >
                    @
                  </span>
                  <span className="truncate font-medium">{invitation.email}</span>
                </div>
                <span className="text-[12.5px] text-muted md:text-[13px] md:text-ink">
                  {invitation.role_name} en {invitation.branch_name}
                </span>
                <span className="text-[12px] text-muted">
                  Vence el {dateOf(invitation.expires_at)}
                </span>
                <span className="md:text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => revoke.mutate(invitation.id)}
                    disabled={revoke.isPending}
                  >
                    Revocar
                  </Button>
                </span>
              </li>
            ))}
          </Table>
        </Section>
      ) : null}
      {inviting ? <InviteDialog onClose={() => setInviting(false)} /> : null}
    </>
  )
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const branches = useQuery({ queryKey: ['branches'], queryFn: listBranches })
  const roles = useQuery({ queryKey: ['roles'], queryFn: listRoles })
  const form = useForm<FormData>({ resolver: zodResolver(schema) })
  const [error, setError] = useState<string | null>(null)
  const invite = useMutation({
    mutationFn: createInvitation,
    onSuccess: (_, variables) => {
      notify(`Invitación enviada a ${variables.email}.`, 'success')
      void queryClient.invalidateQueries({ queryKey: ['invitations'] })
      onClose()
    },
    onError: (failure) => {
      let text = 'No se pudo enviar la invitación.'
      if (failure instanceof ApiError && failure.status === 400) {
        text = errorMessage(failure.data as Record<string, string[]>, text)
      }
      if (failure instanceof ApiError && failure.status === 403) {
        text = 'No tienes permiso para invitar usuarios.'
      }
      setError(text)
    },
  })
  return (
    <Modal onClose={onClose} labelledBy="invite-title">
      <form
        className="w-full max-w-md space-y-4 rounded-2xl bg-surface p-5 shadow-xl"
        onSubmit={form.handleSubmit((data) => invite.mutate(data))}
        noValidate
      >
        <div>
          <h2 id="invite-title" className="text-[18px] font-semibold">
            Invitar a alguien del equipo
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted">
            Le llega un enlace por correo para crear su contraseña; vence en 7 días.
          </p>
        </div>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field label="Correo" error={form.formState.errors.email?.message}>
          <Input type="email" autoFocus {...form.register('email')} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sucursal" error={form.formState.errors.branch?.message}>
            <select className={selectClasses} {...form.register('branch')}>
              <option value="">Elegir…</option>
              {branches.data?.results
                .filter((branch) => branch.is_active)
                .map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.code} · {branch.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Rol" error={form.formState.errors.role?.message}>
            <select className={selectClasses} {...form.register('role')}>
              <option value="">Elegir…</option>
              {roles.data?.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={invite.isPending}>
            {invite.isPending ? 'Enviando…' : 'Enviar invitación'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
