import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { ApiError } from '../api/client'
import {
  type Channel,
  getTemplates,
  listMessages,
  type MessageTemplate,
  sendTest,
  STATUS_TONE,
  updateTemplate,
} from '../api/messages'
import { Modal } from '../components/Modal'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Pagination,
  RowList,
  Select,
  Spinner,
  Tabs,
  Textarea,
} from '../components/ui'
import { errorMessage, moment } from '../lib/format'
import { notify } from '../lib/toast'

const TABS = [
  ['plantillas', 'Plantillas'],
  ['registro', 'Registro de envíos'],
] as const

const CHANNELS: [Channel, string][] = [
  ['email', 'Correo'],
  ['whatsapp', 'WhatsApp'],
  ['sms', 'SMS'],
]

function TemplateDialog({
  template,
  variables,
  onClose,
}: {
  template: MessageTemplate
  variables: string[]
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [subject, setSubject] = useState(template.subject)
  const [body, setBody] = useState(template.body)
  const save = useMutation({
    meta: { inlineError: true },
    mutationFn: () => updateTemplate(template.id, { subject, body }),
    onSuccess: () => {
      notify('Plantilla guardada.', 'success')
      void queryClient.invalidateQueries({ queryKey: ['message-templates'] })
      onClose()
    },
  })
  return (
    <Modal onClose={onClose} labelledBy="template-title">
      <div className="max-h-[92vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-xl bg-surface p-5 shadow-xl">
        <h2 id="template-title" className="text-lg font-semibold">
          {template.event_label} · {template.channel_label}
        </h2>
        {template.channel === 'email' ? (
          <Field label="Asunto">
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Field>
        ) : null}
        <Field label="Mensaje">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} />
        </Field>
        <p className="text-[12.5px] text-muted">
          Puedes usar {variables.map((v) => `{${v}}`).join(', ')}: se llenan al enviar.
        </p>
        {save.error instanceof ApiError ? (
          <Alert tone="danger">{errorMessage(save.error.data)}</Alert>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!body.trim() || save.isPending} onClick={() => save.mutate()}>
            Guardar
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function Templates() {
  const queryClient = useQueryClient()
  const data = useQuery({ queryKey: ['message-templates'], queryFn: getTemplates })
  const [editing, setEditing] = useState<MessageTemplate>()
  const [channel, setChannel] = useState<Channel>('email')
  const [to, setTo] = useState('')
  const toggle = useMutation({
    mutationFn: (t: MessageTemplate) => updateTemplate(t.id, { is_active: !t.is_active }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['message-templates'] }),
  })
  const test = useMutation({
    meta: { inlineError: true },
    mutationFn: () => sendTest(channel, to),
    onSuccess: () => {
      notify('Mensaje de prueba enviado: míralo en el registro de envíos.', 'success')
      void queryClient.invalidateQueries({ queryKey: ['messages'] })
    },
  })
  if (data.isPending) return <Spinner />
  if (!data.data) return null
  const { templates, providers, variables } = data.data
  const events = [...new Set(templates.map((t) => t.event))]
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        {CHANNELS.map(([key, label]) => (
          <Card key={key} className="space-y-1">
            <div className="text-[12.5px] text-muted">{label}</div>
            <div className="font-semibold">
              {key === 'email'
                ? 'Servidor de correo'
                : providers[key].ready
                  ? `Proveedor: ${providers[key].provider}`
                  : 'Sin proveedor contratado'}
            </div>
            <div className="text-[12px] text-muted">
              {key === 'email' || providers[key].ready
                ? 'Los mensajes salen.'
                : 'Se registran sin enviarse hasta que se contrate el proveedor.'}
            </div>
          </Card>
        ))}
      </div>
      <Card className="flex flex-wrap items-end gap-3">
        <Field label="Canal">
          <Select value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
            {CHANNELS.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={channel === 'email' ? 'Correo' : 'Teléfono'}>
          <Input value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Button
          variant="secondary"
          disabled={!to.trim() || test.isPending}
          onClick={() => test.mutate()}
        >
          Enviar mensaje de prueba
        </Button>
        {test.error instanceof ApiError ? (
          <Alert tone="danger">{errorMessage(test.error.data)}</Alert>
        ) : null}
      </Card>
      <RowList>
        {events.map((event) => {
          const rows = templates.filter((t) => t.event === event)
          return (
            <li key={event} className="space-y-2 px-4 py-3">
              <div className="font-semibold">{rows[0].event_label}</div>
              <div className="flex flex-wrap gap-2">
                {rows.map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-2 rounded-lg border border-edge px-2 py-1 text-sm"
                  >
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={t.is_active}
                        onChange={() => toggle.mutate(t)}
                        aria-label={`${t.event_label} por ${t.channel_label}`}
                      />
                      {t.channel_label}
                    </label>
                    <button
                      type="button"
                      className="text-[12.5px] font-semibold text-brand-700 hover:underline"
                      onClick={() => setEditing(t)}
                    >
                      Editar
                    </button>
                  </span>
                ))}
              </div>
            </li>
          )
        })}
      </RowList>
      {editing ? (
        <TemplateDialog
          template={editing}
          variables={variables}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
    </>
  )
}

function Log() {
  const [canal, setCanal] = useState('')
  const [estado, setEstado] = useState('')
  const [page, setPage] = useState(1)
  const log = useQuery({
    queryKey: ['messages', canal, estado, page],
    queryFn: () => listMessages({ canal, estado, page }),
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
  })
  return (
    <>
      <div className="flex flex-wrap gap-3">
        <Field label="Canal">
          <Select value={canal} onChange={(e) => setCanal(e.target.value)}>
            <option value="">Todos</option>
            {CHANNELS.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Estado">
          <Select value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todos</option>
            <option value="sent">Enviado</option>
            <option value="logged">Registrado sin proveedor</option>
            <option value="failed">Falló</option>
            <option value="skipped">No enviado</option>
            <option value="queued">En cola</option>
          </Select>
        </Field>
      </div>
      {log.isPending ? (
        <Spinner />
      ) : log.data?.results.length ? (
        <>
          <RowList>
            {log.data.results.map((m) => (
              <li key={m.id} className="space-y-1 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={STATUS_TONE[m.status]}>{m.status_label}</Badge>
                  <span className="font-semibold">{m.event_label}</span>
                  <span className="text-[12.5px] text-muted">
                    {m.channel_label} · {m.to}
                    {m.customer ? ` · ${m.customer.name}` : ''}
                    {m.loan ? ` · ${m.loan}` : ''}
                  </span>
                </div>
                <div className="text-sm">{m.body}</div>
                <div className="text-[12px] text-muted">
                  {moment(m.created_at)}
                  {m.error ? ` · ${m.error}` : ''}
                </div>
              </li>
            ))}
          </RowList>
          <Pagination page={page} count={log.data.count} onChange={setPage} />
        </>
      ) : (
        <EmptyState>Todavía no se ha enviado ningún mensaje.</EmptyState>
      )}
    </>
  )
}

/** P80 · Mensajería (F18, decision 097). */
export function MessagesPage() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('plantillas')
  return (
    <>
      <PageHeader
        title="Mensajería"
        subtitle="Recordatorios, avisos de atraso, confirmaciones de pago y el portal: por correo, WhatsApp o SMS. Cada envío queda registrado."
      />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'plantillas' ? <Templates /> : <Log />}
    </>
  )
}
