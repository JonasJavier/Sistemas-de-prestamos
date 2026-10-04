import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { logout, type SessionUser } from '../api/auth'
import { getMyCompany, type MyCompany } from '../api/platform'
import { Alert, Brand, Button, Card } from '../components/ui'

const STATUS_BADGES: Record<MyCompany['status'], { text: string; classes: string }> = {
  trial: { text: 'En prueba', classes: 'bg-brand-100 text-brand-800' },
  active: { text: 'Activa', classes: 'bg-success-600/15 text-success-600' },
  suspended: { text: 'Suspendida', classes: 'bg-warning-700/15 text-warning-700' },
  closed: { text: 'Cerrada', classes: 'bg-danger-600/15 text-danger-600' },
}

export function DashboardPage({ user }: { user: SessionUser }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const company = useQuery({ queryKey: ['my-company'], queryFn: getMyCompany })

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['session'] })
      navigate({ to: '/entrar' })
    },
  })

  const data = company.data
  const badge = data ? STATUS_BADGES[data.status] : null

  return (
    <div className="min-h-screen">
      <header className="flex h-14 items-center justify-between border-b border-edge bg-surface px-4">
        <Brand className="text-xl" />
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">{user.email}</span>
          <Button
            variant="secondary"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
          >
            Salir
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        {data?.status === 'trial' && typeof data.trial_days_left === 'number' ? (
          <Alert tone="info">
            Te quedan <strong>{data.trial_days_left} días</strong> de prueba gratis.
          </Alert>
        ) : null}
        {data?.status === 'suspended' ? (
          <Alert tone="warning">
            {data.status_reason || 'La empresa está suspendida: solo lectura.'}
          </Alert>
        ) : null}

        <Card>
          {company.isPending ? <p className="text-sm text-muted">Cargando…</p> : null}
          {data ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h1 className="text-xl font-semibold">{data.trade_name || data.legal_name}</h1>
                {badge ? (
                  <span
                    className={`rounded-full px-3 py-1 text-[12.5px] font-medium ${badge.classes}`}
                  >
                    {badge.text}
                  </span>
                ) : null}
              </div>
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-muted">Plan</dt>
                  <dd className="font-medium">{data.subscription?.plan.name ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted">Pagada hasta</dt>
                  <dd className="font-medium tabular-nums">
                    {data.subscription?.paid_until ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">RNC</dt>
                  <dd className="font-medium tabular-nums">{data.rnc || '—'}</dd>
                </div>
              </dl>
            </div>
          ) : null}
        </Card>

        <Card>
          <h2 className="text-base font-semibold">Fase 1 · Cimientos</h2>
          <p className="mt-1 text-sm text-muted">
            Aquí vivirá el tablero. Lo próximo: sucursales, usuarios e invitaciones desde la
            pantalla de Ajustes.
          </p>
        </Card>
      </main>
    </div>
  )
}
