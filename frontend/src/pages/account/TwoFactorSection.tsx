import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { QRCodeSVG } from 'qrcode.react'
import { useState, type ReactNode } from 'react'

import {
  activateTotp,
  authErrorCode,
  getRecoveryCodes,
  getTotpConfig,
  listAuthenticators,
  regenerateRecoveryCodes,
  type TotpConfig,
} from '../../api/auth'
import { ApiError } from '../../api/client'
import { ShieldCheckIcon } from '../../components/icons'
import { Alert, Badge, Button, Input, LoadError, Spinner } from '../../components/ui'
import { notify } from '../../lib/toast'
import { IdentityNotConfirmed, useConfirmIdentity } from './confirmIdentity'
import { Panel } from './Panel'

const day = (seconds: number) =>
  new Date(seconds * 1000).toLocaleDateString('es-DO', { dateStyle: 'long' })

/** «LTRP AZVE K5IY …»: the key reads in groups of four when typed by hand. */
const grouped = (secret: string) => secret.replace(/(.{4})/g, '$1 ').trim()

/** Mi cuenta › Verificación en dos pasos (decisions 034 and 117). */
export function TwoFactorSection() {
  const totp = useQuery({ queryKey: ['totp'], queryFn: getTotpConfig })
  const [freshCodes, setFreshCodes] = useState<string[] | null>(null)

  if (totp.isPending) return <Spinner />
  if (totp.isError) return <LoadError error={totp.error} />
  if (freshCodes) return <CodesToSave codes={freshCodes} onDone={() => setFreshCodes(null)} />
  if (totp.data.active) return <Active onCodes={setFreshCodes} />
  if (totp.data.config) return <Setup config={totp.data.config} onActivated={setFreshCodes} />
  return null
}

function Setup({
  config,
  onActivated,
}: {
  config: TotpConfig
  onActivated: (codes: string[]) => void
}) {
  const queryClient = useQueryClient()
  const { run, dialog } = useConfirmIdentity()
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)
  const activate = useMutation({
    meta: { inlineError: true },
    mutationFn: async () => {
      await run(() => activateTotp(code))
      // allauth already made the recovery codes with the activation.
      return (await run(getRecoveryCodes).catch(() => null)) ?? []
    },
    onSuccess: async (codes) => {
      setCode('')
      onActivated(codes)
      notify('Verificación en dos pasos activada.', 'success')
      await Promise.all(
        [['totp'], ['me'], ['authenticators']].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      )
    },
  })
  const failure = activate.error
  const message =
    failure instanceof IdentityNotConfirmed || !failure
      ? null
      : failure instanceof ApiError && authErrorCode(failure) === 'incorrect_code'
        ? 'Ese código no coincide. Usa la entrada «Cobradía» que acabas de escanear y escribe el número que muestra ahora mismo.'
        : failure instanceof ApiError && authErrorCode(failure) === 'rate_limited'
          ? 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.'
          : 'No se pudo activar. Intenta de nuevo.'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(config.secret)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      notify('No se pudo copiar; escríbela a mano.')
    }
  }

  return (
    <>
      <Panel
        title="Activa la verificación en dos pasos"
        description="Además de tu contraseña, al entrar te pediremos un código de 6 dígitos que genera una app en tu celular. Si alguien conoce tu contraseña, sin tu celular no podrá entrar."
        aside={
          <Badge tone="warning" dot>
            Sin activar
          </Badge>
        }
        onSubmit={() => {
          if (code.length === 6) activate.mutate()
        }}
        footer={
          <Button type="submit" disabled={activate.isPending || code.length !== 6}>
            {activate.isPending ? 'Activando…' : 'Activar'}
          </Button>
        }
      >
        <ol className="space-y-6">
          <Step number={1} title="Instala una app autenticadora">
            Google Authenticator, Microsoft Authenticator o Authy, gratis en la tienda de tu
            celular.
          </Step>
          <Step number={2} title="Escanea este código con la app">
            <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="w-fit rounded-xl border border-edge bg-white p-3 shadow-xs">
                <QRCodeSVG value={config.totp_url} size={152} />
              </div>
              <div className="min-w-0 space-y-3 text-[13px]">
                <div className="space-y-1.5">
                  <div className="text-muted">
                    ¿No puedes escanearlo? Escribe esta clave en la app:
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded-lg border border-edge bg-surface-2 px-2.5 py-1.5 font-mono text-[13px] font-medium tracking-wide text-ink">
                      {grouped(config.secret)}
                    </code>
                    <Button type="button" variant="secondary" size="sm" onClick={copy}>
                      {copied ? 'Copiada' : 'Copiar'}
                    </Button>
                  </div>
                </div>
                <p className="text-[12.5px] leading-relaxed text-muted">
                  Si tu app ya tiene una entrada «Cobradía» de un intento anterior, bórrala: solo
                  sirve la de este código.
                </p>
              </div>
            </div>
          </Step>
          <Step number={3} title="Escribe el código que muestra la app">
            <div className="mt-3 max-w-[14rem]">
              <Input
                aria-label="Código de 6 dígitos"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                className="text-center font-mono text-lg tracking-[0.4em] tabular-nums sm:h-11"
              />
            </div>
            <p className="mt-1.5 text-[12.5px] text-muted">
              Cambia cada 30 segundos; escribe el que veas en este momento.
            </p>
          </Step>
        </ol>
        {message ? <Alert tone="danger">{message}</Alert> : null}
        <p className="text-[13px] text-muted">
          ¿Prefieres la huella o la cara de tu dispositivo? Crea una{' '}
          <Link to="/cuenta/llaves" className="font-semibold text-brand-700 hover:underline">
            llave de acceso
          </Link>{' '}
          y entra sin contraseña ni código.
        </p>
      </Panel>
      {dialog}
    </>
  )
}

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-100 text-[13px] font-semibold text-brand-800"
      >
        {number}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="text-sm font-semibold">{title}</div>
        <div className="mt-0.5 text-[13px] text-muted">{children}</div>
      </div>
    </li>
  )
}

function Active({ onCodes }: { onCodes: (codes: string[]) => void }) {
  const queryClient = useQueryClient()
  const { run, dialog } = useConfirmIdentity()
  const authenticators = useQuery({ queryKey: ['authenticators'], queryFn: listAuthenticators })
  const app = authenticators.data?.find((item) => item.type === 'totp')
  const recovery = authenticators.data?.find((item) => item.type === 'recovery_codes')
  const regenerate = useMutation({
    meta: { inlineError: true },
    mutationFn: () => run(regenerateRecoveryCodes),
    onSuccess: (codes) => {
      onCodes(codes)
      void queryClient.invalidateQueries({ queryKey: ['authenticators'] })
    },
  })
  const left = recovery?.unused_code_count ?? 0

  return (
    <>
      <Panel
        title="Verificación en dos pasos"
        description="Al entrar te pedimos tu contraseña y el código de 6 dígitos de tu app autenticadora."
        aside={
          <Badge tone="success" dot>
            Activa
          </Badge>
        }
      >
        <div className="flex items-start gap-3 rounded-xl border border-success-600/20 bg-success-600/[0.06] p-3.5">
          <span className="text-success-600">
            <ShieldCheckIcon />
          </span>
          <div className="space-y-0.5 text-[13px]">
            <div className="font-semibold text-ink">Tu cuenta está protegida</div>
            {app ? (
              <div className="text-muted">
                Activa desde el {day(app.created_at)}
                {app.last_used_at ? ` · último uso el ${day(app.last_used_at)}` : ''}.
              </div>
            ) : null}
          </div>
        </div>
      </Panel>

      <Panel
        title="Códigos de respaldo"
        description="Si pierdes el celular, entra con uno de estos códigos en lugar del de la app. Cada uno sirve una sola vez."
        aside={
          recovery ? (
            <Badge tone={left <= 2 ? 'warning' : 'neutral'}>
              {left} de {recovery.total_code_count ?? left} sin usar
            </Badge>
          ) : null
        }
        footer={
          <Button
            type="button"
            variant="secondary"
            disabled={regenerate.isPending}
            onClick={() => regenerate.mutate()}
          >
            {regenerate.isPending ? 'Generando…' : 'Generar códigos nuevos'}
          </Button>
        }
      >
        {authenticators.isError ? <LoadError error={authenticators.error} /> : null}
        <p className="text-[13px] text-muted">
          Generar códigos nuevos anula los anteriores. Hazlo si se te acabaron o si crees que
          alguien los vio.
        </p>
        {regenerate.error && !(regenerate.error instanceof IdentityNotConfirmed) ? (
          <Alert tone="danger">No se pudieron generar. Intenta de nuevo.</Alert>
        ) : null}
      </Panel>
      {dialog}
    </>
  )
}

function CodesToSave({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const text = codes.join('\n')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      notify('Códigos copiados.', 'success')
    } catch {
      notify('No se pudieron copiar; anótalos a mano.')
    }
  }
  const download = () => {
    const blob = new Blob(
      [`Cobradía · códigos de respaldo\nCada código sirve una sola vez.\n\n${text}\n`],
      { type: 'text/plain;charset=utf-8' },
    )
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'cobradia-codigos-de-respaldo.txt'
    link.click()
    URL.revokeObjectURL(link.href)
  }
  return (
    <Panel
      title="Guarda tus códigos de respaldo"
      description="Si pierdes el celular, son la única forma de entrar sin la app. Guárdalos en un lugar seguro: no volverán a mostrarse."
      aside={
        <Badge tone="success" dot>
          Activa
        </Badge>
      }
      footer={
        <>
          <Button type="button" variant="secondary" onClick={copy}>
            Copiar
          </Button>
          <Button type="button" variant="secondary" onClick={download}>
            Descargar
          </Button>
          <Button type="button" onClick={onDone}>
            Ya los guardé
          </Button>
        </>
      }
    >
      {codes.length > 0 ? (
        <ul
          className="grid max-w-xl grid-cols-2 gap-2 sm:grid-cols-5"
          aria-label="Códigos de respaldo"
        >
          {codes.map((code) => (
            <li
              key={code}
              className="rounded-lg border border-edge bg-surface-2 px-2 py-1.5 text-center font-mono text-sm tabular-nums"
            >
              {code}
            </li>
          ))}
        </ul>
      ) : (
        <Alert tone="info">
          Genera tus códigos de respaldo desde esta misma pestaña cuando termines.
        </Alert>
      )}
    </Panel>
  )
}
