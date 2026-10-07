import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { ApiError } from '../api/client'
import {
  deletePrivateFile,
  listPrivateFiles,
  privateFileLink,
  privateFileUrl,
  uploadPrivateFile,
  type FileOwner,
} from '../api/customers'
import { dateOf, errorMessage } from '../lib/format'
import { usePrompt } from './Dialog'
import { Alert, Field, Select } from './ui'

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** Private files of a customer or a collateral (doc 06 - 7): validated by
 * content on the server, opened with the session or a 5-minute link, every
 * opening audited. */
export function PrivateFiles({
  owner,
  kinds,
}: {
  owner: FileOwner
  kinds: readonly (readonly [string, string])[]
}) {
  const queryClient = useQueryClient()
  const queryKey = ['private-files', owner.field, owner.id]
  const files = useQuery({ queryKey, queryFn: () => listPrivateFiles(owner) })
  const [kind, setKind] = useState<string>(kinds[0][0])
  const [message, setMessage] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [dialog, ask] = usePrompt()
  const refresh = () => queryClient.invalidateQueries({ queryKey })

  const upload = useMutation({
    mutationFn: (file: File) => uploadPrivateFile(owner, kind, file),
    onSuccess: () => {
      setMessage(null)
      if (inputRef.current) inputRef.current.value = ''
      refresh()
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 400 && error.data) {
        const data = error.data as Record<string, string[]>
        setMessage(errorMessage(data, 'Archivo rechazado.'))
      } else {
        setMessage('No se pudo subir el archivo.')
      }
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => deletePrivateFile(owner, id),
    onSuccess: refresh,
  })
  const share = useMutation({
    mutationFn: (id: string) => privateFileLink(owner, id),
    onSuccess: async (data) => {
      try {
        await navigator.clipboard.writeText(data.url)
        setMessage('Enlace temporal copiado (vence en 5 minutos).')
      } catch {
        setMessage(`Enlace temporal (vence en 5 minutos): ${data.url}`)
      }
    },
  })
  const kindText = (value: string) => kinds.find(([key]) => key === value)?.[1] ?? value

  return (
    <div className="space-y-3">
      {dialog}
      <p className="text-[12.5px] text-muted">
        PDF, JPG, PNG o HEIC, hasta 10 MB. Cada apertura queda registrada en la auditoría.
      </p>
      {message ? <Alert tone="info">{message}</Alert> : null}
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
        <Field label="Tipo de archivo">
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            {kinds.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <input
            ref={inputRef}
            type="file"
            aria-label="Archivo para subir"
            accept=".pdf,.jpg,.jpeg,.png,.heic"
            className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand-700 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-on-brand hover:file:bg-brand-800"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) upload.mutate(file)
            }}
            disabled={upload.isPending}
          />
        </div>
      </div>

      <ul className="divide-y divide-edge text-sm">
        {files.data?.results.map((file) => (
          <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              <span className="font-medium">{kindText(file.kind)}</span>{' '}
              <span className="text-muted tabular-nums">
                · {formatSize(file.size)} · {dateOf(file.created_at)}
              </span>
            </span>
            <span className="flex gap-3">
              <a
                href={privateFileUrl(owner, file.id)}
                target="_blank"
                rel="noreferrer"
                className="text-[12.5px] font-medium text-brand-700 hover:underline"
              >
                Ver
              </a>
              <button
                type="button"
                className="text-[12.5px] font-medium text-brand-700 hover:underline"
                onClick={() => share.mutate(file.id)}
              >
                Enlace 5 min
              </button>
              <button
                type="button"
                className="text-[12.5px] text-danger-600 hover:underline"
                onClick={async () => {
                  const ok = await ask({
                    title: `¿Quitar «${kindText(file.kind)}»?`,
                    description: 'El archivo deja de estar disponible; el retiro queda auditado.',
                    confirmText: 'Quitar',
                    danger: true,
                  })
                  if (ok !== null) remove.mutate(file.id)
                }}
              >
                Quitar
              </button>
            </span>
          </li>
        ))}
        {files.data && files.data.results.length === 0 ? (
          <li className="py-2 text-muted">Sin archivos todavía.</li>
        ) : null}
      </ul>
    </div>
  )
}
