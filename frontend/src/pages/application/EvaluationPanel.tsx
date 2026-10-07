import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { ApiError } from '../../api/client'
import {
  addBudgetItem,
  deleteBudgetItem,
  type Application,
  type BudgetItem,
  type Evaluation,
} from '../../api/origination'
import { Alert, Button, Card, Field, Input, Select } from '../../components/ui'
import { errorMessage, pct, rd } from '../../lib/format'

const ALERT_TONE: Record<string, 'danger' | 'warning' | 'info'> = {
  customer_blocked: 'danger',
  guarantee_missing: 'danger',
  coverage_insufficient: 'danger',
  capacity_high: 'warning',
  capacity_unknown: 'warning',
  requirements_pending: 'warning',
  bureau_missing: 'info',
}

const KIND_TEXT: Record<BudgetItem['kind'], string> = {
  income: 'Ingreso',
  expense: 'Gasto',
  asset: 'Activo',
}

/** F3 step 2: capacity, alerts and the budget behind them. */
export function EvaluationPanel({
  application,
  evaluation,
  onChange,
}: {
  application: Application
  evaluation: Evaluation | undefined
  onChange: () => void
}) {
  const editable = application.can.edit
  const [kind, setKind] = useState<BudgetItem['kind']>('income')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const add = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      addBudgetItem({
        application: application.id,
        kind,
        description,
        monthly_amount: amount,
      }),
    onSuccess: () => {
      setDescription('')
      setAmount('')
      onChange()
    },
  })
  const remove = useMutation({ mutationFn: deleteBudgetItem, onSuccess: onChange })

  const ratio = evaluation?.capacity_ratio ? Number(evaluation.capacity_ratio) : null
  const limit = evaluation ? Number(evaluation.capacity_alert_ratio) : 0.4
  const ratioTone =
    ratio === null ? 'text-muted' : ratio > limit ? 'text-warning-700' : 'text-success-600'

  return (
    <Card className="space-y-4">
      <h2 className="text-base font-semibold">Evaluación</h2>
      {evaluation ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <div className="text-[12.5px] text-muted">Ingresos mensuales</div>
              <div className="font-semibold tabular-nums">{rd(evaluation.monthly_income)}</div>
            </div>
            <div>
              <div className="text-[12.5px] text-muted">Gastos mensuales</div>
              <div className="font-semibold tabular-nums">{rd(evaluation.monthly_expenses)}</div>
            </div>
            <div>
              <div className="text-[12.5px] text-muted">Cuota mensual equivalente</div>
              <div className="font-semibold tabular-nums">{rd(evaluation.monthly_payment)}</div>
            </div>
            <div>
              <div className="text-[12.5px] text-muted">Cuota / disponible</div>
              <div className={`font-display text-lg font-bold tabular-nums ${ratioTone}`}>
                {ratio === null ? 'Sin datos' : pct(ratio, 1)}
              </div>
              <div className="text-[11.5px] text-muted">alerta desde {pct(limit, 0)}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <span className="text-muted">Referencias verificadas: </span>
              <span className="font-medium">
                {evaluation.references_verified} de {evaluation.references_total}
              </span>
            </div>
            <div>
              <span className="text-muted">Cobertura: </span>
              <span className="font-medium">
                {evaluation.coverage ? `${evaluation.coverage}×` : '—'}
                {evaluation.min_coverage ? ` (mín. ${evaluation.min_coverage}×)` : ''}
              </span>
            </div>
            <div>
              <span className="text-muted">Préstamos: </span>
              <span className="font-medium">
                {evaluation.loans_active} activos de {evaluation.loans_total}
              </span>
            </div>
            <div>
              <span className="text-muted">Otras solicitudes: </span>
              <span className="font-medium">
                {Object.values(evaluation.previous_applications).reduce((a, b) => a + b, 0)}
              </span>
            </div>
          </div>
          {evaluation.alerts.length > 0 ? (
            <ul className="space-y-1.5">
              {evaluation.alerts.map((alert) => (
                <li key={alert.code}>
                  <Alert tone={ALERT_TONE[alert.code] ?? 'info'}>{alert.message}</Alert>
                </li>
              ))}
            </ul>
          ) : (
            <Alert tone="success">Sin alertas: la evaluación está completa.</Alert>
          )}
        </>
      ) : (
        <p className="text-sm text-muted">Calculando…</p>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold">Presupuesto mensual</h3>
        {application.budget_items.length === 0 ? (
          <p className="text-sm text-muted">
            Sin partidas. Los ingresos del expediente del cliente se cargan solos al crear la
            solicitud.
          </p>
        ) : (
          <ul className="divide-y divide-edge rounded-lg border border-edge">
            {application.budget_items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <span>
                  <span className="text-muted">{KIND_TEXT[item.kind]} · </span>
                  {item.description}
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums">{rd(item.monthly_amount)}</span>
                  {editable ? (
                    <button
                      type="button"
                      className="text-[12.5px] text-danger-600 hover:underline"
                      onClick={() => remove.mutate(item.id)}
                    >
                      Quitar
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        {editable ? (
          <form
            className="mt-3 grid grid-cols-2 items-end gap-2 sm:grid-cols-[120px_1fr_150px_auto]"
            onSubmit={(e) => {
              e.preventDefault()
              add.mutate()
            }}
          >
            <Field label="Tipo">
              <Select value={kind} onChange={(e) => setKind(e.target.value as BudgetItem['kind'])}>
                <option value="income">Ingreso</option>
                <option value="expense">Gasto</option>
                <option value="asset">Activo</option>
              </Select>
            </Field>
            <Field label="Descripción">
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <Field label="Monto mensual">
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Button
              type="submit"
              variant="secondary"
              disabled={!description || !amount || add.isPending}
            >
              Agregar
            </Button>
          </form>
        ) : null}
        {add.error instanceof ApiError ? (
          <div className="mt-2">
            <Alert tone="danger">{errorMessage(add.error.data)}</Alert>
          </div>
        ) : null}
      </div>
    </Card>
  )
}
