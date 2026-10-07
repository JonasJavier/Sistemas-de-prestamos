import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { usePrompt } from '../../components/Dialog'
import { phoneText } from '../../lib/format'

import {
  createReference,
  createRelative,
  deleteRelative,
  listReferences,
  listRelatives,
  verifyReference,
} from '../../api/customers'
import { Button, Card, Field, Input } from '../../components/ui'

export function FamilyTab({ customerId }: { customerId: string }) {
  return (
    <div className="space-y-4">
      <RelativesCard customerId={customerId} />
      <ReferencesCard customerId={customerId} />
    </div>
  )
}

function RelativesCard({ customerId }: { customerId: string }) {
  const queryClient = useQueryClient()
  const relatives = useQuery({
    queryKey: ['relatives', customerId],
    queryFn: () => listRelatives(customerId),
  })
  const [form, setForm] = useState({ name: '', relationship: '', phone: '' })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['relatives', customerId] })

  const add = useMutation({
    mutationFn: () => createRelative({ customer: customerId, ...form }),
    onSuccess: () => {
      setForm({ name: '', relationship: '', phone: '' })
      refresh()
    },
  })
  const remove = useMutation({ mutationFn: deleteRelative, onSuccess: refresh })

  return (
    <Card>
      <h3 className="mb-3 text-base font-semibold">Familiares</h3>
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Field label="Nombre">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Parentesco">
          <Input
            value={form.relationship}
            onChange={(e) => setForm({ ...form, relationship: e.target.value })}
          />
        </Field>
        <Field label="Teléfono">
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <div className="flex items-end">
          <Button
            variant="secondary"
            onClick={() => add.mutate()}
            disabled={add.isPending || !form.name || !form.relationship}
          >
            Agregar
          </Button>
        </div>
      </div>
      <ul className="space-y-1 text-sm">
        {relatives.data?.results.map((relative) => (
          <li key={relative.id} className="flex items-center justify-between">
            <span>
              <span className="font-medium">{relative.name}</span>{' '}
              <span className="text-muted">
                · {relative.relationship} {relative.phone ? `· ${phoneText(relative.phone)}` : ''}
              </span>
            </span>
            <button
              type="button"
              className="text-[12.5px] text-danger-600 hover:underline"
              onClick={() => remove.mutate(relative.id)}
            >
              Quitar
            </button>
          </li>
        ))}
        {relatives.data && relatives.data.results.length === 0 ? (
          <li className="text-muted">Sin familiares registrados.</li>
        ) : null}
      </ul>
    </Card>
  )
}

function ReferencesCard({ customerId }: { customerId: string }) {
  const [dialog, ask] = usePrompt()
  const queryClient = useQueryClient()
  const references = useQuery({
    queryKey: ['references', customerId],
    queryFn: () => listReferences(customerId),
  })
  const [form, setForm] = useState({ name: '', phone: '', relationship: '' })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['references', customerId] })

  const add = useMutation({
    mutationFn: () => createReference({ customer: customerId, ...form }),
    onSuccess: () => {
      setForm({ name: '', phone: '', relationship: '' })
      refresh()
    },
  })
  const verify = useMutation({
    mutationFn: ({ id, result }: { id: string; result: string }) => verifyReference(id, result),
    onSuccess: refresh,
  })

  return (
    <Card>
      {dialog}
      <h3 className="mb-3 text-base font-semibold">Referencias</h3>
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Field label="Nombre">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Teléfono">
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="Relación">
          <Input
            value={form.relationship}
            onChange={(e) => setForm({ ...form, relationship: e.target.value })}
          />
        </Field>
        <div className="flex items-end">
          <Button
            variant="secondary"
            onClick={() => add.mutate()}
            disabled={add.isPending || !form.name || !form.phone}
          >
            Agregar
          </Button>
        </div>
      </div>
      <ul className="space-y-2 text-sm">
        {references.data?.results.map((reference) => (
          <li key={reference.id} className="flex items-start justify-between gap-3">
            <span>
              <span className="font-medium">{reference.name}</span>{' '}
              <span className="text-muted">· {phoneText(reference.phone)}</span>
              {reference.verified_at ? (
                <span className="mt-0.5 block text-[12.5px] text-success-600">
                  Verificada por {reference.verified_by_email}: {reference.verification_result}
                </span>
              ) : (
                <span className="mt-0.5 block text-[12.5px] text-warning-700">Sin verificar</span>
              )}
            </span>
            {!reference.verified_at ? (
              <Button
                variant="secondary"
                onClick={async () => {
                  const result = await ask({
                    title: `Verificar a ${reference.name}`,
                    label: 'Resultado de la llamada',
                    type: 'textarea',
                    required: true,
                    confirmText: 'Marcar verificada',
                  })
                  if (result) verify.mutate({ id: reference.id, result })
                }}
                disabled={verify.isPending}
              >
                Verificar
              </Button>
            ) : null}
          </li>
        ))}
        {references.data && references.data.results.length === 0 ? (
          <li className="text-muted">Sin referencias registradas.</li>
        ) : null}
      </ul>
    </Card>
  )
}
