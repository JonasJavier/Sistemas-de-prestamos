import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  type FiscalDocument,
  fiscalExportUrl,
  issueFiscalDocument,
  listFiscalDocuments,
  voidFiscalDocument,
} from '../api/accounting'
import { ApiError } from '../api/client'
import { usePrompt } from '../components/Dialog'
import { buttonClass } from '../components/classes'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  MonthInput,
  PageHeader,
  Pagination,
  RowList,
  Spinner,
  Tabs,
} from '../components/ui'
import { day, errorMessage, rd, todayISO, plural } from '../lib/format'
import { notify } from '../lib/toast'

const TABS = [
  ['pending', 'Por emitir'],
  ['issued', 'Emitidos'],
  ['voided', 'Anulados'],
] as const

/** Comprobantes fiscales (decision 085): every collection with interest, late
 * fee or charges owes its e-CF from 15/11/2026; issue it in the DGII's
 * facturador and record its e-NCF here. Exports 606 and 607 for the month. */
export function FiscalDocumentsPage() {
  const queryClient = useQueryClient()
  const [dialog, ask] = usePrompt()
  const [status, setStatus] = useState<FiscalDocument['status']>('pending')
  const [page, setPage] = useState(1)
  const [month, setMonth] = useState(() => todayISO().slice(0, 7))
  const list = useQuery({
    queryKey: ['fiscal-documents', status, page],
    queryFn: () => listFiscalDocuments({ estado: status, page }),
    placeholderData: keepPreviousData,
  })
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['fiscal-documents'] })
  const issue = useMutation({
    meta: { inlineError: true },
    mutationFn: async (doc: FiscalDocument) => {
      const ncf = await ask({
        title: `Registrar el e-NCF · ${doc.kind_label}`,
        label: `e-NCF asignado (${doc.kind} y 10 dígitos)`,
        initial: doc.kind,
        required: true,
        confirmText: 'Registrar',
      })
      return ncf === null ? null : issueFiscalDocument(doc.id, ncf)
    },
    onSuccess: (doc) => {
      if (!doc) return
      notify(`Comprobante ${doc.ncf} registrado.`, 'success')
      refresh()
    },
  })
  const cancel = useMutation({
    meta: { inlineError: true },
    mutationFn: async (doc: FiscalDocument) => {
      const reason = await ask({
        title: 'No emitir este comprobante',
        label: 'Motivo',
        type: 'textarea',
        required: true,
        danger: true,
        confirmText: 'Anular',
      })
      return reason === null ? null : voidFiscalDocument(doc.id, reason)
    },
    onSuccess: (doc) => {
      if (doc) refresh()
    },
  })
  const year = Number(month.slice(0, 4))
  const monthNumber = Number(month.slice(5, 7))
  const data = list.data
  const error = [issue.error, cancel.error].find((e) => e instanceof ApiError)
  return (
    <>
      {dialog}
      <PageHeader
        title="Comprobantes fiscales"
        subtitle="Desde el 15/11/2026 cada cobro con interés, mora o cargos lleva su e-CF. Emítelo en el facturador de la DGII y registra aquí su e-NCF."
      />
      <Alert tone="info">
        Los intereses y la mora están exentos de ITBIS; un cargo marcado como gravado lleva su 18 %.
        El capital no es ingreso y no se factura. La emisión automática llegará con un proveedor
        certificado.
      </Alert>
      <Card className="flex flex-wrap items-end gap-3">
        <Field label="Mes de los formatos">
          <MonthInput value={month} onChange={setMonth} />
        </Field>
        <a href={fiscalExportUrl('606', year, monthNumber)} className={buttonClass('secondary')}>
          Formato 606 (compras)
        </a>
        <a href={fiscalExportUrl('607', year, monthNumber)} className={buttonClass('secondary')}>
          Formato 607 (ventas)
        </a>
        <a href={fiscalExportUrl('pendientes')} className={buttonClass('secondary')}>
          Por emitir (CSV)
        </a>
      </Card>
      <Tabs
        tabs={TABS}
        value={status}
        onChange={(value) => {
          setStatus(value)
          setPage(1)
        }}
      />
      {error instanceof ApiError ? <Alert tone="danger">{errorMessage(error.data)}</Alert> : null}
      {list.isPending ? (
        <Spinner />
      ) : data?.results.length ? (
        <>
          <p className="text-sm text-muted">
            {plural(data.totals.count, 'comprobante')} · {rd(data.totals.total)}
          </p>
          <RowList>
            {data.results.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={doc.kind === 'E34' ? 'warning' : 'info'}>{doc.kind_label}</Badge>
                    <span className="font-semibold">{doc.buyer_name}</span>
                    {doc.buyer_document ? (
                      <span className="text-[12.5px] text-muted">{doc.buyer_document}</span>
                    ) : null}
                    {doc.ncf ? <span className="tabular-nums">{doc.ncf}</span> : null}
                  </div>
                  <div className="text-[12.5px] text-muted">
                    {day(doc.date)} · {doc.concept}
                    {doc.modifies_ncf ? ` · modifica ${doc.modifies_ncf}` : ''}
                    {doc.void_reason ? ` · ${doc.void_reason}` : ''}
                  </div>
                </div>
                {/* On a phone: the amount on the left, the actions on the right. */}
                <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end">
                  <div className="whitespace-nowrap sm:text-right">
                    <div className="font-bold tabular-nums">{rd(doc.total)}</div>
                    <div className="text-[12px] text-muted">
                      {Number(doc.itbis) ? `ITBIS ${rd(doc.itbis)}` : 'exento'}
                    </div>
                  </div>
                  {doc.status === 'pending' ? (
                    <div className="flex gap-2 whitespace-nowrap">
                      <Button variant="secondary" onClick={() => cancel.mutate(doc)}>
                        No emitir
                      </Button>
                      <Button onClick={() => issue.mutate(doc)}>Registrar e-NCF</Button>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </RowList>
          <Pagination page={page} count={data.count} onChange={setPage} />
        </>
      ) : (
        <EmptyState>Nada en esta bandeja.</EmptyState>
      )}
    </>
  )
}
