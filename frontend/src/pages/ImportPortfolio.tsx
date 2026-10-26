import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useRef, useState } from 'react'

import { ApiError } from '../api/client'
import { type ImportKind, type ImportReport, runImport, templateUrl } from '../api/importing'
import { Alert, Badge, Button, PageHeader } from '../components/ui'
import { buttonClass } from '../components/classes'
import { errorMessage } from '../lib/format'
import { notify } from '../lib/toast'

/** D1 (decision 131): the two files of the migration (F16), each one in
 * three moves: download the template, upload it filled (a rehearsal that
 * saves nothing), apply when every row is valid. */
const STEPS: {
  kind: ImportKind
  title: string
  intro: string
  columns: string
  after: string
}[] = [
  {
    kind: 'clientes',
    title: '1 · Clientes',
    intro:
      'Una fila por cliente con su cédula o RNC, su nombre, su contacto y el código de su sucursal. Un cliente que ya existe se salta, así que puedes subir el archivo corregido las veces que haga falta.',
    columns:
      'tipo, tipo_documento, documento, nombres, apellidos (o razon_social y representante), telefono, correo, direccion y sucursal.',
    after: 'Con los clientes cargados, pasa a los préstamos.',
  },
  {
    kind: 'prestamos',
    title: '2 · Préstamos en curso',
    intro:
      'Una fila por préstamo vivo: el documento del cliente, el producto de Cobradía con su nombre exacto, el monto, la tasa, la frecuencia, las cuotas, la fecha de desembolso, el capital que debe hoy y los pagos que ya hizo. Cada préstamo conserva su calendario original y sus pagos con su fecha real; nada entra a la caja. El capital pendiente tiene que cuadrar al centavo con tu sistema anterior o la fila no pasa.',
    columns:
      'documento, producto, monto, tasa (5 % = 0.05), frecuencia, cuotas, fecha_desembolso, primera_cuota, numero_anterior, cobrador (su correo), saldo_capital y pagos (fecha:monto; separados por punto y coma).',
    after: 'Listo: tu cartera está en Cobradía y mañana ya se cobra desde aquí.',
  },
]

const STATUS: Record<ImportReport['rows'][number]['status'], { tone: string; label: string }> = {
  created: { tone: 'success', label: 'Válida' },
  existing: { tone: 'neutral', label: 'Ya existe' },
  error: { tone: 'danger', label: 'Error' },
}

function Step({ step }: { step: (typeof STEPS)[number] }) {
  const queryClient = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  const run = useMutation({
    mutationFn: ({ apply }: { apply: boolean }) => runImport(step.kind, file!, apply),
    onSuccess: (data) => {
      setReport(data)
      setFileError(null)
      if (data.applied) {
        notify(data.summary, 'success')
        queryClient.invalidateQueries({ queryKey: ['first-steps'] })
        queryClient.invalidateQueries({ queryKey: ['customers'] })
        queryClient.invalidateQueries({ queryKey: ['loans'] })
      }
    },
    onError: (error) => {
      setReport(null)
      const data = error instanceof ApiError ? (error.data as { archivo?: string }) : null
      setFileError(data?.archivo ?? errorMessage(error instanceof ApiError ? error.data : null))
    },
  })

  function pick(next: File | null) {
    setFile(next)
    setReport(null)
    setFileError(null)
    if (next) run.mutate({ apply: false })
  }

  const ready = report !== null && !report.applied && report.errors === 0 && report.created > 0
  const onlyExisting =
    report !== null && !report.applied && report.errors === 0 && report.created === 0

  return (
    <section
      aria-label={step.title}
      className="flex flex-col gap-4 rounded-xl border border-edge bg-surface p-4 shadow-sm sm:p-5"
    >
      <div>
        <h2 className="text-[17px] font-semibold">{step.title}</h2>
        <p className="mt-1 text-sm text-muted">{step.intro}</p>
        <p className="mt-1.5 text-[12.5px] text-muted">
          <span className="font-medium text-ink/80">Columnas:</span> {step.columns}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <a href={templateUrl(step.kind)} className={buttonClass('secondary', '', 'sm')} download>
          Descargar la plantilla
        </a>
        <input
          ref={input}
          type="file"
          accept=".xlsx,.csv"
          className="sr-only"
          aria-label={`Archivo de ${step.kind}`}
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />
        <Button
          type="button"
          size="sm"
          variant={file ? 'secondary' : 'primary'}
          onClick={() => input.current?.click()}
          disabled={run.isPending}
        >
          {file ? 'Subir otro archivo' : 'Subir la plantilla llena'}
        </Button>
        {file ? (
          <span className="text-[12.5px] text-muted">
            {file.name}
            {run.isPending ? ' · ensayando…' : ''}
          </span>
        ) : null}
      </div>

      {fileError ? <Alert tone="danger">{fileError}</Alert> : null}

      {report ? (
        <div className="flex flex-col gap-3">
          <Alert tone={report.applied ? 'success' : report.errors ? 'warning' : 'info'}>
            {report.summary}
            {report.applied ? ` ${step.after}` : ''}
          </Alert>
          <div className="overflow-hidden rounded-lg border border-edge">
            <ul className="max-h-80 divide-y divide-edge overflow-y-auto text-sm">
              {report.rows.map((row) => (
                <li key={row.line} className="flex items-start gap-3 px-3 py-2">
                  <span className="w-14 shrink-0 tabular-nums text-muted">Fila {row.line}</span>
                  <Badge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Badge>
                  <span
                    className={`min-w-0 flex-1 ${row.status === 'error' ? 'text-danger-600' : ''}`}
                  >
                    {row.detail}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {ready ? (
            <div>
              <Button
                type="button"
                onClick={() => run.mutate({ apply: true })}
                disabled={run.isPending}
              >
                Aplicar la importación
              </Button>
              <p className="mt-1.5 text-[12.5px] text-muted">
                Se guarda todo junto; si algo falla, no se guarda nada.
              </p>
            </div>
          ) : null}
          {onlyExisting ? (
            <p className="text-[12.5px] text-muted">Nada nuevo que guardar: todo ya existía.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

export function ImportPortfolioPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Importar cartera"
        subtitle="Pasa los clientes y los préstamos en curso de tu sistema anterior, o de Excel, con dos plantillas. Primero se ensaya sin guardar; cuando todas las filas pasan, se aplica."
      />
      <Alert tone="info">
        Antes de empezar, revisa que tus productos en{' '}
        <Link to="/ajustes/productos" className="font-semibold underline">
          Ajustes → Productos
        </Link>{' '}
        tengan el nombre, la tasa y la mora con que prestas, y que el fondo inicial esté en Cuentas
        y bancos. Si prefieres que lo hagamos juntos, escríbenos a hola@cobradia.com.
      </Alert>
      {STEPS.map((step) => (
        <Step key={step.kind} step={step} />
      ))}
    </div>
  )
}
