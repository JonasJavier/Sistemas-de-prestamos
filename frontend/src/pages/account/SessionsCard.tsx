import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { endSessions, listSessions, type UserSessionInfo } from '../../api/auth'
import { Badge, Button, Card, Spinner } from '../../components/ui'
import { deviceText } from '../../lib/format'

const since = (seconds: number) =>
  new Date(seconds * 1000).toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' })

/** Doc 06 - 6: the user sees where the account is open and closes the rest. */
export function SessionsCard() {
  const queryClient = useQueryClient()
  const sessions = useQuery({ queryKey: ['user-sessions'], queryFn: listSessions })
  const end = useMutation({
    mutationFn: (ids: number[]) => endSessions(ids),
    onSuccess: (remaining) => queryClient.setQueryData(['user-sessions'], remaining),
  })
  const others = (sessions.data ?? []).filter((session) => !session.is_current)
  const ordered: UserSessionInfo[] = [
    ...(sessions.data ?? []).filter((session) => session.is_current),
    ...others,
  ]

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Sesiones abiertas</h2>
          <p className="text-sm text-muted">
            Si no reconoces un dispositivo, ciérralo y cambia tu contraseña.
          </p>
        </div>
        {others.length > 0 ? (
          <Button
            variant="secondary"
            disabled={end.isPending}
            onClick={() => end.mutate(others.map((session) => session.id))}
          >
            Cerrar las demás
          </Button>
        ) : null}
      </div>
      {sessions.isPending ? <Spinner /> : null}
      <ul className="divide-y divide-edge">
        {ordered.map((session) => (
          <li key={session.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium">
                {deviceText(session.user_agent)}
                {session.is_current ? <Badge tone="brand">Esta sesión</Badge> : null}
              </div>
              <div className="text-[12.5px] text-muted tabular-nums">
                Desde {since(session.created_at)} · IP {session.ip}
              </div>
            </div>
            {!session.is_current ? (
              <Button
                variant="secondary"
                disabled={end.isPending}
                onClick={() => end.mutate([session.id])}
              >
                Cerrar
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  )
}
