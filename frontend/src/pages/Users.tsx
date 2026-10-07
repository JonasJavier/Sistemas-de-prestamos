import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { dateOf } from '../lib/format'

import {
  createInvitation,
  listBranches,
  listPendingInvitations,
  listRoles,
  listUsers,
  revokeInvitation,
  setUserActive,
  type Me,
} from '../api/accounts'
import { ApiError } from '../api/client'
import { Alert, Badge, Button, Card, Field, Input, PageHeader, RowList, Spinner } from '../components/ui'

const schema = z.object({
  email: z.email('Escribe un correo válido.'),
  branch: z.string().min(1, 'Elige la sucursal.'),
  role: z.string().min(1, 'Elige el rol.'),
})

type FormData = z.infer<typeof schema>

const selectClasses =
  'h-11 w-full rounded-lg border border-edge bg-surface px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent-500 sm:h-9'

export function UsersPage({ me }: { me: Me }) {
  const queryClient = useQueryClient()
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(
    null,
  )

  const users = useQuery({ queryKey: ['users'], queryFn: listUsers })
  const branches = useQuery({ queryKey: ['branches'], queryFn: listBranches })
  const roles = useQuery({ queryKey: ['roles'], queryFn: listRoles })
  const pending = useQuery({ queryKey: ['invitations'], queryFn: listPendingInvitations })

  const form = useForm<FormData>({ resolver: zodResolver(schema) })

  const invite = useMutation({
    mutationFn: createInvitation,
    onSuccess: (_, variables) => {
      form.reset({ email: '', branch: variables.branch, role: '' })
      setMessage({ tone: 'success', text: `Invitación enviada a ${variables.email}.` })
      queryClient.invalidateQueries({ queryKey: ['invitations'] })
    },
    onError: (error) => {
      let text = 'No se pudo enviar la invitación.'
      if (error instanceof ApiError && error.status === 400) {
        const data = error.data as Record<string, string[]>
        text = Object.values(data).flat()[0] ?? text
      }
      if (error instanceof ApiError && error.status === 403) {
        text = 'No tienes permiso para invitar usuarios.'
      }
      setMessage({ tone: 'danger', text })
    },
  })

  const toggleUser = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setUserActive(id, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    onError: () =>
      setMessage({ tone: 'danger', text: 'No se pudo cambiar el estado del usuario.' }),
  })

  const revoke = useMutation({
    mutationFn: revokeInvitation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invitations'] }),
  })

  return (
    <>
      <PageHeader title="Usuarios" subtitle="Invita a tu equipo: cada quien crea su propia contraseña." />

      <Card>
        <h2 className="mb-3 text-base font-semibold">Invitar a alguien del equipo</h2>
        <form
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
          onSubmit={form.handleSubmit((data) => invite.mutate(data))}
          noValidate
        >
          {message ? (
            <div className="sm:col-span-3">
              <Alert tone={message.tone}>{message.text}</Alert>
            </div>
          ) : null}
          <Field label="Correo" error={form.formState.errors.email?.message}>
            <Input type="email" {...form.register('email')} />
          </Field>
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
          <div className="sm:col-span-3">
            <Button type="submit" disabled={invite.isPending}>
              {invite.isPending ? 'Enviando…' : 'Enviar invitación'}
            </Button>
          </div>
        </form>
      </Card>

      {pending.data && pending.data.length > 0 ? (
        <Card>
          <h2 className="mb-3 text-base font-semibold">Invitaciones pendientes</h2>
          <ul className="space-y-2 text-sm">
            {pending.data.map((invitation) => (
              <li key={invitation.id} className="flex items-center justify-between gap-3">
                <span>
                  <span className="font-medium">{invitation.email}</span>{' '}
                  <span className="text-muted">
                    · {invitation.role_name} en {invitation.branch_name} · vence el{' '}
                    {dateOf(invitation.expires_at)}
                  </span>
                </span>
                <Button
                  variant="secondary"
                  onClick={() => revoke.mutate(invitation.id)}
                  disabled={revoke.isPending}
                >
                  Revocar
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {users.isPending ? <Spinner /> : null}
      {users.data ? (
        <RowList>
          {users.data.results.map((user) => (
            <li
              key={user.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="font-semibold">
                  {user.first_name} {user.last_name}
                  {user.id === me.id ? (
                    <span className="ml-2 text-[12.5px] font-normal text-muted">(tú)</span>
                  ) : null}
                </div>
                <div className="text-[12.5px] text-muted">{user.email}</div>
                <div className="text-[12.5px] text-muted">
                  {user.memberships.map((m) => `${m.role_name} (${m.branch_code})`).join(' · ') ||
                    'Sin roles'}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={user.is_active ? 'brand' : 'warning'}>
                  {user.is_active ? 'Activo' : 'Desactivado'}
                </Badge>
                {user.id !== me.id ? (
                  <Button
                    variant="secondary"
                    onClick={() => toggleUser.mutate({ id: user.id, active: !user.is_active })}
                    disabled={toggleUser.isPending}
                  >
                    {user.is_active ? 'Desactivar' : 'Activar'}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </RowList>
      ) : null}
    </>
  )
}
