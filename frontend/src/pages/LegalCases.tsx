import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { useState } from 'react'

import { ApiError } from '../api/client'
import {
  addCost,
  CASE_OUTCOMES,
  closeCase,
  getCase,
  issueLegalDocument,
  LEGAL_DOCUMENTS,
  type LegalCase,
  legalDocxUrl,
  legalPdfUrl,
  listCases,
  listProfessionals,
  type Professional,
  updateCase,
} from '../api/legal'
import { listAccounts } from '../api/origination'
import { Modal } from '../components/Modal'
import { tableRowClass } from '../components/classes'
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Segmented,
  Select,
  Spinner,
  Stat,
  Table,
  Textarea,
} from '../components/ui'
import { day, errorMessage, rd } from '../lib/format'
import { notify } from '../lib/toast'

const TABS = [
  ['abiertos', 'Abiertos'],
  ['cerrados', 'Cerrados'],
] as const

const STATUS_TONE: Record<string, string> = {
  open: 'warning',
  agreement: 'info',
  execution: 'danger',
  closed: 'neutral',
}

function CaseRow({ legalCase }: { legalCase: LegalCase }) {
  return (
    <li>
      <Link to="/legal/$id" params={{ id: legalCase.id }} className={tableRowClass}>
        <div className="flex min-w-0 basis-full items-center gap-3 md:basis-auto">
          <Avatar name={legalCase.loan.customer} size="sm" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold">{legalCase.loan.customer}</span>
              <Badge tone={STATUS_TONE[legalCase.status]} dot>
                {legalCase.status_label}
              </Badge>
            </div>
            <div className="mt-0.5 text-[12px] text-muted tabular-nums">
              {legalCase.number} · préstamo {legalCase.loan.number} · {legalCase.loan.days_past_due}{' '}
              días de atraso
              {legalCase.outcome_label ? ` · ${legalCase.outcome_label}` : ''}
            </div>
          </div>
        </div>
        <span className="min-w-0 truncate text-[12.5px] text-muted md:text-[13px] md:text-ink">
          {legalCase.lawyer.name}
        </span>
        <span className="text-[12.5px] text-muted tabular-nums md:text-[13px] md:text-ink">
          {day(legalCase.opened_on)}
        </span>
        <span className="whitespace-nowrap font-semibold tabular-nums md:text-right">
          {rd(legalCase.loan.principal_outstanding)}
        </span>
      </Link>
    </li>
  )
}

/** P46 · Casos legales (F9, decision 095). */
export function LegalCasesPage() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('abiertos')
  const cases = useQuery({ queryKey: ['legal-cases', tab], queryFn: () => listCases(tab) })
  return (
    <>
      <PageHeader
        title="Casos legales"
        subtitle="Préstamos enviados a la vía legal: abogado, alguacil, documentos, costas y estado. Se abren desde el préstamo."
      />
      <Segmented
        label="Casos"
        value={tab}
        onChange={setTab}
        options={TABS.map(([value, label]) => ({ value, label }))}
      />
      {cases.isPending ? (
        <Spinner />
      ) : cases.data?.length ? (
        <Table
          label="Casos legales"
          columns="minmax(0,1.6fr) minmax(0,1fr) 6.5rem 9rem"
          head={[
            { label: 'Cliente y caso' },
            { label: 'Abogado' },
            { label: 'Desde' },
            { label: 'Capital pendiente', align: 'right' },
          ]}
        >
          {cases.data.map((c) => (
            <CaseRow key={c.id} legalCase={c} />
          ))}
        </Table>
      ) : (
        <EmptyState>
          {tab === 'abiertos'
            ? 'Ningún caso abierto. Se abren desde el préstamo: «Más» → Enviar a la vía legal.'
            : 'Ningún caso cerrado.'}
        </EmptyState>
      )}
    </>
  )
}

function ProfessionalSelect({
  label,
  kind,
  value,
  people,
  onChange,
}: {
  label: string
  kind: string
  value: string
  people: Professional[]
  onChange: (value: string) => void
}) {
  return (
    <Field label={label}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{kind === 'lawyer' ? 'Elegir…' : 'Sin asignar'}</option>
        {people
          .filter((p) => p.kind === kind && p.is_active)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
      </Select>
    </Field>
  )
}

/** P46 · the case file: people, documents, costs and its end. */
export function LegalCasePage() {
  const { id } = useParams({ from: '/app/legal/$id' })
  const queryClient = useQueryClient()
  const detail = useQuery({ queryKey: ['legal-case', id], queryFn: () => getCase(id) })
  const people = useQuery({ queryKey: ['legal-professionals'], queryFn: listProfessionals })
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: listAccounts })
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['legal-case', id] })
  const [cost, setCost] = useState({ description: '', amount: '', account: '', charge: false })
  const [closing, setClosing] = useState(false)
  const [outcome, setOutcome] = useState('')
  const [closeNote, setCloseNote] = useState('')
  const update = useMutation({
    meta: { inlineError: true },
    mutationFn: (data: Parameters<typeof updateCase>[1]) => updateCase(id, data),
    onSuccess: refresh,
  })
  const issue = useMutation({
    meta: { inlineError: true },
    mutationFn: (kind: string) => issueLegalDocument(id, kind),
    onSuccess: (doc) => {
      notify(`${doc.label} emitido (${doc.folio}).`, 'success')
      refresh()
    },
  })
  const costMutation = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      addCost(id, {
        description: cost.description,
        amount: cost.amount,
        account: cost.account || null,
        charge_customer: cost.charge,
      }),
    onSuccess: () => {
      setCost({ description: '', amount: '', account: '', charge: false })
      notify('Costa registrada.', 'success')
      refresh()
    },
  })
  const close = useMutation({
    meta: { inlineError: true },
    mutationFn: () => closeCase(id, outcome, closeNote),
    onSuccess: () => {
      setClosing(false)
      refresh()
    },
  })
  const data = detail.data
  if (detail.isPending) return <Spinner />
  if (!data) return <Alert tone="danger">No se encontró el caso.</Alert>
  const open = data.status !== 'closed'
  const roster = people.data ?? []
  const error = [update.error, issue.error, costMutation.error].find((e) => e instanceof ApiError)
  return (
    <>
      <PageHeader
        back={
          <Link to="/legal" className="hover:underline">
            ← Casos legales
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            Caso {data.number}
            <Badge tone={STATUS_TONE[data.status]}>{data.status_label}</Badge>
          </span>
        }
        subtitle={
          <>
            {data.loan.customer} · préstamo{' '}
            <Link
              to="/prestamos/$numero"
              params={{ numero: data.loan.number }}
              className="font-medium hover:underline"
            >
              {data.loan.number}
            </Link>{' '}
            · abierto el {day(data.opened_on)} por {data.opened_by}
          </>
        }
        actions={
          open ? (
            <Button variant="secondary" onClick={() => setClosing(true)}>
              Cerrar el caso
            </Button>
          ) : null
        }
      />
      {data.status === 'closed' ? (
        <Alert tone="info">
          Cerrado el {day(data.closed_on)}: {data.outcome_label}. {data.close_note}
        </Alert>
      ) : null}
      {error instanceof ApiError ? <Alert tone="danger">{errorMessage(error.data)}</Alert> : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat
          label="Exigible hoy"
          value={rd(data.exigible)}
          emphasis
          hint="Cuotas vencidas con su mora"
        />
        <Stat label="Capital pendiente" value={rd(data.loan.principal_outstanding)} />
        <Stat label="Atraso" value={`${data.loan.days_past_due} días`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="text-base font-semibold">Profesionales y estado</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <ProfessionalSelect
              label="Abogado"
              kind="lawyer"
              value={data.lawyer.id}
              people={roster}
              onChange={(value) => value && update.mutate({ lawyer: value })}
            />
            <ProfessionalSelect
              label="Alguacil"
              kind="bailiff"
              value={data.bailiff?.id ?? ''}
              people={roster}
              onChange={(value) => update.mutate({ bailiff: value || null })}
            />
            <ProfessionalSelect
              label="Notario"
              kind="notary"
              value={data.notary?.id ?? ''}
              people={roster}
              onChange={(value) => update.mutate({ notary: value || null })}
            />
            <Field label="Estado">
              <Select
                value={data.status}
                disabled={!open}
                onChange={(e) =>
                  update.mutate({ status: e.target.value as 'open' | 'agreement' | 'execution' })
                }
              >
                <option value="open">Abierto</option>
                <option value="agreement">En acuerdo</option>
                <option value="execution">En ejecución</option>
                {open ? null : <option value="closed">Cerrado</option>}
              </Select>
            </Field>
          </div>
          {data.note ? <p className="text-sm text-muted">{data.note}</p> : null}
        </Card>
        <Card className="space-y-3">
          <h2 className="text-base font-semibold">Documentos</h2>
          <p className="text-[12.5px] text-muted">
            Con los datos reales del expediente. Son plantillas de fábrica pendientes de validación
            por el abogado de la empresa; el DOCX es editable.
          </p>
          <ul className="space-y-2 text-sm">
            {LEGAL_DOCUMENTS.map((doc) => (
              <li key={doc.kind} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {doc.label}
                  {doc.needs ? <span className="text-muted"> · necesita {doc.needs}</span> : null}
                </span>
                <span className="flex gap-2">
                  <a
                    href={legalDocxUrl(data.id, doc.kind)}
                    className="inline-flex h-8 items-center rounded-lg border border-edge px-3 text-[13px] font-semibold hover:bg-surface-2"
                  >
                    DOCX
                  </a>
                  {open ? (
                    <Button
                      variant="soft"
                      size="sm"
                      disabled={issue.isPending}
                      onClick={() => issue.mutate(doc.kind)}
                    >
                      Emitir PDF
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          {data.documents.length ? (
            <ul className="divide-y divide-edge border-t border-edge pt-2 text-sm">
              {data.documents.map((doc) => (
                <li key={doc.id} className="flex justify-between gap-2 py-1.5">
                  <a
                    href={legalPdfUrl(data.id, doc.id)}
                    target="_blank"
                    rel="noopener"
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {doc.label}
                  </a>
                  <span className="text-muted">
                    {doc.folio}
                    {doc.legal_status === 'pending' ? ' · pendiente de validación legal' : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </div>
      <Card className="space-y-3">
        <h2 className="text-base font-semibold">Costas y gastos legales</h2>
        {data.costs.length ? (
          <ul className="divide-y divide-edge text-sm">
            {data.costs.map((c) => (
              <li key={c.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span>
                  {day(c.date)} · {c.description}
                  <span className="text-muted">
                    {c.paid ? ' · pagada' : ''}
                    {c.charged ? ' · cargada al cliente' : ''}
                  </span>
                </span>
                <span className="tabular-nums">{rd(c.amount)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Sin costas registradas.</p>
        )}
        {open ? (
          <div className="grid gap-3 sm:grid-cols-2 sm:items-end lg:grid-cols-[1fr_9rem_12rem_auto]">
            <Field label="Descripción">
              <Input
                value={cost.description}
                onChange={(e) => setCost({ ...cost, description: e.target.value })}
              />
            </Field>
            <Field label="Monto (RD$)">
              <Input
                inputMode="decimal"
                value={cost.amount}
                onChange={(e) => setCost({ ...cost, amount: e.target.value })}
              />
            </Field>
            <Field label="Se paga desde">
              <Select
                value={cost.account}
                onChange={(e) => setCost({ ...cost, account: e.target.value })}
              >
                <option value="">Ya pagada / se paga aparte</option>
                {accounts.data
                  ?.filter((a) => a.kind === 'cash' || a.kind === 'bank')
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Button
              disabled={!cost.description.trim() || !cost.amount || costMutation.isPending}
              onClick={() => costMutation.mutate()}
            >
              Registrar
            </Button>
            <label className="flex items-center gap-2 text-sm sm:col-span-4">
              <input
                type="checkbox"
                checked={cost.charge}
                onChange={(e) => setCost({ ...cost, charge: e.target.checked })}
              />
              Cargarla al cliente (si el contrato lo permite): se suma a su cuota más antigua
            </label>
          </div>
        ) : null}
      </Card>
      {closing ? (
        <Modal onClose={() => setClosing(false)} labelledBy="close-case-title">
          <div className="w-full max-w-md space-y-3 rounded-2xl bg-surface p-5 shadow-xl">
            <h2 id="close-case-title" className="text-lg font-semibold">
              Cerrar el caso {data.number}
            </h2>
            <Field label="Cómo termina">
              <Select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                <option value="">Elegir…</option>
                {CASE_OUTCOMES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Nota">
              <Textarea value={closeNote} onChange={(e) => setCloseNote(e.target.value)} />
            </Field>
            {close.error instanceof ApiError ? (
              <Alert tone="danger">{errorMessage(close.error.data)}</Alert>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setClosing(false)}>
                Cancelar
              </Button>
              <Button
                disabled={!outcome || !closeNote.trim() || close.isPending}
                onClick={() => close.mutate()}
              >
                Cerrar el caso
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  )
}
