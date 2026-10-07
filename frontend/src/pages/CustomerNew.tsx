import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { listBranches } from '../api/accounts'
import { ApiError } from '../api/client'
import {
  createCustomer,
  listProvinces,
  type CustomerListItem,
  type CustomerPayload,
} from '../api/customers'
import { Alert, Button, buttonClass, Card, Field, Input, PageHeader } from '../components/ui'

const schema = z
  .object({
    kind: z.enum(['person', 'company']),
    document_type: z.enum(['cedula', 'rnc', 'passport']),
    document_number: z.string().min(5, 'Escribe el documento.'),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    legal_name: z.string().optional(),
    phone: z.string().min(7, 'Escribe el teléfono.'),
    email: z.union([z.email('Correo inválido.'), z.literal('')]).optional(),
    address_line: z.string().optional(),
    province: z.string().optional(),
    home_branch: z.string().min(1, 'Elige la sucursal.'),
  })
  .superRefine((data, ctx) => {
    if (data.kind === 'person') {
      if (!data.first_name)
        ctx.addIssue({ code: 'custom', path: ['first_name'], message: 'Escribe el nombre.' })
      if (!data.last_name)
        ctx.addIssue({ code: 'custom', path: ['last_name'], message: 'Escribe el apellido.' })
    } else if (!data.legal_name) {
      ctx.addIssue({ code: 'custom', path: ['legal_name'], message: 'Escribe la razón social.' })
    }
  })

type FormData = z.infer<typeof schema>

const selectClasses =
  'h-11 w-full rounded-lg border border-edge bg-surface px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent-500 sm:h-9'

export function CustomerNewPage() {
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<CustomerListItem[] | null>(null)
  const branches = useQuery({ queryKey: ['branches'], queryFn: listBranches })
  const provinces = useQuery({ queryKey: ['provinces'], queryFn: listProvinces })

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { kind: 'person', document_type: 'cedula' },
  })
  const kind = form.watch('kind')

  // One active branch (most small lenders): nothing to choose.
  const activeBranches = branches.data?.results.filter((branch) => branch.is_active)
  useEffect(() => {
    if (activeBranches?.length === 1 && !form.getValues('home_branch')) {
      form.setValue('home_branch', activeBranches[0].id)
    }
  }, [activeBranches, form])

  const create = useMutation({
    mutationFn: (payload: CustomerPayload) => createCustomer(payload),
    onSuccess: (customer) => navigate({ to: '/clientes/$id', params: { id: customer.id } }),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        const data = error.data as { candidates: CustomerListItem[] }
        setCandidates(data.candidates)
        setServerError(null)
        return
      }
      if (error instanceof ApiError && error.status === 400 && error.data) {
        const data = error.data as Record<string, string[]>
        setServerError(Object.values(data).flat()[0] ?? 'Revisa los datos.')
      } else if (error instanceof ApiError && error.status === 403) {
        setServerError('Tu rol no permite crear clientes.')
      } else {
        setServerError('No se pudo crear el cliente.')
      }
      setCandidates(null)
    },
  })

  const submit = (data: FormData, confirm = false) => {
    create.mutate({
      ...data,
      email: data.email || undefined,
      province: data.province || undefined,
      confirm_duplicate: confirm,
    })
  }

  return (
    <>
      <PageHeader
        back={
          <Link to="/clientes" className="hover:underline">
            ← Clientes
          </Link>
        }
        title="Nuevo cliente"
        subtitle="Antes de crearlo revisamos si ya existe, por documento o por nombre."
      />
      <Card>
        <form
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          onSubmit={form.handleSubmit((data) => submit(data))}
          noValidate
        >
          {serverError ? (
            <div className="sm:col-span-2">
              <Alert tone="danger">{serverError}</Alert>
            </div>
          ) : null}

          {candidates ? (
            <div className="space-y-2 sm:col-span-2">
              <Alert tone="warning">
                Hay clientes parecidos (mismo teléfono y nombre similar). Revisa antes de crear
                un duplicado:
              </Alert>
              <ul className="space-y-1 text-sm">
                {candidates.map((candidate) => (
                  <li key={candidate.id}>
                    <span className="font-medium">{candidate.display_name}</span>{' '}
                    <span className="text-muted">
                      · {candidate.document_number} · {candidate.phone}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={form.handleSubmit((data) => submit(data, true))}
                  disabled={create.isPending}
                >
                  No es el mismo: crear de todos modos
                </Button>
              </div>
            </div>
          ) : null}

          <Field label="Tipo de cliente">
            <select className={selectClasses} {...form.register('kind')}>
              <option value="person">Persona</option>
              <option value="company">Empresa</option>
            </select>
          </Field>
          <Field label="Tipo de documento">
            <select className={selectClasses} {...form.register('document_type')}>
              {kind === 'person' ? (
                <>
                  <option value="cedula">Cédula</option>
                  <option value="passport">Pasaporte</option>
                </>
              ) : (
                <option value="rnc">RNC</option>
              )}
            </select>
          </Field>
          <Field label="Número de documento" error={form.formState.errors.document_number?.message}>
            <Input placeholder="001-1234567-8" {...form.register('document_number')} />
          </Field>
          <Field label="Sucursal" error={form.formState.errors.home_branch?.message}>
            <select className={selectClasses} {...form.register('home_branch')}>
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

          {kind === 'person' ? (
            <>
              <Field label="Nombres" error={form.formState.errors.first_name?.message}>
                <Input {...form.register('first_name')} />
              </Field>
              <Field label="Apellidos" error={form.formState.errors.last_name?.message}>
                <Input {...form.register('last_name')} />
              </Field>
            </>
          ) : (
            <div className="sm:col-span-2">
              <Field label="Razón social" error={form.formState.errors.legal_name?.message}>
                <Input {...form.register('legal_name')} />
              </Field>
            </div>
          )}

          <Field label="Teléfono" error={form.formState.errors.phone?.message}>
            <Input type="tel" {...form.register('phone')} />
          </Field>
          <Field label="Correo (opcional)" error={form.formState.errors.email?.message}>
            <Input type="email" {...form.register('email')} />
          </Field>
          <Field label="Dirección (opcional)">
            <Input {...form.register('address_line')} />
          </Field>
          <Field label="Provincia (opcional)">
            <select className={selectClasses} {...form.register('province')}>
              <option value="">Elegir…</option>
              {provinces.data?.map((province) => (
                <option key={province.id} value={province.id}>
                  {province.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creando…' : 'Crear cliente'}
            </Button>
            <Link to="/clientes" className={buttonClass('secondary')}>
              Cancelar
            </Link>
          </div>
        </form>
      </Card>
    </>
  )
}
