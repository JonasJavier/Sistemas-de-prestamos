import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'

import { ApiError } from '../../api/client'
import {
  changePlan,
  closeCompany,
  confirmProof,
  ownerProofFileUrl,
  rejectProof,
  extendTrial,
  getCompany,
  listPlans,
  reactivateCompany,
  recordPayment,
  resendVerification,
  resetManagerMfa,
  suspendCompany,
  type CompanyManager,
  type PaymentPayload,
  type PaymentProof,
  type PlatformCompanyDetail,
} from '../../api/platform'
import { buttonClass } from '../../components/classes'
import { DateInput } from '../../components/DateInput'
import { usePrompt } from '../../components/Dialog'
import { Modal } from '../../components/Modal'
import { MoreMenu, type MoreItem } from '../../components/MoreMenu'
import { SupportDialog } from '../../components/Support'
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Field,
  Input,
  LoadError,
  PageHeader,
  Section,
  Select,
  Spinner,
  Textarea,
} from '../../components/ui'
import {
  day,
  errorMessage,
  moment,
  rd,
  STATUS_BADGES,
  STATUS_TONE,
  todayISO,
  whole,
} from '../../lib/format'
import { notify } from '../../lib/toast'

const METHODS = { transfer: 'Transferencia', deposit: 'Depósito', other: 'Otro' } as const

/** PT1 (decision 122): the company's file. Lifecycle data and the people
 * who run it; never a customer, a loan or an amount of the company. */
export function CompanyFilePage() {
  const { id } = useParams({ from: '/app/plataforma/empresas/$id' })
  const queryClient = useQueryClient()
  const [dialog, ask] = usePrompt()
  const [paying, setPaying] = useState(false)
  const [extending, setExtending] = useState(false)
  const [changingPlan, setChangingPlan] = useState(false)
  const [helping, setHelping] = useState(false)
  const company = useQuery({ queryKey: ['platform-company', id], queryFn: () => getCompany(id) })

  const settle = (fresh: PlatformCompanyDetail, text: string) => {
    queryClient.setQueryData(['platform-company', id], fresh)
    void queryClient.invalidateQueries({ queryKey: ['platform-companies'] })
    void queryClient.invalidateQueries({ queryKey: ['platform-dashboard'] })
    notify(text, 'success')
  }
  const failed = (error: unknown, fallback: string) =>
    notify(
      error instanceof ApiError
        ? errorMessage(error.data as Record<string, string[]>, fallback)
        : fallback,
      'danger',
    )

  const suspend = useMutation({
    mutationFn: async () => {
      const reason = await ask({
        title: `Suspender ${name}`,
        description:
          'La empresa queda en solo lectura hasta reactivarla; sus usuarios ven el motivo al entrar.',
        label: 'Motivo',
        type: 'textarea',
        required: true,
        confirmText: 'Suspender',
        danger: true,
      })
      return reason === null ? null : suspendCompany(id, reason)
    },
    onSuccess: (fresh) => fresh && settle(fresh, 'Empresa suspendida.'),
    onError: (error) => failed(error, 'No se pudo suspender.'),
  })
  const reactivate = useMutation({
    mutationFn: async () => {
      const reason = await ask({
        title: `Reactivar ${name}`,
        description: 'Vuelve a operar: a su prueba si aún tiene días, o activa si ya pagó.',
        label: 'Motivo',
        type: 'textarea',
        required: true,
        confirmText: 'Reactivar',
      })
      return reason === null ? null : reactivateCompany(id, reason)
    },
    onSuccess: (fresh) => fresh && settle(fresh, 'Empresa reactivada.'),
    onError: (error) => failed(error, 'No se pudo reactivar.'),
  })
  const close = useMutation({
    mutationFn: async () => {
      const reason = await ask({
        title: `Cerrar ${name}`,
        description:
          'Para una baja pedida por la empresa. Su suscripción queda cancelada y nadie de la empresa puede operar; sus datos se conservan el plazo acordado.',
        label: 'Motivo',
        type: 'textarea',
        required: true,
        confirmText: 'Cerrar empresa',
        danger: true,
      })
      return reason === null ? null : closeCompany(id, reason)
    },
    onSuccess: (fresh) => fresh && settle(fresh, 'Empresa cerrada.'),
    onError: (error) => failed(error, 'No se pudo cerrar.'),
  })
  const pay = useMutation({
    mutationFn: (data: PaymentPayload) => recordPayment(id, data),
    onSuccess: (fresh) => {
      setPaying(false)
      settle(fresh, 'Pago registrado: la empresa quedó activa.')
    },
    onError: (error) =>
      failed(error, 'No se pudo registrar el pago. Revisa las fechas y el monto.'),
  })
  const extend = useMutation({
    mutationFn: (data: { days: number; reason: string }) => extendTrial(id, data),
    onSuccess: (fresh) => {
      setExtending(false)
      settle(fresh, `Prueba extendida hasta el ${day(fresh.trial_ends_on)}.`)
    },
    onError: (error) => failed(error, 'No se pudo extender la prueba.'),
  })
  const swapPlan = useMutation({
    mutationFn: (plan: string) => changePlan(id, plan),
    onSuccess: (fresh) => {
      setChangingPlan(false)
      settle(fresh, `Plan cambiado a «${fresh.subscription?.plan.name}».`)
    },
    onError: (error) => failed(error, 'No se pudo cambiar el plan.'),
  })
  const resetMfa = useMutation({
    mutationFn: async (manager: CompanyManager) => {
      const note = await ask({
        title: `Restablecer la verificación de ${manager.name}`,
        description:
          'Solo tras confirmar por otra vía que es esa persona. Su app, sus llaves y sus códigos dejan de servir, sus sesiones se cierran y le avisamos por correo; la empresa lo ve en su auditoría.',
        label: 'Cómo verificaste su identidad',
        type: 'textarea',
        required: true,
        confirmText: 'Restablecer',
        danger: true,
      })
      return note === null ? null : resetManagerMfa(id, manager.id, note)
    },
    onSuccess: (fresh) =>
      fresh && settle(fresh, 'Verificación restablecida: la persona la configurará al entrar.'),
    onError: (error) => failed(error, 'No se pudo restablecer la verificación.'),
  })
  const confirm = useMutation({
    mutationFn: async (proof: PaymentProof) => {
      const ok = await ask({
        title: `Confirmar el pago de ${name}`,
        description: `RD$ ${whole(proof.amount)} por el plan ${proof.plan_name} (${proof.period === 'annual' ? 'anual' : 'mensual'}). Se registra el pago, se aplica el plan y la empresa queda activa.`,
        confirmText: 'Confirmar pago',
      })
      return ok === null ? null : confirmProof(proof.id)
    },
    onSuccess: async (done) => {
      if (!done) return
      await queryClient.invalidateQueries({ queryKey: ['platform-company', id] })
      void queryClient.invalidateQueries({ queryKey: ['platform-dashboard'] })
      notify('Pago confirmado: la empresa quedó activa y lo sabe.', 'success')
    },
    onError: (error) => failed(error, 'No se pudo confirmar el pago.'),
  })
  const reject = useMutation({
    mutationFn: async (proof: PaymentProof) => {
      const reason = await ask({
        title: 'Rechazar el comprobante',
        description: 'La empresa verá este motivo y podrá enviar otro comprobante.',
        label: 'Motivo',
        type: 'textarea',
        required: true,
        confirmText: 'Rechazar',
        danger: true,
      })
      return reason === null ? null : rejectProof(proof.id, reason)
    },
    onSuccess: async (done) => {
      if (!done) return
      await queryClient.invalidateQueries({ queryKey: ['platform-company', id] })
      void queryClient.invalidateQueries({ queryKey: ['platform-dashboard'] })
      notify('Comprobante rechazado; la empresa fue avisada.', 'success')
    },
    onError: (error) => failed(error, 'No se pudo rechazar.'),
  })

  const resend = useMutation({
    mutationFn: (manager: CompanyManager) => resendVerification(id, manager.id),
    onSuccess: (_, manager) => notify(`Confirmación reenviada a ${manager.email}.`, 'success'),
    onError: (error) => failed(error, 'No se pudo reenviar la confirmación.'),
  })

  if (company.isPending) return <Spinner />
  if (company.isError) return <LoadError error={company.error} />
  const data = company.data
  const name = data.trade_name || data.legal_name
  const badge = STATUS_BADGES[data.status]
  const closed = data.status === 'closed'
  const subscription = data.subscription
  const more: MoreItem[] = closed
    ? [{ label: 'Reactivar', onSelect: () => reactivate.mutate() }]
    : [
        { label: 'Extender la prueba', onSelect: () => setExtending(true) },
        { label: 'Cambiar de plan', onSelect: () => setChangingPlan(true) },
        { label: 'Modo soporte', onSelect: () => setHelping(true) },
        data.status === 'suspended'
          ? { label: 'Reactivar', onSelect: () => reactivate.mutate() }
          : { label: 'Suspender', danger: true, onSelect: () => suspend.mutate() },
        { label: 'Cerrar empresa', danger: true, onSelect: () => close.mutate() },
      ]

  return (
    <>
      {dialog}
      <PageHeader
        back={
          <Link to="/plataforma" className="hover:underline">
            Empresas
          </Link>
        }
        title={name}
        subtitle={`${data.legal_name}${data.rnc ? ` · RNC ${data.rnc}` : ''} · registrada el ${day(data.created_at)}`}
        actions={
          <div className="flex items-center gap-2">
            {closed ? null : <Button onClick={() => setPaying(true)}>Registrar pago</Button>}
            <MoreMenu items={more} />
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <Card className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_TONE[data.status]} dot>
                {badge.text}
              </Badge>
              {subscription ? (
                <span className="text-[13px] text-muted">
                  Plan <strong className="text-ink">{subscription.plan.name}</strong>
                  {data.status === 'trial'
                    ? ` · la prueba termina el ${day(data.trial_ends_on)} (${data.trial_days_left} días)`
                    : subscription.paid_until
                      ? ` · pagada hasta el ${day(subscription.paid_until)}`
                      : ' · sin pago registrado'}
                </span>
              ) : null}
            </div>
            {data.status_reason ? (
              <Alert tone={data.status === 'suspended' || closed ? 'warning' : 'info'}>
                {data.status_reason}
              </Alert>
            ) : null}
            {data.support ? (
              <Alert tone="info">
                Soporte de solo lectura vigente hasta {moment(data.support.ends_at)}:{' '}
                {data.support.reason}.
              </Alert>
            ) : null}
            <div className="grid grid-cols-3 gap-3">
              <Use label="Usuarios activos" {...data.usage.users} />
              <Use label="Sucursales" {...data.usage.branches} />
              <Use label="Préstamos activos" {...data.usage.active_loans} />
            </div>
          </Card>

          <Section
            title="Quienes la administran"
            aside="Solo gerentes y administradores: a ellos se les puede ayudar a entrar."
          >
            <Card className="!p-0">
              <ul className="divide-y divide-edge">
                {data.managers.map((manager) => (
                  <li
                    key={manager.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-3 text-[13px] sm:px-5"
                  >
                    <Avatar name={manager.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{manager.name}</div>
                      <div className="truncate text-[12px] text-muted">
                        {manager.email}
                        {manager.last_login
                          ? ` · entró el ${moment(manager.last_login)}`
                          : ' · nunca ha entrado'}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {manager.is_active ? null : <Badge tone="warning">Desactivado</Badge>}
                      <Badge tone={manager.email_verified ? 'neutral' : 'warning'}>
                        {manager.email_verified ? 'Correo confirmado' : 'Correo sin confirmar'}
                      </Badge>
                      <Badge tone={manager.mfa_enabled ? 'success' : 'neutral'}>
                        {manager.mfa_enabled ? 'Dos pasos' : 'Sin dos pasos'}
                      </Badge>
                    </div>
                    {closed ? null : (
                      <MoreMenu
                        compact
                        items={[
                          ...(manager.email_verified
                            ? []
                            : [
                                {
                                  label: 'Reenviar confirmación del correo',
                                  onSelect: () => resend.mutate(manager),
                                },
                              ]),
                          ...(manager.mfa_enabled
                            ? [
                                {
                                  label: 'Restablecer verificación en dos pasos',
                                  danger: true,
                                  onSelect: () => resetMfa.mutate(manager),
                                },
                              ]
                            : []),
                        ]}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          </Section>

          {data.proofs.length ? (
            <Section
              title="Comprobantes enviados"
              aside="Confirma o rechaza los que están por revisar."
            >
              <Card className="!p-0">
                <ul className="divide-y divide-edge text-[13px]">
                  {data.proofs.map((proof) => (
                    <li
                      key={proof.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">
                          {proof.plan_name} · {proof.period === 'annual' ? 'anual' : 'mensual'} ·{' '}
                          <span className="tabular-nums">{rd(proof.amount)}</span>
                        </div>
                        <div className="text-[12px] text-muted">
                          {moment(proof.created_at)} · {proof.submitted_by}
                          {proof.reference ? ` · ref. ${proof.reference}` : ''}
                          {proof.status === 'rejected' ? ` · ${proof.rejection_reason}` : ''}
                        </div>
                      </div>
                      <Badge
                        tone={
                          proof.status === 'confirmed'
                            ? 'success'
                            : proof.status === 'rejected'
                              ? 'danger'
                              : 'warning'
                        }
                        dot
                      >
                        {proof.status === 'confirmed'
                          ? 'Confirmado'
                          : proof.status === 'rejected'
                            ? 'Rechazado'
                            : 'Por confirmar'}
                      </Badge>
                      <div className="flex gap-1.5">
                        <a
                          href={ownerProofFileUrl(proof.id)}
                          target="_blank"
                          rel="noreferrer"
                          className={buttonClass('secondary', '', 'sm')}
                        >
                          Ver comprobante
                        </a>
                        {proof.status === 'pending' ? (
                          <>
                            <Button size="sm" onClick={() => confirm.mutate(proof)}>
                              Confirmar pago
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => reject.mutate(proof)}>
                              Rechazar
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            </Section>
          ) : null}

          <Section title="Pagos de la suscripción" aside="Los que registraste al recibirlos.">
            <Card className="!p-0">
              {data.payments.length ? (
                <ul className="divide-y divide-edge text-[13px]">
                  {data.payments.map((payment) => (
                    <li
                      key={payment.id}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-5"
                    >
                      <span className="font-medium tabular-nums">
                        {day(payment.period_start)} → {day(payment.period_end)}
                      </span>
                      <span className="text-muted">
                        {METHODS[payment.method]}
                        {payment.reference ? ` · ${payment.reference}` : ''}
                      </span>
                      <span className="font-semibold tabular-nums">{rd(payment.amount)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-6 text-center text-sm text-muted">Sin pagos registrados.</p>
              )}
            </Card>
          </Section>
        </div>

        <div className="space-y-5">
          <Card>
            <h2 className="mb-3 text-[15px] font-semibold">Datos</h2>
            <dl className="space-y-2.5 text-[13px]">
              <Row label="Razón social">{data.legal_name}</Row>
              <Row label="Nombre comercial">{data.trade_name || '—'}</Row>
              <Row label="RNC">{data.rnc || '—'}</Row>
              <Row label="Teléfono">{data.phone || '—'}</Row>
              <Row label="Correo">{data.email || '—'}</Row>
              <Row label="Dirección">{data.address || '—'}</Row>
              <Row label="Términos">
                {data.terms_version
                  ? `v${data.terms_version} · ${day(data.terms_accepted_at)}`
                  : 'Sin registro'}
              </Row>
            </dl>
          </Card>
        </div>
      </div>

      {helping ? <SupportDialog company={data} onClose={() => setHelping(false)} /> : null}
      {paying ? (
        <PaymentDialog
          name={name}
          pending={pay.isPending}
          onCancel={() => setPaying(false)}
          onSubmit={(payload) => pay.mutate(payload)}
        />
      ) : null}
      {extending ? (
        <ExtendTrialDialog
          name={name}
          until={data.trial_ends_on}
          pending={extend.isPending}
          onCancel={() => setExtending(false)}
          onSubmit={(payload) => extend.mutate(payload)}
        />
      ) : null}
      {changingPlan ? (
        <PlanDialog
          current={subscription?.plan.id ?? ''}
          pending={swapPlan.isPending}
          onCancel={() => setChangingPlan(false)}
          onSubmit={(plan) => swapPlan.mutate(plan)}
        />
      ) : null}
    </>
  )
}

function Use({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const full = limit !== null && used >= limit
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2.5">
      <div className="text-[12px] text-muted">{label}</div>
      <div className={`text-[18px] font-semibold tabular-nums ${full ? 'text-warning-700' : ''}`}>
        {used}
        <span className="text-[13px] font-normal text-muted">
          {limit === null ? ' · sin límite' : ` de ${limit}`}
        </span>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium">{children}</dd>
    </div>
  )
}

function Frame({
  title,
  description,
  children,
  onClose,
}: {
  title: string
  description?: string
  children: ReactNode
  onClose: () => void
}) {
  return (
    <Modal onClose={onClose} label={title}>
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-surface p-5 shadow-xl">
        <div>
          <h2 className="text-[18px] font-semibold">{title}</h2>
          {description ? <p className="mt-0.5 text-[12.5px] text-muted">{description}</p> : null}
        </div>
        {children}
      </div>
    </Modal>
  )
}

function PaymentDialog({
  name,
  pending,
  onCancel,
  onSubmit,
}: {
  name: string
  pending: boolean
  onCancel: () => void
  onSubmit: (data: PaymentPayload) => void
}) {
  const [data, setData] = useState<PaymentPayload>(() => ({
    period_start: todayISO(),
    period_end: '',
    amount: '',
    method: 'transfer',
    reference: '',
  }))
  return (
    <Frame
      title={`Registrar pago · ${name}`}
      description="Un pago recibido por transferencia o depósito activa la empresa hasta el fin del período."
      onClose={onCancel}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Inicio del período">
          <DateInput
            value={data.period_start}
            onChange={(date) => setData({ ...data, period_start: date })}
          />
        </Field>
        <Field label="Fin del período">
          <DateInput
            value={data.period_end}
            onChange={(date) => setData({ ...data, period_end: date })}
          />
        </Field>
        <Field label="Monto (RD$)">
          <Input
            inputMode="decimal"
            autoFocus
            value={data.amount}
            onChange={(e) => setData({ ...data, amount: e.target.value })}
          />
        </Field>
        <Field label="Medio">
          <Select
            value={data.method}
            onChange={(e) =>
              setData({ ...data, method: e.target.value as PaymentPayload['method'] })
            }
          >
            {Object.entries(METHODS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Referencia (opcional)">
            <Input
              value={data.reference}
              onChange={(e) => setData({ ...data, reference: e.target.value })}
            />
          </Field>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          onClick={() => onSubmit(data)}
          disabled={pending || !data.period_end || !data.amount}
        >
          {pending ? 'Registrando…' : 'Registrar y activar'}
        </Button>
      </div>
    </Frame>
  )
}

function ExtendTrialDialog({
  name,
  until,
  pending,
  onCancel,
  onSubmit,
}: {
  name: string
  until: string | null
  pending: boolean
  onCancel: () => void
  onSubmit: (data: { days: number; reason: string }) => void
}) {
  const [days, setDays] = useState('15')
  const [reason, setReason] = useState('')
  const count = Number(days)
  const valid = Number.isInteger(count) && count >= 1 && count <= 90 && reason.trim() !== ''
  return (
    <Frame
      title={`Extender la prueba · ${name}`}
      description={`Hasta 90 días más${until ? `, contados desde el ${day(until)} o desde hoy si ya pasó` : ''}. Una empresa suspendida por fin de prueba vuelve a operar.`}
      onClose={onCancel}
    >
      <Field label="Días">
        <Input
          inputMode="numeric"
          autoFocus
          value={days}
          onChange={(e) => setDays(e.target.value)}
        />
      </Field>
      <Field label="Motivo">
        <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          disabled={pending || !valid}
          onClick={() => onSubmit({ days: count, reason: reason.trim() })}
        >
          {pending ? 'Extendiendo…' : 'Extender'}
        </Button>
      </div>
    </Frame>
  )
}

function PlanDialog({
  current,
  pending,
  onCancel,
  onSubmit,
}: {
  current: string
  pending: boolean
  onCancel: () => void
  onSubmit: (plan: string) => void
}) {
  const plans = useQuery({ queryKey: ['platform-plans'], queryFn: listPlans })
  const [plan, setPlan] = useState(current)
  const options = (plans.data ?? []).filter((item) => item.is_active || item.id === current)
  return (
    <Frame
      title="Cambiar de plan"
      description="Los límites del plan nuevo aplican de inmediato; el cobro sigue siendo manual."
      onClose={onCancel}
    >
      {plans.isPending ? <Spinner /> : null}
      <Field label="Plan">
        <Select value={plan} onChange={(e) => setPlan(e.target.value)}>
          {options.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {rd(item.monthly_price)}/mes
              {item.max_users !== null ? ` · ${item.max_users} usuarios` : ''}
              {item.is_trial ? ' · prueba' : ''}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button disabled={pending || !plan || plan === current} onClick={() => onSubmit(plan)}>
          {pending ? 'Cambiando…' : 'Cambiar'}
        </Button>
      </div>
    </Frame>
  )
}
