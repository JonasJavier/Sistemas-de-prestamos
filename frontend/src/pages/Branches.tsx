import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { createBranch, listBranches, updateBranch, type Branch } from '../api/accounts'
import { ApiError } from '../api/client'
import { usePrompt } from '../components/Dialog'
import { Modal } from '../components/Modal'
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  LoadError,
  PageHeader,
  Spinner,
} from '../components/ui'
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
      <div className="w-full max-w-md space-y-3 rounded-2xl bg-surface p-5 shadow-xl">
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

  const [dialog, ask] = usePrompt()
  const toggle = useMutation({
    meta: { inlineError: true },
    mutationFn: async ({ branch, is_active }: { branch: Branch; is_active: boolean }) => {
      if (!is_active) {
        const confirmed = await ask({
          title: `Desactivar la sucursal ${branch.name}`,
          description:
            'Deja de recibir operaciones nuevas hasta que la actives de nuevo; su historial se conserva.',
          confirmText: 'Desactivar',
          danger: true,
        })
        if (confirmed === null) return null
      }
      return updateBranch(branch.id, { is_active })
    },
    onSuccess: invalidate,
  })

  return (
    <>
      {dialog}
      <PageHeader
        title="Sucursales"
        subtitle="Cada sucursal numera sus documentos con su código."
      />
      {/* What exists first; the form to add one after it. */}
      {toggle.error instanceof ApiError ? (
        <Alert tone="danger">{errorMessage(toggle.error.data)}</Alert>
      ) : null}
      <Card>
        <h2 className="mb-2 text-base font-semibold">Tus sucursales</h2>
        {branches.isPending ? <Spinner /> : null}
        {branches.error ? <LoadError error={branches.error} /> : null}
        {branches.data ? (
          // Rows, not a table: on a phone each branch keeps its button in sight.
          <ul className="divide-y divide-edge text-sm">
            {branches.data.results.map((branch) => (
              <li
                key={branch.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3"
              >
                <div className="min-w-0">
                  <div className="font-semibold">
                    <span className="tabular-nums text-muted">{branch.code}</span> {branch.name}
                  </div>
                  {branch.address ? (
                    <div className="text-[12.5px] text-muted">{branch.address}</div>
                  ) : null}
                  <button
                    type="button"
                    className="text-left text-[12.5px] text-brand-700 hover:underline"
                    onClick={() => setHoursFor(branch)}
                  >
                    Horario: {hoursText(branch)}
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={branch.is_active ? 'brand' : 'warning'}>
                    {branch.is_active ? 'Activa' : 'Inactiva'}
                  </Badge>
                  <Button
                    variant="secondary"
                    onClick={() => toggle.mutate({ branch, is_active: !branch.is_active })}
                    disabled={toggle.isPending}
                  >
                    {branch.is_active ? 'Desactivar' : 'Activar'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
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
      {hoursFor ? <HoursDialog branch={hoursFor} onClose={() => setHoursFor(null)} /> : null}
    </>
  )
}
