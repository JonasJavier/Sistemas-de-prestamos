import { useMutation } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'

import { verifyEmail } from '../api/auth'
import { Alert, Brand, Card } from '../components/ui'

export function VerifyEmailPage() {
  const { key } = useParams({ from: '/verificar-correo/$key' })
  const mutation = useMutation({ mutationFn: () => verifyEmail(key) })
  const fired = useRef(false)

  useEffect(() => {
    // The key is single-use: guard against StrictMode's double effect.
    if (fired.current) return
    fired.current = true
    mutation.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="max-w-md space-y-4 text-center">
        <Brand />
        {mutation.isPending ? <p className="text-sm text-muted">Confirmando tu correo…</p> : null}
        {mutation.isSuccess ? (
          <>
            <Alert tone="success">Tu correo quedó confirmado.</Alert>
            <Link to="/entrar" className="font-medium text-brand-700 hover:underline">
              Iniciar sesión
            </Link>
          </>
        ) : null}
        {mutation.isError ? (
          <>
            <Alert tone="danger">
              El enlace no es válido o ya venció. Vuelve a iniciar sesión para pedir otro.
            </Alert>
            <Link to="/entrar" className="font-medium text-brand-700 hover:underline">
              Ir a iniciar sesión
            </Link>
          </>
        ) : null}
      </Card>
    </main>
  )
}
