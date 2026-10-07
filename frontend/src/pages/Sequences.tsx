import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { api, ApiError } from '../api/client'
import { Alert, Button, Card, EmptyState, Input, PageHeader, Spinner } from '../components/ui'
import { errorMessage } from '../lib/format'

interface SequenceRow {
  id: string
  branch_code: string
  doc_type: string
  doc_type_label: string
  prefix: string
  next_number: string
}

/** P75 «Numeraciones»: per-branch prefixes; the counter is never editable
 * so numbering stays gapless (decision 030). */
export function SequencesPage() {
  const queryClient = useQueryClient()
  const rows = useQuery({
    queryKey: ['sequences'],
    queryFn: (): Promise<SequenceRow[]> => api('/api/v1/numeraciones/'),
  })
  const [editing, setEditing] = useState<string | null>(null)
  const [prefix, setPrefix] = useState('')
  const save = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      api(`/api/v1/numeraciones/${editing}/`, { method: 'PATCH', body: { prefix } }),
    onSuccess: () => {
      setEditing(null)
      queryClient.invalidateQueries({ queryKey: ['sequences'] })
    },
  })

  return (
    <>
      <PageHeader
        title="Numeraciones"
        subtitle="Cada sucursal numera sus documentos sin saltos. La numeración nace con el primer documento; el prefijo solo cambia los números futuros."
      />
      {save.error instanceof ApiError ? (
        <Alert tone="danger">{errorMessage(save.error.data)}</Alert>
      ) : null}
      {rows.isPending ? (
        <Spinner />
      ) : rows.data && rows.data.length > 0 ? (
        <Card className="!p-0">
          <ul className="divide-y divide-edge">
            {rows.data.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <span>
                  <span className="font-medium">{row.doc_type_label}</span>
                  <span className="ml-2 text-muted">sucursal {row.branch_code}</span>
                </span>
                {editing === row.id ? (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault()
                      save.mutate()
                    }}
                  >
                    <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} />
                    <Button type="submit" disabled={save.isPending}>
                      Guardar
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                      Cancelar
                    </Button>
                  </form>
                ) : (
                  <span className="flex items-center gap-3">
                    <span className="text-muted">Próximo:</span>
                    <span className="font-semibold tabular-nums">{row.next_number}</span>
                    <button
                      type="button"
                      className="text-[12.5px] font-medium text-brand-700 hover:underline"
                      onClick={() => {
                        setEditing(row.id)
                        setPrefix(row.prefix)
                      }}
                    >
                      Cambiar prefijo
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState>
          Las numeraciones aparecen cuando se emite el primer documento de cada tipo.
        </EmptyState>
      )}
    </>
  )
}
