import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { inviteToPortal, revokePortal } from '../../api/portal'
import { usePrompt } from '../../components/Dialog'
import { Button, Card, Input } from '../../components/ui'
import { dateOf } from '../../lib/format'
import { notify } from '../../lib/toast'

/** P92 from the staff's side (decision 099): the personal link to the
 * customer portal, sent by the active channels and shown to share by hand. */
export function PortalCard({
  customerId,
  since,
  canInvite,
  onChange,
}: {
  customerId: string
  since: string | null
  canInvite: boolean
  onChange: () => void
}) {
  const [dialog, ask] = usePrompt()
  const [link, setLink] = useState('')
  const invite = useMutation({
    mutationFn: () => inviteToPortal(customerId),
    onSuccess: (data) => {
      setLink(data.link)
      notify('Invitación enviada por los canales activos.', 'success')
      onChange()
    },
  })
  const revoke = useMutation({
    mutationFn: async () => {
      const confirmed = await ask({
        title: 'Quitar el acceso al portal',
        description: 'Su enlace deja de funcionar. Podrás invitarlo de nuevo cuando quieras.',
        confirmText: 'Quitar acceso',
        danger: true,
      })
      if (confirmed === null) return false
      await revokePortal(customerId)
      return true
    },
    onSuccess: (done) => {
      if (!done) return
      setLink('')
      notify('Acceso al portal retirado.', 'success')
      onChange()
    },
  })
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      notify('Enlace copiado.', 'success')
    } catch {
      notify('No se pudo copiar: selecciona el enlace y cópialo.')
    }
  }

  return (
    <Card className="space-y-3">
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <div className="font-semibold">Portal del cliente</div>
          <div className="text-muted">
            {since
              ? `Tiene acceso desde el ${dateOf(since)}: consulta sus préstamos, pagos y recibos.`
              : 'Sin acceso. Invítalo para que consulte sus préstamos, pagos y recibos.'}
          </div>
        </div>
        {canInvite ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant={since ? 'secondary' : 'primary'}
              disabled={invite.isPending}
              onClick={() => invite.mutate()}
            >
              {since ? 'Enviar nueva invitación' : 'Invitar al portal'}
            </Button>
            {since ? (
              <Button variant="danger" disabled={revoke.isPending} onClick={() => revoke.mutate()}>
                Quitar acceso
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {link ? (
        <div className="space-y-1">
          <div className="text-[12.5px] text-muted">
            Si no le llega, compártele este enlace (el anterior ya no funciona):
          </div>
          <div className="flex gap-2">
            <Input readOnly value={link} aria-label="Enlace al portal" />
            <Button variant="secondary" onClick={() => void copy()}>
              Copiar
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  )
}
