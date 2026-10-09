import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { createBranch, listBranches, updateBranch, type Branch } from '../api/accounts'
import { ApiError } from '../api/client'
import { Modal } from '../components/Modal'
import { Alert, Button, Card, Field, Input, PageHeader } from '../components/ui'
import { errorMessage } from '../lib/format'

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function hoursText(branch: Branch) {
  const days = branch.workdays ?? []
  const span =
    days.length && days.every((d, i) => i === 0 || d === days[i - 1] + 1)
      ? `${DAYS[days[0]]}–${DAYS[days[days.length - 1]]}`
      : days.map((d) => DAYS[d]).join(', ')
  return `${span} · ${branch.opens_at?.slice(0, 5)}–${branch.closes_at?.slice(0, 5)}`
}

/** Decision 035: the hours within which cashiers and collectors work. */
function HoursDialog({ branch, onClose }: { branch: Branch; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [opens, setOpens] = useState(branch.opens_at?.slice(0, 5) ?? '08:00')
  const [closes, setCloses] = useState(branch.closes_at?.slice(0, 5) ?? '18:00')
  const [days, setDays] = useState<number[]>(branch.workdays ?? [0, 1, 2, 3, 4, 5])
  const save = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      updateBranch(branch.id, { opens_at: opens, closes_at: closes, workdays: days }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['branches'] })
      onClose()
    },
  })
  return (
    <Modal onClose={onClose} labelledBy="hours-title">
      <div className="w-full max-w-md space-y-3 rounded-xl bg-surface p-5 shadow-xl">
        <h2 id="hours-title" className="text-lg font-semibold">
          Horario de {branch.name}
        </h2>
        <p className="text-sm text-muted">
          Cajeros y cobradores solo entran en este horario; al terminar, su sesión se cierra. El
          supervisor puede extenderlo por un rato desde Rutas.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Abre">
            <Input type="time" value={opens} onChange={(e) => setOpens(e.target.value)} />
          </Field>
          <Field label="Cierra">
            <Input type="time" value={closes} onChange={(e) => setCloses(e.target.value)} />
          </Field>
        </div>
        <fieldset className="space-y-1">
          <legend className="text-[12.5px] font-medium text-muted">Días laborables</legend>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((label, index) => (
              <label
                key={label}
                className="flex items-center gap-1 rounded-lg border border-edge px-2 py-1 text-sm"
              >
                <input
                  type="checkbox"
                  checked={days.includes(index)}
                  onChange={(e) =>
                    setDays((current) =>
                      e.target.checked
                        ? [...current, index].sort((a, b) => a - b)
                        : current.filter((d) => d !== index),
                    )
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        {save.error instanceof ApiError ? (
          <Alert tone="danger">{errorMessage(save.error.data)}</Alert>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} disabled={!days.length || save.isPending}>
            Guardar horario
          </Button>
        </div>
      </div>
    </Modal>
  )
}

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
  const [hoursFor, setHoursFor] = useState<Branch | null>(null)
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
        setMessage(errorMessage(data, 'Revisa los datos.'))
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge text-left text-[12.5px] text-muted">
                  <th className="py-2 pr-3">Código</th>
                  <th className="py-2 pr-3">Nombre</th>
                  <th className="py-2 pr-3">Dirección</th>
                  <th className="py-2 pr-3">Horario</th>
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
                      <button
                        type="button"
                        className="text-left text-brand-700 hover:underline"
                        onClick={() => setHoursFor(branch)}
                      >
                        {hoursText(branch)}
                      </button>
                    </td>
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
                        onClick={() =>
                          toggle.mutate({ id: branch.id, is_active: !branch.is_active })
                        }
                        disabled={toggle.isPending}
                      >
                        {branch.is_active ? 'Desactivar' : 'Activar'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
      {hoursFor ? <HoursDialog branch={hoursFor} onClose={() => setHoursFor(null)} /> : null}
    </>
  )
}
