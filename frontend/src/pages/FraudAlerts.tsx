import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import type { Me } from '../api/accounts'
import {
  type FraudAlert,
  type FraudRule,
  listFraudAlerts,
  listFraudRules,
  reviewFraudAlert,
  updateFraudRule,
} from '../api/alerts'
import { ApiError } from '../api/client'
import { usePrompt } from '../components/Dialog'
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Input,
  PageHeader,
  Pagination,
  RowList,
  Spinner,
  Tabs,
} from '../components/ui'
import { errorMessage, moment, plural } from '../lib/format'
import { hasRole } from '../lib/roles'
import { notify } from '../lib/toast'

const TABS = [
  ['open', 'Por revisar'],
  ['reviewed', 'Revisadas'],
  ['rules', 'Reglas'],
] as const

function RuleRow({ rule, editable }: { rule: FraudRule; editable: boolean }) {
  const queryClient = useQueryClient()
  const [threshold, setThreshold] = useState(String(rule.threshold))
  const [windowDays, setWindowDays] = useState(String(rule.window_days))
  const save = useMutation({
    meta: { inlineError: true },
    mutationFn: (data: Parameters<typeof updateFraudRule>[1]) => updateFraudRule(rule.id, data),
    onSuccess: () => {
      notify('Regla guardada.', 'success')
      void queryClient.invalidateQueries({ queryKey: ['fraud-rules'] })
    },
    onError: (error) => {
      if (error instanceof ApiError) notify(errorMessage(error.data))
    },
  })
  const changed = threshold !== String(rule.threshold) || windowDays !== String(rule.window_days)
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{rule.label}</div>
        <div className="text-[12.5px] text-muted">
          Avisa con {rule.threshold} o más en {plural(rule.window_days, 'día')}
          {rule.is_active ? '' : ' · apagada'}
        </div>
      </div>
      {editable ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-[12.5px] text-muted">
            Umbral
            <span className="w-16">
              <Input
                inputMode="numeric"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
              />
            </span>
          </label>
          <label className="flex items-center gap-1 text-[12.5px] text-muted">
            Días
            <span className="w-16">
              <Input
                inputMode="numeric"
                value={windowDays}
                onChange={(e) => setWindowDays(e.target.value)}
              />
            </span>
          </label>
          <Button
            variant="secondary"
            className="!h-9"
            disabled={!changed || save.isPending}
            onClick={() =>
              save.mutate({ threshold: Number(threshold), window_days: Number(windowDays) })
            }
          >
            Guardar
          </Button>
          <Button
            variant="secondary"
            className="!h-9"
            disabled={save.isPending}
            onClick={() => save.mutate({ is_active: !rule.is_active })}
          >
            {rule.is_active ? 'Apagar' : 'Encender'}
          </Button>
        </div>
      ) : (
        <Badge tone={rule.is_active ? 'success' : 'neutral'}>
          {rule.is_active ? 'Encendida' : 'Apagada'}
        </Badge>
      )}
    </li>
  )
}

function AlertList({ status, editable }: { status: FraudAlert['status']; editable: boolean }) {
  const queryClient = useQueryClient()
  const [dialog, ask] = usePrompt()
  const [page, setPage] = useState(1)
  const alerts = useQuery({
    queryKey: ['fraud-alerts', status, page],
    queryFn: () => listFraudAlerts(status, page),
    placeholderData: keepPreviousData,
  })
  const review = useMutation({
    meta: { inlineError: true },
    mutationFn: async (alert: FraudAlert) => {
      const note = await ask({
        title: 'Revisar la alerta',
        description: alert.detail,
        label: 'Qué encontraste',
        type: 'textarea',
        required: true,
        confirmText: 'Marcar revisada',
      })
      return note === null ? null : reviewFraudAlert(alert.id, note)
    },
    onSuccess: (alert) => {
      if (!alert) return
      notify('Alerta revisada.', 'success')
      void queryClient.invalidateQueries({ queryKey: ['fraud-alerts'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
  const data = alerts.data
  return (
    <>
      {dialog}
      {review.error instanceof ApiError ? (
        <Alert tone="danger">{errorMessage(review.error.data)}</Alert>
      ) : null}
      {alerts.isPending ? (
        <Spinner />
      ) : data?.results.length ? (
        <>
          <RowList>
            {data.results.map((alert) => (
              <li
                key={alert.id}
                className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={alert.status === 'open' ? 'warning' : 'neutral'}>
                      {alert.kind_label}
                    </Badge>
                    {alert.subject ? (
                      <span className="font-semibold">{alert.subject.name}</span>
                    ) : null}
                  </div>
                  <div className="text-sm">{alert.detail}</div>
                  <div className="text-[12.5px] text-muted">
                    {moment(alert.created_at)} · umbral {alert.threshold} en{' '}
                    {plural(alert.window_days, 'día')}
                    {alert.reviewed_by
                      ? ` · revisada por ${alert.reviewed_by}: ${alert.review_note}`
                      : ''}
                  </div>
                </div>
                {editable && alert.status === 'open' ? (
                  <Button className="!h-9" onClick={() => review.mutate(alert)}>
                    Revisar
                  </Button>
                ) : null}
              </li>
            ))}
          </RowList>
          <Pagination page={page} count={data.count} onChange={setPage} />
        </>
      ) : (
        <EmptyState>
          {status === 'open'
            ? 'Nada por revisar. La revisión corre cada noche.'
            : 'Sin alertas revisadas.'}
        </EmptyState>
      )}
    </>
  )
}

/** P79 · Alertas antifraude (doc 06 §9, decision 090): each night the
 * patterns are counted per person; the manager reviews and tunes them. */
export function FraudAlertsPage({ me }: { me: Me }) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('open')
  const editable = hasRole(me, ['Gerente'])
  const rules = useQuery({
    queryKey: ['fraud-rules'],
    queryFn: listFraudRules,
    enabled: tab === 'rules',
  })
  return (
    <>
      <PageHeader
        title="Alertas antifraude"
        subtitle="Cada noche se cuentan los patrones inusuales por persona: reversos, condonaciones, diferencias de caja, accesos, cobros fuera de ruta, efectivo en mano y cambios de permisos."
      />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'rules' ? (
        rules.isPending ? (
          <Spinner />
        ) : (
          <>
            <p className="text-[12.5px] text-muted">
              Una misma alerta no se repite para la misma persona dentro de su ventana de días.
            </p>
            <RowList>
              {rules.data?.map((rule) => (
                <RuleRow
                  key={`${rule.id}-${rule.threshold}-${rule.window_days}`}
                  rule={rule}
                  editable={editable}
                />
              ))}
            </RowList>
          </>
        )
      ) : (
        <AlertList key={tab} status={tab} editable={editable} />
      )}
    </>
  )
}
