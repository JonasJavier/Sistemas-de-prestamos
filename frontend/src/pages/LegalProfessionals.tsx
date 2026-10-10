import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { ApiError } from '../api/client'
import {
  listProfessionals,
  type Professional,
  PROFESSIONAL_KINDS,
  saveProfessional,
} from '../api/legal'
import { Modal } from '../components/Modal'
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  PageHeader,
  RowList,
  Select,
  Spinner,
} from '../components/ui'
import { errorMessage } from '../lib/format'
import { notify } from '../lib/toast'

type Draft = Partial<Professional>

function ProfessionalDialog({
  draft,
  lawyers,
  onClose,
}: {
  draft: Draft
  lawyers: Professional[]
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<Draft>({ kind: 'lawyer', ...draft })
  const set = (key: keyof Draft, value: unknown) => setForm({ ...form, [key]: value })
  const save = useMutation({
    meta: { inlineError: true },
    mutationFn: () => saveProfessional(form),
    onSuccess: () => {
      notify('Profesional guardado.', 'success')
      void queryClient.invalidateQueries({ queryKey: ['legal-professionals'] })
      onClose()
    },
  })
  const needsLicense = form.kind === 'lawyer' || form.kind === 'notary'
  return (
    <Modal onClose={onClose} labelledBy="professional-title">
      <div className="max-h-[92vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-2xl bg-surface p-5 shadow-xl">
        <h2 id="professional-title" className="text-lg font-semibold">
          {draft.id ? 'Editar profesional' : 'Nuevo profesional'}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tipo">
            <Select
              value={form.kind}
              disabled={Boolean(draft.id)}
              onChange={(e) => set('kind', e.target.value)}
            >
              {PROFESSIONAL_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nombre">
            <Input value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Cédula">
            <Input value={form.document ?? ''} onChange={(e) => set('document', e.target.value)} />
          </Field>
          <Field label={needsLicense ? 'Matrícula' : 'Matrícula (opcional)'}>
            <Input value={form.license ?? ''} onChange={(e) => set('license', e.target.value)} />
          </Field>
          <Field label="Teléfono">
            <Input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label="Dirección o estudio">
            <Input value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} />
          </Field>
        </div>
        {form.kind === 'witness' ? (
          <Field label="Trabaja con el abogado">
            <Select
              value={form.parent ?? ''}
              onChange={(e) => set('parent', e.target.value || null)}
            >
              <option value="">Elegir…</option>
              {lawyers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {draft.id ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active ?? true}
              onChange={(e) => set('is_active', e.target.checked)}
            />
            Activo
          </label>
        ) : null}
        {save.error instanceof ApiError ? (
          <Alert tone="danger">{errorMessage(save.error.data)}</Alert>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            Guardar
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** P78 · Profesionales legales (decision 095): one catalog for the cases. */
export function LegalProfessionalsPage() {
  const list = useQuery({ queryKey: ['legal-professionals'], queryFn: listProfessionals })
  const [editing, setEditing] = useState<Draft>()
  const lawyers = (list.data ?? []).filter((p) => p.kind === 'lawyer' && p.is_active)
  return (
    <>
      <PageHeader
        title="Profesionales legales"
        subtitle="Abogados, notarios, alguaciles y testigos de los casos legales y sus documentos."
        actions={<Button onClick={() => setEditing({})}>Nuevo profesional</Button>}
      />
      {list.isPending ? (
        <Spinner />
      ) : list.data?.length ? (
        <RowList>
          {list.data.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="info">{p.kind_label}</Badge>
                  <span className="font-semibold">{p.name}</span>
                  {p.is_active ? null : <Badge tone="neutral">Inactivo</Badge>}
                </div>
                <div className="text-[12.5px] text-muted">
                  {[
                    p.license && `matrícula ${p.license}`,
                    p.phone,
                    p.parent && `testigo de ${lawyers.find((l) => l.id === p.parent)?.name ?? '—'}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setEditing(p)}>
                Editar
              </Button>
            </li>
          ))}
        </RowList>
      ) : (
        <EmptyState>Agrega el abogado de la empresa para abrir casos legales.</EmptyState>
      )}
      {editing ? (
        <ProfessionalDialog
          draft={editing}
          lawyers={lawyers}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
    </>
  )
}
