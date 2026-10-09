import { useMutation } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'

import { ApiError } from '../../api/client'
import { enterPortal, requestPortalCode } from '../../api/portal'
import { Alert, Button, Card, Field, Input } from '../../components/ui'
import { errorMessage } from '../../lib/format'
import { PortalFrame } from './PortalFrame'

const problem = (error: unknown) =>
  error instanceof ApiError ? errorMessage(error.data) : 'No pudimos conectar. Inténtalo de nuevo.'

/** P92 · Portal del cliente: acceso (decision 099). The personal link of the
 * invitation plus a one-time code sent to what the company has on file. */
export function PortalEnterPage() {
  const { t: token = '' } = useSearch({ from: '/portal/entrar' })
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  // Kept apart from the mutation: a failed «otro código» keeps the form.
  const [sent, setSent] = useState<{ customer: string; sent_to: string[] } | null>(null)
  const ask = useMutation({
    mutationFn: () => requestPortalCode(token),
    meta: { inlineError: true },
    onSuccess: setSent,
  })
  const enter = useMutation({
    mutationFn: () => enterPortal(token, code),
    meta: { inlineError: true },
    onSuccess: () => navigate({ to: '/portal' }),
  })

  if (!token) {
    return (
      <PortalFrame>
        <Card className="space-y-2 text-center">
          <h1 className="text-lg font-semibold">Entra con tu enlace</h1>
          <p className="text-sm text-muted">
            Abre el enlace personal que te envió tu financiera. Si no lo tienes, pídeselo.
          </p>
        </Card>
      </PortalFrame>
    )
  }

  return (
    <PortalFrame>
      <Card className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold">
            {sent ? `Hola, ${sent.customer}` : 'Entra a tu portal'}
          </h1>
          <p className="text-sm text-muted">
            Consulta tus préstamos, tu próximo pago, tus recibos y tu estado de cuenta.
          </p>
        </div>
        {!sent ? (
          <>
            <p className="text-sm">
              Te enviaremos un código de 6 dígitos al correo o al teléfono que tu financiera tiene
              registrado.
            </p>
            {ask.isError ? <Alert tone="danger">{problem(ask.error)}</Alert> : null}
            <Button className="w-full" disabled={ask.isPending} onClick={() => ask.mutate()}>
              {ask.isPending ? 'Enviando…' : 'Enviarme el código'}
            </Button>
          </>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              enter.mutate()
            }}
          >
            <Alert tone="info">
              Te enviamos un código a {sent.sent_to.join(' y ')}. Vence en 10 minutos.
            </Alert>
            <Field label="Código">
              <Input
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                autoFocus
                required
              />
            </Field>
            {enter.isError ? <Alert tone="danger">{problem(enter.error)}</Alert> : null}
            {ask.isError ? <Alert tone="warning">{problem(ask.error)}</Alert> : null}
            <Button
              className="w-full"
              type="submit"
              disabled={code.length !== 6 || enter.isPending}
            >
              {enter.isPending ? 'Entrando…' : 'Entrar'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={ask.isPending}
              onClick={() => {
                setCode('')
                enter.reset()
                ask.mutate()
              }}
            >
              Enviarme otro código
            </Button>
          </form>
        )}
      </Card>
    </PortalFrame>
  )
}
