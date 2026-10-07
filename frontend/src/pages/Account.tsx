import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { useState } from 'react'

import type { Me } from '../api/accounts'
import {
  activateTotp,
  getRecoveryCodes,
  getTotpConfig,
  regenerateRecoveryCodes,
} from '../api/auth'
import { ApiError } from '../api/client'
import { Alert, Button, Card, Field, Input, PageHeader } from '../components/ui'

export function AccountPage({ me }: { me: Me }) {
  return (
    <>
      <PageHeader title="Mi cuenta" subtitle="Tus datos y la verificación en dos pasos." />

      {me.mfa_required && !me.mfa_enabled ? (
        <Alert tone="warning">
          La verificación en dos pasos es obligatoria: actívala para seguir usando el sistema.
        </Alert>
      ) : null}

      <Card>
        <h2 className="mb-2 text-base font-semibold">Mis datos</h2>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Nombre</dt>
            <dd className="font-medium">
              {me.first_name} {me.last_name}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Correo</dt>
            <dd className="font-medium">{me.email}</dd>
          </div>
        </dl>
      </Card>

      <TwoFactorCard />
    </>
  )
}

function TwoFactorCard() {
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [freshCodes, setFreshCodes] = useState<string[] | null>(null)

  const totp = useQuery({ queryKey: ['totp'], queryFn: getTotpConfig })
  const recovery = useQuery({
    queryKey: ['recovery-codes'],
    queryFn: getRecoveryCodes,
    enabled: totp.data?.active === true,
  })

  const activate = useMutation({
    mutationFn: () => activateTotp(code.trim()),
    onSuccess: async () => {
      setMessage(null)
      setCode('')
      await queryClient.invalidateQueries({ queryKey: ['totp'] })
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      const codes = await regenerateRecoveryCodes()
      setFreshCodes(codes)
      await queryClient.invalidateQueries({ queryKey: ['recovery-codes'] })
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 400) {
        setMessage('Código incorrecto. Prueba con el siguiente que muestre tu app.')
      } else {
        setMessage('No se pudo activar. Intenta de nuevo.')
      }
    },
  })

  const regenerate = useMutation({
    mutationFn: regenerateRecoveryCodes,
    onSuccess: (codes) => {
      setFreshCodes(codes)
      queryClient.invalidateQueries({ queryKey: ['recovery-codes'] })
    },
  })

  return (
    <Card>
      <h2 className="mb-2 text-base font-semibold">Verificación en dos pasos</h2>

      {totp.isPending ? <p className="text-sm text-muted">Cargando…</p> : null}

      {totp.data && !totp.data.active && totp.data.config ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            1. Escanea este código con tu app autenticadora (Google Authenticator, Authy o
            similar). 2. Escribe el código de 6 dígitos que te muestre.
          </p>
          <div className="flex flex-col items-start gap-4 sm:flex-row">
            <div className="rounded-lg bg-white p-3">
              <QRCodeSVG value={totp.data.config.totp_url} size={144} />
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <p className="break-all text-[12.5px] text-muted">
                Si no puedes escanear, escribe esta clave a mano:{' '}
                <code className="font-medium text-ink">{totp.data.config.secret}</code>
              </p>
              {message ? <Alert tone="danger">{message}</Alert> : null}
              <form
                className="flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  activate.mutate()
                }}
              >
                <div className="flex-1">
                  <Field label="Código de 6 dígitos">
                    <Input
                      inputMode="numeric"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                    />
                  </Field>
                </div>
                <Button type="submit" disabled={activate.isPending || code.trim().length < 6}>
                  {activate.isPending ? 'Activando…' : 'Activar'}
                </Button>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {totp.data?.active ? (
        <div className="space-y-3">
          <Alert tone="success">La verificación en dos pasos está activa.</Alert>
          {freshCodes ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Guarda estos códigos de respaldo en un lugar seguro (cada uno sirve una sola
                vez; no volverán a mostrarse):
              </p>
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-edge bg-canvas p-3 font-mono text-sm tabular-nums sm:grid-cols-5">
                {freshCodes.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">
              Códigos de respaldo sin usar: {recovery.data?.length ?? '—'}.{' '}
              <button
                type="button"
                className="font-medium text-brand-700 hover:underline"
                onClick={() => regenerate.mutate()}
                disabled={regenerate.isPending}
              >
                Generar nuevos
              </button>
            </p>
          )}
        </div>
      ) : null}
    </Card>
  )
}
