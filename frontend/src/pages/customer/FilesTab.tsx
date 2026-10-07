import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { dateOf } from '../../lib/format'

import { ApiError } from '../../api/client'
import {
  deleteFile,
  fileDownloadUrl,
  getFileLink,
  listFiles,
  uploadFile,
} from '../../api/customers'
import { Alert, Card, Field } from '../../components/ui'

const KINDS = [
  ['id_front', 'Cédula (frente)'],
  ['id_back', 'Cédula (dorso)'],
  ['income_proof', 'Comprobante de ingresos'],
  ['photo', 'Foto'],
  ['consent', 'Consentimiento firmado'],
  ['other', 'Otro'],
] as const

const selectClasses =
  'h-11 w-full rounded-lg border border-edge bg-surface px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent-500 sm:h-9'

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function FilesTab({ customerId }: { customerId: string }) {
  const queryClient = useQueryClient()
  const files = useQuery({ queryKey: ['files', customerId], queryFn: () => listFiles(customerId) })
  const [kind, setKind] = useState<string>('id_front')
  const [message, setMessage] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['files', customerId] })

  const upload = useMutation({
    mutationFn: (file: File) => uploadFile(customerId, kind, file),
    onSuccess: () => {
      setMessage(null)
      if (inputRef.current) inputRef.current.value = ''
      refresh()
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 400 && error.data) {
        const data = error.data as Record<string, string[]>
        setMessage(Object.values(data).flat()[0] ?? 'Archivo rechazado.')
      } else {
        setMessage('No se pudo subir el archivo.')
      }
    },
  })
  const remove = useMutation({ mutationFn: deleteFile, onSuccess: refresh })
  const share = useMutation({
    mutationFn: getFileLink,
    onSuccess: async (data) => {
      try {
        await navigator.clipboard.writeText(data.url)
        setMessage('Enlace temporal copiado (vence en 5 minutos).')
      } catch {
        setMessage(`Enlace temporal (vence en 5 minutos): ${data.url}`)
      }
    },
  })

  return (
    <Card>
      <h3 className="mb-1 text-base font-semibold">Archivos privados</h3>
      <p className="mb-3 text-[12.5px] text-muted">
        PDF, JPG, PNG o HEIC, hasta 10 MB. Cada apertura queda registrada en la auditoría.
      </p>
      {message ? <Alert tone="info">{message}</Alert> : null}
      <div className="mt-3 grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
        <Field label="Tipo de archivo">
          <select className={selectClasses} value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <input
            ref={inputRef}
            type="file"
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

      <ul className="mt-4 space-y-2 text-sm">
        {files.data?.results.map((file) => (
          <li key={file.id} className="flex items-center justify-between gap-3">
            <span>
              <span className="font-medium">
                {KINDS.find(([value]) => value === file.kind)?.[1] ?? file.kind}
              </span>{' '}
              <span className="text-muted tabular-nums">
                · {formatSize(file.size)} · {dateOf(file.created_at)}
              </span>
            </span>
            <span className="flex gap-2">
              <a
                href={fileDownloadUrl(file.id)}
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
                onClick={() => remove.mutate(file.id)}
              >
                Quitar
              </button>
            </span>
          </li>
        ))}
        {files.data && files.data.results.length === 0 ? (
          <li className="text-muted">Sin archivos todavía.</li>
        ) : null}
      </ul>
    </Card>
  )
}
