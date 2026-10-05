import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { ApiError } from '../../api/client'
import {
  getBusiness,
  getEmployment,
  putBusiness,
  putEmployment,
  type Business,
  type Employment,
} from '../../api/customers'
import { Alert, Button, Card, Field, Input } from '../../components/ui'

async function orNull<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

export function IncomeTab({ customerId }: { customerId: string }) {
  return (
    <div className="space-y-4">
      <EmploymentCard customerId={customerId} />
      <BusinessCard customerId={customerId} />
    </div>
  )
}

function EmploymentCard({ customerId }: { customerId: string }) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['employment', customerId],
    queryFn: () => orNull(getEmployment(customerId)),
  })
  const [form, setForm] = useState<Partial<Employment>>({})
  useEffect(() => {
    if (query.data) setForm(query.data)
  }, [query.data])

  const save = useMutation({
    mutationFn: () => putEmployment(customerId, form),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employment', customerId] }),
  })

  return (
    <Card>
      <h3 className="mb-3 text-base font-semibold">Datos laborales</h3>
      {save.isError ? <Alert tone="danger">No se pudo guardar.</Alert> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Empleador">
          <Input
            value={form.employer ?? ''}
            onChange={(e) => setForm({ ...form, employer: e.target.value })}
          />
        </Field>
        <Field label="Cargo">
          <Input
            value={form.position ?? ''}
            onChange={(e) => setForm({ ...form, position: e.target.value })}
          />
        </Field>
        <Field label="Sueldo mensual (RD$)">
          <Input
            inputMode="decimal"
            value={form.monthly_salary ?? ''}
            onChange={(e) => setForm({ ...form, monthly_salary: e.target.value })}
          />
        </Field>
        <Field label="Teléfono del empleador">
          <Input
            value={form.employer_phone ?? ''}
            onChange={(e) => setForm({ ...form, employer_phone: e.target.value })}
          />
        </Field>
      </div>
      <div className="mt-3">
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending || !form.employer}
          variant="secondary"
        >
          {save.isPending ? 'Guardando…' : 'Guardar laborales'}
        </Button>
      </div>
    </Card>
  )
}

function BusinessCard({ customerId }: { customerId: string }) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['business', customerId],
    queryFn: () => orNull(getBusiness(customerId)),
  })
  const [form, setForm] = useState<Partial<Business>>({})
  useEffect(() => {
    if (query.data) setForm(query.data)
  }, [query.data])

  const save = useMutation({
    mutationFn: () => putBusiness(customerId, form),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['business', customerId] }),
  })

  const available =
    form.monthly_sales && form.monthly_expenses
      ? Number(form.monthly_sales) - Number(form.monthly_expenses)
      : null

  return (
    <Card>
      <h3 className="mb-3 text-base font-semibold">Negocio (microcrédito)</h3>
      {save.isError ? <Alert tone="danger">No se pudo guardar.</Alert> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nombre del negocio">
          <Input
            value={form.name ?? ''}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="Actividad">
          <Input
            value={form.activity ?? ''}
            onChange={(e) => setForm({ ...form, activity: e.target.value })}
          />
        </Field>
        <Field label="Ventas mensuales (RD$)">
          <Input
            inputMode="decimal"
            value={form.monthly_sales ?? ''}
            onChange={(e) => setForm({ ...form, monthly_sales: e.target.value })}
          />
        </Field>
        <Field label="Gastos mensuales (RD$)">
          <Input
            inputMode="decimal"
            value={form.monthly_expenses ?? ''}
            onChange={(e) => setForm({ ...form, monthly_expenses: e.target.value })}
          />
        </Field>
      </div>
      {available !== null && !Number.isNaN(available) ? (
        <p className="mt-2 text-sm text-muted">
          Disponible estimado:{' '}
          <strong className="tabular-nums text-ink">
            RD$ {available.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
          </strong>
        </p>
      ) : null}
      <div className="mt-3">
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending || !form.name}
          variant="secondary"
        >
          {save.isPending ? 'Guardando…' : 'Guardar negocio'}
        </Button>
      </div>
    </Card>
  )
}
