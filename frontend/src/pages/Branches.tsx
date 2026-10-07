import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { createBranch, listBranches, updateBranch } from '../api/accounts'
import { ApiError } from '../api/client'
import { Alert, Button, Card, Field, Input, PageHeader } from '../components/ui'
import { errorMessage } from '../lib/format'

const schema = z.object({
  code: z
    .string()
    .min(1, 'Escribe un código.')
    .max(10, 'Máximo 10 caracteres.')
    .regex(/^[A-Za-z0-9]+$/, 'Solo letras y números.'),
  name: z.string().min(2, 'Escribe el nombre.'),
  address: z.string().optional(),
  phone: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export function BranchesPage() {
  const queryClient = useQueryClient()
  const [message, setMessage] = useState<string | null>(null)
  const branches = useQuery({ queryKey: ['branches'], queryFn: listBranches })
  const form = useForm<FormData>({ resolver: zodResolver(schema) })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['branches'] })

  const create = useMutation({
    mutationFn: createBranch,
    onSuccess: () => {
      form.reset({ code: '', name: '', address: '', phone: '' })
      setMessage(null)
      invalidate()
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 400) {
        const data = error.data as Record<string, string[]>
        setMessage(Object.values(data).flat()[0] ?? 'Revisa los datos.')
      } else if (error instanceof ApiError && error.status === 403) {
        setMessage('No tienes permiso para crear sucursales.')
      } else {
        setMessage('No se pudo crear la sucursal.')
      }
    },
  })

  const toggle = useMutation({
    meta: { inlineError: true },
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      updateBranch(id, { is_active }),
    onSuccess: invalidate,
  })

  return (
    <>
      <PageHeader
        title="Sucursales"
        subtitle="Cada sucursal numera sus documentos con su código."
      />
      <Card>
        <h2 className="mb-3 text-base font-semibold">Nueva sucursal</h2>
        <form
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          onSubmit={form.handleSubmit((data) => create.mutate(data))}
          noValidate
        >
          {message ? (
            <div className="sm:col-span-2">
              <Alert tone="danger">{message}</Alert>
            </div>
          ) : null}
          <Field label="Código (prefijo de documentos)" error={form.formState.errors.code?.message}>
            <Input placeholder="SD" {...form.register('code')} />
          </Field>
          <Field label="Nombre" error={form.formState.errors.name?.message}>
            <Input placeholder="Santo Domingo" {...form.register('name')} />
          </Field>
          <Field label="Dirección (opcional)">
            <Input {...form.register('address')} />
          </Field>
          <Field label="Teléfono (opcional)">
            <Input type="tel" {...form.register('phone')} />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creando…' : 'Crear sucursal'}
            </Button>
          </div>
        </form>
        <p className="mt-2 text-[12.5px] text-muted">
          El código numera los documentos de la sucursal (por ejemplo SD-000125) y no se puede
          cambiar después.
        </p>
      </Card>

      {toggle.error instanceof ApiError ? (
        <Alert tone="danger">{errorMessage(toggle.error.data)}</Alert>
      ) : null}
      <Card>
        {branches.isPending ? <p className="text-sm text-muted">Cargando…</p> : null}
        {branches.data ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge text-left text-[12.5px] text-muted">
                <th className="py-2 pr-3">Código</th>
                <th className="py-2 pr-3">Nombre</th>
                <th className="py-2 pr-3">Dirección</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {branches.data.results.map((branch) => (
                <tr key={branch.id} className="border-b border-edge/60 last:border-0">
                  <td className="py-2 pr-3 font-medium tabular-nums">{branch.code}</td>
                  <td className="py-2 pr-3">{branch.name}</td>
                  <td className="py-2 pr-3 text-muted">{branch.address || '—'}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[12.5px] font-medium ${
                        branch.is_active
                          ? 'bg-brand-100 text-brand-800'
                          : 'bg-warning-700/15 text-warning-700'
                      }`}
                    >
                      {branch.is_active ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <Button
                      variant="secondary"
                      onClick={() => toggle.mutate({ id: branch.id, is_active: !branch.is_active })}
                      disabled={toggle.isPending}
                    >
                      {branch.is_active ? 'Desactivar' : 'Activar'}
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
