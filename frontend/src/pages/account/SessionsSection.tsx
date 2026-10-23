import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { endSessions, listSessions, type UserSessionInfo } from '../../api/auth'
import { DevicesIcon } from '../../components/icons'
import { Badge, Button, LoadError, Spinner } from '../../components/ui'
import { deviceText } from '../../lib/format'
import { Panel } from './Panel'

const since = (seconds: number) =>
  new Date(seconds * 1000).toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' })

/** Mi cuenta › Sesiones abiertas (doc 06 - 6): where the account is open,
 * and closing the rest. */
export function SessionsSection() {
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
    <Panel
      title="Sesiones abiertas"
      description="Los dispositivos donde tu cuenta está abierta ahora. Si no reconoces uno, ciérralo y cambia tu contraseña."
      footer={
        others.length > 0 ? (
          <Button
            variant="secondary"
            disabled={end.isPending}
            onClick={() => end.mutate(others.map((session) => session.id))}
          >
            Cerrar las demás
          </Button>
        ) : null
      }
    >
      {sessions.isPending ? <Spinner /> : null}
      {sessions.isError ? <LoadError error={sessions.error} /> : null}
      <ul className="divide-y divide-edge rounded-xl border border-edge">
        {ordered.map((session) => (
          <li key={session.id} className="flex flex-wrap items-center gap-3 px-3.5 py-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted">
              <DevicesIcon />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
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
                size="sm"
                disabled={end.isPending}
                onClick={() => end.mutate([session.id])}
              >
                Cerrar
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  )
}
