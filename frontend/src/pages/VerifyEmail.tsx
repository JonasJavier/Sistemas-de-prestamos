import { useMutation } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'

import { verifyEmail } from '../api/auth'
import { buttonClass } from '../components/classes'
import { Card, Outcome, PublicPage } from '../components/ui'

export function VerifyEmailPage() {
  const { key } = useParams({ from: '/verificar-correo/$key' })
  const mutation = useMutation({
    meta: { inlineError: true },
    mutationFn: () => verifyEmail(key),
  })
  const fired = useRef(false)

  useEffect(() => {
    // The key is single-use: guard against StrictMode's double effect.
    if (fired.current) return
    fired.current = true
    mutation.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return (
    <PublicPage>
      <Card className="space-y-4 text-center">
        {mutation.isPending ? <p className="text-sm text-muted">Confirmando tu correo…</p> : null}
        {mutation.isSuccess ? (
          <>
            <Outcome tone="success" title="Tu correo quedó confirmado">
              Ya puedes entrar a Cobradía.
            </Outcome>
            <Link to="/entrar" className={buttonClass('primary', 'w-full')}>
              Iniciar sesión
            </Link>
          </>
        ) : null}
        {mutation.isError ? (
          <>
            <Outcome tone="danger" title="El enlace no sirve">
              No es válido o ya venció. Vuelve a iniciar sesión para pedir otro.
            </Outcome>
            <Link to="/entrar" className={buttonClass('secondary', 'w-full')}>
              Ir a iniciar sesión
            </Link>
          </>
        ) : null}
      </Card>
    </PublicPage>
  )
}
