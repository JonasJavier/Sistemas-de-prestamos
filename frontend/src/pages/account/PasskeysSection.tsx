import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  addPasskey,
  getPasskeyCreationOptions,
  listAuthenticators,
  removePasskey,
  renamePasskey,
  type PasskeyInfo,
} from '../../api/auth'
import { usePrompt } from '../../components/Dialog'
import { PasskeyIcon } from '../../components/icons'
import { Alert, Badge, Button, EmptyState, LoadError, Spinner } from '../../components/ui'
import { notify } from '../../lib/toast'
import {
  createPasskey,
  PasskeyCancelled,
  passkeysSupported,
  suggestedPasskeyName,
} from '../../lib/webauthn'
import { IdentityNotConfirmed, useConfirmIdentity } from './confirmIdentity'
import { Panel } from './Panel'

const when = (seconds: number) =>
  new Date(seconds * 1000).toLocaleDateString('es-DO', { dateStyle: 'medium' })

/** Mi cuenta › Llaves de acceso (decision 121): the fingerprint, the face or
 * the PIN of the device in place of the password and the code. */
export function PasskeysSection() {
  const queryClient = useQueryClient()
  const { run, dialog } = useConfirmIdentity()
  const [prompt, ask] = usePrompt()
  const [problem, setProblem] = useState<string | null>(null)
  const authenticators = useQuery({ queryKey: ['authenticators'], queryFn: listAuthenticators })
  const passkeys = (authenticators.data ?? []).filter(
    (item): item is PasskeyInfo => item.type === 'webauthn',
  )
  const supported = passkeysSupported()

  const refresh = () =>
    Promise.all(
      [['authenticators'], ['me'], ['totp']].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    )

  const add = useMutation({
    meta: { inlineError: true },
    mutationFn: async () => {
      const name = await ask({
        title: 'Nombre de la llave',
        description: 'Para reconocerla en esta lista, por ejemplo «Mi celular».',
        label: 'Nombre',
        initial: suggestedPasskeyName(),
        required: true,
        confirmText: 'Continuar',
      })
      if (name === null) return null
      const options = await run(() => getPasskeyCreationOptions())
      const credential = await createPasskey(options)
      return run(() => addPasskey(name.trim(), credential))
    },
    onSuccess: async (made) => {
      if (!made) return
      setProblem(null)
      notify('Llave de acceso creada.', 'success')
      await refresh()
    },
    onError: (error) => {
      if (error instanceof IdentityNotConfirmed) return
      if (error instanceof PasskeyCancelled) {
        setProblem('No se creó la llave: cerraste la ventana del dispositivo.')
        return
      }
      setProblem('No se pudo crear la llave en este dispositivo. Intenta de nuevo.')
    },
  })

  const rename = useMutation({
    meta: { inlineError: true },
    mutationFn: async (passkey: PasskeyInfo) => {
      const name = await ask({
        title: 'Cambiar el nombre',
        label: 'Nombre',
        initial: passkey.name,
        required: true,
        confirmText: 'Guardar',
      })
      if (name === null) return null
      return run(() => renamePasskey(passkey.id, name.trim()))
    },
    onSuccess: async (done) => {
      if (done) await refresh()
    },
    onError: (error) => {
      if (!(error instanceof IdentityNotConfirmed)) setProblem('No se pudo cambiar el nombre.')
    },
  })

  const remove = useMutation({
    meta: { inlineError: true },
    mutationFn: async (passkey: PasskeyInfo) => {
      const confirmed = await ask({
        title: `Quitar «${passkey.name}»`,
        description:
          'Ese dispositivo ya no podrá entrar con su llave. Si era tu único segundo paso, al entrar te pediremos configurarlo de nuevo.',
        confirmText: 'Quitar',
        danger: true,
      })
      if (confirmed === null) return null
      return run(() => removePasskey(passkey.id))
    },
    onSuccess: async (done) => {
      if (done === null) return
      notify('Llave quitada.', 'success')
      await refresh()
    },
    onError: (error) => {
      if (!(error instanceof IdentityNotConfirmed)) setProblem('No se pudo quitar la llave.')
    },
  })

  return (
    <>
      <Panel
        title="Llaves de acceso"
        description="Entra con la huella, la cara o el PIN de tu dispositivo, sin escribir contraseña ni código. Una llave vive solo en el dispositivo donde la creas (o en tu cuenta de Google o Apple, si la guardas ahí) y nadie puede copiarla."
        aside={
          passkeys.length > 0 ? (
            <Badge tone="success" dot>
              {passkeys.length === 1 ? '1 llave' : `${passkeys.length} llaves`}
            </Badge>
          ) : null
        }
        footer={
          supported ? (
            <Button type="button" disabled={add.isPending} onClick={() => add.mutate()}>
              {add.isPending ? 'Esperando al dispositivo…' : 'Crear una llave en este dispositivo'}
            </Button>
          ) : null
        }
      >
        {authenticators.isPending ? <Spinner /> : null}
        {authenticators.isError ? <LoadError error={authenticators.error} /> : null}
        {!supported ? (
          <Alert tone="info">
            Este navegador no puede crear llaves de acceso. Prueba desde tu celular o con un
            navegador más reciente.
          </Alert>
        ) : null}
        {problem ? <Alert tone="danger">{problem}</Alert> : null}
        {authenticators.data && passkeys.length === 0 ? (
          <EmptyState>
            Aún no tienes llaves. Crea una en el celular o la computadora que usas para trabajar.
          </EmptyState>
        ) : null}
        {passkeys.length > 0 ? (
          <ul className="divide-y divide-edge rounded-xl border border-edge">
            {passkeys.map((passkey) => (
              <li key={passkey.id} className="flex flex-wrap items-center gap-3 px-3.5 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-100 text-brand-800">
                  <PasskeyIcon />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{passkey.name}</div>
                  <div className="text-[12.5px] text-muted">
                    Creada el {when(passkey.created_at)}
                    {passkey.last_used_at ? ` · usada el ${when(passkey.last_used_at)}` : ''}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={rename.isPending}
                    onClick={() => rename.mutate(passkey)}
                  >
                    Renombrar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(passkey)}
                  >
                    Quitar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>
      {dialog}
      {prompt}
    </>
  )
}
