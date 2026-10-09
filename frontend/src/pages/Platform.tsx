import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { usePrompt } from '../components/Dialog'

import {
  getPlatformDashboard,
  listCompanies,
  reactivateCompany,
  recordPayment,
  suspendCompany,
  type PaymentPayload,
  type PlatformCompany,
} from '../api/platform'
import { Kpi } from '../components/Kpi'
import { SupportDialog } from '../components/Support'
import { Alert, Button, Card, Field, Input, LoadError, PageHeader, Spinner } from '../components/ui'
import { day, pct, STATUS_BADGES, todayISO } from '../lib/format'

/** PT2 (decision 091): companies, conversion, payments due and usage
 * counts; never a customer, a loan or an amount of a company. */
function PlatformDashboard() {
  const board = useQuery({ queryKey: ['platform-dashboard'], queryFn: getPlatformDashboard })
  const data = board.data
  if (board.isError) return <LoadError error={board.error} />
  if (!data) return <Spinner />
  const c = data.companies
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Empresas activas"
          value={String(c.active_paid)}
          hint={`${c.active} activas · ${c.suspended} suspendidas`}
          help={data.definitions.active}
        />
        <Kpi
          label="En prueba"
          value={String(c.trial)}
          hint={`${data.trials_ending.length} terminan en 7 días`}
        />
        <Kpi
          label={`Conversión de la prueba (${data.conversion.days} días)`}
          value={pct(data.conversion.rate, 0)}
          hint={`${data.conversion.converted} de ${data.conversion.ended} pruebas terminadas`}
          help={data.definitions.conversion}
        />
        <Kpi
          label={`Uso (${data.usage.days} días)`}
          value={`${data.usage.totals.active_users} usuarios`}
          hint={`${data.usage.totals.active_loans} préstamos activos · ${data.usage.totals.payments} cobros`}
          help={data.definitions.usage}
        />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="space-y-2">
          <h2 className="text-base font-semibold">Pagos por vencer o vencidos</h2>
          {data.payments_due.length ? (
            <ul className="divide-y divide-edge text-sm">
              {data.payments_due.map((row) => (
                <li key={row.id} className="flex justify-between gap-2 py-1.5">
                  <span>
                    {row.name} <span className="text-muted">· {row.plan}</span>
                  </span>
                  <span className={row.overdue ? 'text-danger-600' : 'text-muted'}>
                    {row.paid_until ? `pagada hasta ${day(row.paid_until)}` : 'sin pago'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nada por vencer esta semana.</p>
          )}
        </Card>
        <Card className="space-y-2">
          <h2 className="text-base font-semibold">Registros recientes</h2>
          <ul className="divide-y divide-edge text-sm">
            {data.recent.map((row) => (
              <li key={row.id} className="flex justify-between gap-2 py-1.5">
                <span>{row.name}</span>
                <span className="text-muted">
                  {STATUS_BADGES[row.status].text} · {day(row.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}

export function PlatformPage() {
  const [dialog, ask] = usePrompt()
  const queryClient = useQueryClient()
  const [paying, setPaying] = useState<PlatformCompany | null>(null)
  const [helping, setHelping] = useState<PlatformCompany | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const companies = useQuery({ queryKey: ['platform-companies'], queryFn: listCompanies })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['platform-companies'] })

  const suspend = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => suspendCompany(id, reason),
    onSuccess: refresh,
  })
  const reactivate = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => reactivateCompany(id, reason),
    onSuccess: refresh,
  })
  const pay = useMutation({
    mutationFn: ({ id, data }: { id: string; data: PaymentPayload }) => recordPayment(id, data),
    onSuccess: () => {
      setPaying(null)
      setMessage('Pago registrado: la empresa quedó activa.')
      refresh()
    },
    onError: () => setMessage('No se pudo registrar el pago. Revisa las fechas y el monto.'),
  })

  return (
    <>
      {dialog}
      <PageHeader
        title="Tablero de la plataforma"
        subtitle="Empresas, prueba, suscripciones y uso agregado. Nunca datos de clientes ni montos de una empresa."
      />
      {message ? <Alert tone="info">{message}</Alert> : null}
      <PlatformDashboard />

      <Card>
        {companies.isPending ? <p className="text-sm text-muted">Cargando…</p> : null}
        {companies.data ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge text-left text-[12.5px] text-muted">
                <th className="py-2 pr-3">Empresa</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3">Prueba hasta</th>
                <th className="py-2 pr-3">Pagada hasta</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {companies.data.results.map((company) => {
                const badge = STATUS_BADGES[company.status]
                return (
                  <tr key={company.id} className="border-b border-edge/60 last:border-0">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{company.trade_name || company.legal_name}</div>
                      <div className="text-muted">{company.rnc || 'Sin RNC'}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[12.5px] font-medium ${badge.classes}`}
                      >
                        {badge.text}
                      </span>
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{company.trial_ends_on ?? '—'}</td>
                    <td className="py-2 pr-3 tabular-nums">
                      {day(company.subscription?.paid_until)}
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setHelping(company)}>
                          Soporte
                        </Button>
                        <Button variant="secondary" onClick={() => setPaying(company)}>
                          Registrar pago
                        </Button>
                        {company.status === 'suspended' ? (
                          <Button
                            variant="secondary"
                            onClick={() =>
                              reactivate.mutate({
                                id: company.id,
                                reason: 'Reactivada por el dueño',
                              })
                            }
                          >
                            Reactivar
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            onClick={async () => {
                              const reason = await ask({
                                title: `Suspender ${company.trade_name || company.legal_name}`,
                                description: 'La empresa queda en solo lectura hasta reactivarla.',
                                label: 'Motivo de la suspensión',
                                type: 'textarea',
                                required: true,
                                confirmText: 'Suspender',
                                danger: true,
                              })
                              if (reason) suspend.mutate({ id: company.id, reason })
                            }}
                          >
                            Suspender
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : null}
      </Card>

      {helping ? <SupportDialog company={helping} onClose={() => setHelping(null)} /> : null}
      {paying ? (
        <PaymentForm
          company={paying}
          onCancel={() => setPaying(null)}
          onSubmit={(data) => pay.mutate({ id: paying.id, data })}
          pending={pay.isPending}
        />
      ) : null}
    </>
  )
}

function PaymentForm({
  company,
  onCancel,
  onSubmit,
  pending,
}: {
  company: PlatformCompany
  onCancel: () => void
  onSubmit: (data: PaymentPayload) => void
  pending: boolean
}) {
  const [data, setData] = useState<PaymentPayload>(() => ({
    period_start: todayISO(),
    period_end: '',
    amount: '',
    method: 'transfer',
    reference: '',
  }))

  return (
    <Card>
      <h2 className="mb-3 text-base font-semibold">
        Registrar pago · {company.trade_name || company.legal_name}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Inicio del período">
          <Input
            type="date"
            value={data.period_start}
            onChange={(e) => setData({ ...data, period_start: e.target.value })}
          />
        </Field>
        <Field label="Fin del período">
          <Input
            type="date"
            value={data.period_end}
            onChange={(e) => setData({ ...data, period_end: e.target.value })}
          />
        </Field>
        <Field label="Monto (RD$)">
          <Input
            inputMode="decimal"
            value={data.amount}
            onChange={(e) => setData({ ...data, amount: e.target.value })}
          />
        </Field>
        <Field label="Referencia (opcional)">
          <Input
            value={data.reference}
            onChange={(e) => setData({ ...data, reference: e.target.value })}
          />
        </Field>
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          onClick={() => onSubmit(data)}
          disabled={pending || !data.period_end || !data.amount}
        >
          {pending ? 'Registrando…' : 'Registrar y activar'}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </Card>
  )
}
