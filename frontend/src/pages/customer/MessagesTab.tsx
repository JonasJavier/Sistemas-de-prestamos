import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getCustomerMessages, optIn, optOut, STATUS_TONE } from '../../api/messages'
import { Badge, Button, Card, EmptyState, RowList, Spinner } from '../../components/ui'
import { moment } from '../../lib/format'
import { notify } from '../../lib/toast'

/** F18 (decision 097): what was sent to the customer and their opt-outs. */
export function MessagesTab({ customerId, canEdit }: { customerId: string; canEdit: boolean }) {
  const queryClient = useQueryClient()
  const data = useQuery({
    queryKey: ['customer-messages', customerId],
    queryFn: () => getCustomerMessages(customerId),
  })
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ['customer-messages', customerId] })
  const stop = useMutation({
    mutationFn: () => optOut(customerId, '', 'Lo pidió el cliente'),
    onSuccess: () => {
      notify('Listo: no se le enviarán mensajes.', 'success')
      refresh()
    },
  })
  const resume = useMutation({
    mutationFn: () => optIn(customerId, ''),
    onSuccess: () => {
      notify('El cliente vuelve a recibir mensajes.', 'success')
      refresh()
    },
  })
  if (data.isPending) return <Spinner />
  if (!data.data) return null
  const blocked = data.data.opt_outs.some((o) => o.channel === '')
  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          {blocked
            ? 'El cliente pidió no recibir mensajes. Los códigos para entrar a su portal sí le llegan.'
            : data.data.opt_outs.length
              ? `No recibe por: ${data.data.opt_outs.map((o) => o.channel_label).join(', ')}.`
              : 'Recibe recordatorios, avisos y confirmaciones según las plantillas activas.'}
        </div>
        {canEdit ? (
          blocked ? (
            <Button variant="secondary" disabled={resume.isPending} onClick={() => resume.mutate()}>
              Volver a enviarle mensajes
            </Button>
          ) : (
            <Button variant="secondary" disabled={stop.isPending} onClick={() => stop.mutate()}>
              No enviarle mensajes
            </Button>
          )
        ) : null}
      </Card>
      {data.data.messages.length ? (
        <RowList>
          {data.data.messages.map((m) => (
            <li key={m.id} className="space-y-1 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={STATUS_TONE[m.status]}>{m.status_label}</Badge>
                <span className="font-semibold">{m.event_label}</span>
                <span className="text-[12.5px] text-muted">
                  {m.channel_label} · {m.to}
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
      ) : (
        <EmptyState>Todavía no se le ha enviado ningún mensaje.</EmptyState>
      )}
    </div>
  )
}
