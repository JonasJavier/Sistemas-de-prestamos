import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import {
  createInvitation,
  listBranches,
  listPendingInvitations,
  listRoles,
  listUsers,
  revokeInvitation,
  setUserActive,
} from '../api/accounts'
import { ApiError } from '../api/client'
import { Alert, Button, Card, Field, Input } from '../components/ui'

const schema = z.object({
  email: z.email('Escribe un correo válido.'),
  branch: z.string().min(1, 'Elige la sucursal.'),
  role: z.string().min(1, 'Elige el rol.'),
})

type FormData = z.infer<typeof schema>

const selectClasses =
  'h-11 w-full rounded-lg border border-edge bg-surface px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent-500 sm:h-9'

export function UsersPage() {
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
      <h1 className="text-xl font-semibold">Usuarios</h1>

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
                    {new Date(invitation.expires_at).toLocaleDateString('es-DO')}
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

      <Card>
        {users.isPending ? <p className="text-sm text-muted">Cargando…</p> : null}
        {users.data ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge text-left text-[12.5px] text-muted">
                <th className="py-2 pr-3">Usuario</th>
                <th className="py-2 pr-3">Roles</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {users.data.results.map((user) => (
                <tr key={user.id} className="border-b border-edge/60 last:border-0">
                  <td className="py-2 pr-3">
                    <div className="font-medium">
                      {user.first_name} {user.last_name}
                    </div>
                    <div className="text-muted">{user.email}</div>
                  </td>
                  <td className="py-2 pr-3 text-muted">
                    {user.memberships
                      .map((m) => `${m.role_name} (${m.branch_code})`)
                      .join(', ') || '—'}
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[12.5px] font-medium ${
                        user.is_active
                          ? 'bg-brand-100 text-brand-800'
                          : 'bg-warning-700/15 text-warning-700'
                      }`}
                    >
                      {user.is_active ? 'Activo' : 'Desactivado'}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <Button
                      variant="secondary"
                      onClick={() => toggleUser.mutate({ id: user.id, active: !user.is_active })}
                      disabled={toggleUser.isPending}
                    >
                      {user.is_active ? 'Desactivar' : 'Activar'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Card>
    </>
  )
}
