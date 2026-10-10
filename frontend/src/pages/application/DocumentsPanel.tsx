import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { ApiError } from '../../api/client'
import {
  applicationFileLink,
  unverifyRequirement,
  updateApplication,
  uploadApplicationFile,
  verifyRequirement,
  type Application,
} from '../../api/origination'
import { Alert, Button, Card, Field, FilePicker, Input, Select } from '../../components/ui'
import { day, errorMessage, moment } from '../../lib/format'
import { DateInput } from '../../components/DateInput'

/** Product checklist, external bureau (decision 026) and private files. */
export function DocumentsPanel({
  application,
  canVerify,
  onChange,
}: {
  application: Application
  canVerify: boolean
  onChange: () => void
}) {
  const editable = application.can.edit
  const [provider, setProvider] = useState(application.bureau_provider)
  const [score, setScore] = useState(application.bureau_score?.toString() ?? '')
  const [bureauDate, setBureauDate] = useState(application.bureau_date ?? '')
  const [upload, setUpload] = useState<File | null>(null)
  const [uploadKind, setUploadKind] = useState<'bureau_report' | 'document'>('bureau_report')

  const toggle = useMutation({
    meta: { inlineError: true },
    mutationFn: ({ id, verified }: { id: string; verified: boolean }) =>
      verified ? unverifyRequirement(id) : verifyRequirement(id),
    onSuccess: onChange,
  })
  const saveBureau = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      updateApplication(application.id, {
        bureau_provider: provider,
        bureau_score: score ? Number(score) : null,
        bureau_date: bureauDate || null,
      }),
    onSuccess: onChange,
  })
  const send = useMutation({
    meta: { inlineError: true },
    mutationFn: () => uploadApplicationFile(application.id, uploadKind, upload!),
    onSuccess: () => {
      setUpload(null)
      onChange()
    },
  })
  const open = useMutation({
    mutationFn: applicationFileLink,
    onSuccess: ({ url }) => window.open(url, '_blank', 'noopener'),
  })
  const error = [toggle.error, saveBureau.error, send.error].find((e) => e instanceof ApiError) as
    ApiError | undefined

  return (
    <Card className="space-y-4">
      <h2 className="text-base font-semibold">Documentos y buró</h2>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Documentos requeridos por el producto</h3>
        <ul className="divide-y divide-edge rounded-lg border border-edge">
          {application.requirements.map((req) => {
            const verified = Boolean(req.verified_at)
            return (
              <li
                key={req.id}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <span>
                  <span className={verified ? 'text-success-600' : 'text-muted'}>
                    {verified ? '✓' : '○'}
                  </span>{' '}
                  {req.name}
                  {verified ? (
                    <span className="ml-1 text-[12px] text-muted">
                      · verificó {req.verified_by_name} el {moment(req.verified_at)}
                    </span>
                  ) : null}
                </span>
                {canVerify ? (
                  <button
                    type="button"
                    className="text-[12.5px] font-medium text-brand-700 hover:underline"
                    onClick={() => toggle.mutate({ id: req.id, verified })}
                  >
                    {verified ? 'Desmarcar' : 'Marcar verificado'}
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Buró de crédito</h3>
        {editable ? (
          <form
            className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_110px_160px_auto]"
            onSubmit={(e) => {
              e.preventDefault()
              saveBureau.mutate()
            }}
          >
            <Field label="Proveedor">
              <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
                <option value="">Sin consultar</option>
                <option value="datacredito">DataCrédito</option>
                <option value="transunion">TransUnion</option>
              </Select>
            </Field>
            <Field label="Puntuación">
              <Input inputMode="numeric" value={score} onChange={(e) => setScore(e.target.value)} />
            </Field>
            <Field label="Fecha de consulta">
              <DateInput value={bureauDate} onChange={setBureauDate} />
            </Field>
            <Button type="submit" variant="secondary" disabled={saveBureau.isPending}>
              Guardar
            </Button>
          </form>
        ) : (
          <p className="text-sm">
            {application.bureau_provider
              ? `${application.bureau_provider === 'datacredito' ? 'DataCrédito' : 'TransUnion'} · ${application.bureau_score ?? '—'} puntos · ${day(application.bureau_date)}`
              : 'Sin consulta registrada.'}
          </p>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Archivos de la solicitud</h3>
        {application.files.length === 0 ? (
          <p className="text-sm text-muted">Sin archivos.</p>
        ) : (
          <ul className="divide-y divide-edge rounded-lg border border-edge">
            {application.files.map((file) => (
              <li
                key={file.id}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <span>
                  {file.kind === 'bureau_report' ? 'Reporte de buró' : 'Documento'}
                  <span className="ml-1 text-[12px] text-muted">
                    · {Math.ceil(file.size / 1024)} KB · {moment(file.created_at)}
                  </span>
                </span>
                <button
                  type="button"
                  className="text-[12.5px] font-medium text-brand-700 hover:underline"
                  onClick={() => open.mutate(file.id)}
                >
                  Ver
                </button>
              </li>
            ))}
          </ul>
        )}
        {canVerify ? (
          <form
            className="mt-2 grid grid-cols-1 items-end gap-2 sm:grid-cols-[160px_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault()
              send.mutate()
            }}
          >
            <Field label="Tipo">
              <Select
                value={uploadKind}
                onChange={(e) => setUploadKind(e.target.value as typeof uploadKind)}
              >
                <option value="bureau_report">Reporte de buró</option>
                <option value="document">Documento</option>
              </Select>
            </Field>
            <Field label="Archivo (PDF, JPG, PNG o HEIC, hasta 10 MB)">
              <FilePicker file={upload} onPick={setUpload} accept=".pdf,.jpg,.jpeg,.png,.heic" />
            </Field>
            <Button type="submit" variant="secondary" disabled={!upload || send.isPending}>
              Subir
            </Button>
          </form>
        ) : null}
      </div>
      {error ? <Alert tone="danger">{errorMessage(error.data)}</Alert> : null}
    </Card>
  )
}
