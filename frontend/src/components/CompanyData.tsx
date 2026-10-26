import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'

import { ApiError } from '../api/client'
import type { Me } from '../api/accounts'
import { cancelCompany, dataExportUrl, type MyCompany } from '../api/platform'
import { buttonClass } from './classes'
import { Modal } from './Modal'
import { Alert, Button, Field, Input } from './ui'
import { day, errorMessage } from '../lib/format'
import { notify } from '../lib/toast'

/** D8 (decision 132): the company's data belong to the company. One
 * download with everything, and the cancellation the terms promise: read
 * only from then on, the copy for 90 days, then deletion. */
export function CompanyDataSection({ data, me }: { data: MyCompany; me: Me }) {
  const [cancelling, setCancelling] = useState(false)
  const closed = data.status === 'closed'
  return (
    <section
      aria-label="Tus datos y tu cuenta"
      className="flex flex-col gap-3 rounded-xl border border-edge bg-surface p-4 shadow-sm sm:p-5"
    >
      <div>
        <h2 className="text-[17px] font-semibold">Tus datos y tu cuenta</h2>
        <p className="mt-1 text-sm text-muted">
          Todo lo que registraste es tuyo. Descárgalo cuando quieras en un solo Excel: clientes,
          préstamos, cuotas, pagos, caja, cobranza, gastos, libros, documentos y usuarios.
          {closed && data.purge_on
            ? ` La cuenta está cancelada: la copia se puede descargar hasta el ${day(data.purge_on)}; después se elimina todo.`
            : ''}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <a href={dataExportUrl()} className={buttonClass('secondary', '', 'sm')} download>
          Descargar la copia completa
        </a>
        {!closed ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setCancelling(true)}>
            Cancelar la suscripción
          </Button>
        ) : null}
      </div>
      {cancelling ? <CancelDialog me={me} onClose={() => setCancelling(false)} /> : null}
    </section>
  )
}

function CancelDialog({ me, onClose }: { me: Me; onClose: () => void }) {
  const titleId = useId()
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const cancel = useMutation({
    mutationFn: () => cancelCompany(reason, code),
    onSuccess: (company) => {
      queryClient.setQueryData(['my-company'], company)
      queryClient.invalidateQueries({ queryKey: ['me'] })
      notify('Suscripción cancelada. La cuenta queda en solo lectura.', 'success')
      onClose()
    },
    onError: (err) => {
      const data = err instanceof ApiError ? (err.data as Record<string, string>) : null
      setError(data?.second_factor ?? data?.reason ?? errorMessage(data))
    },
  })
  return (
    <Modal onClose={onClose} labelledBy={titleId}>
      <form
        className="w-full max-w-lg space-y-4 rounded-2xl bg-surface p-5 shadow-xl sm:p-6"
        onSubmit={(event) => {
          event.preventDefault()
          setError(null)
          cancel.mutate()
        }}
      >
        <div>
          <h2 id={titleId} className="text-[18px] font-semibold">
            Cancelar la suscripción
          </h2>
          <p className="mt-1 text-sm text-muted">
            La cuenta queda en solo lectura desde hoy: podrás entrar, consultar y descargar la copia
            completa durante 90 días. Después se elimina todo, salvo lo que la ley obligue a
            conservar. Si cambias de idea en esos días, escríbenos y la reactivamos tal cual.
          </p>
        </div>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field label="¿Por qué te vas?" hint="Nos ayuda a mejorar. Una línea basta.">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            required
            autoFocus
          />
        </Field>
        <Field
          label={me.mfa_enabled ? 'Código de tu app autenticadora' : 'Tu contraseña'}
          hint="Para confirmar que eres tú."
        >
          <Input
            type={me.mfa_enabled ? 'text' : 'password'}
            inputMode={me.mfa_enabled ? 'numeric' : undefined}
            autoComplete={me.mfa_enabled ? 'one-time-code' : 'current-password'}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Volver
          </Button>
          <Button type="submit" variant="danger" disabled={cancel.isPending}>
            Cancelar la suscripción
          </Button>
        </div>
      </form>
    </Modal>
  )
}
