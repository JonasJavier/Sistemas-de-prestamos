import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { listUsers, type Me } from '../api/accounts'
import { ApiError } from '../api/client'
import {
  approveCommissions,
  calculateCommissions,
  COMMISSION_BASES,
  type CommissionRole,
  type CommissionRule,
  getCommissions,
  listCommissionRules,
  saveCommissionRule,
} from '../api/reports'
import { usePrompt } from '../components/Dialog'
import { ExportButtons } from '../components/ExportButtons'
import { Modal } from '../components/Modal'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  PercentInput,
  Select,
  Spinner,
} from '../components/ui'
import { dateOf, errorMessage, pct, rd, todayISO } from '../lib/format'
import { notify } from '../lib/toast'
import { hasRole } from '../lib/roles'

type Draft = Partial<CommissionRule>

function RuleDialog({ rule, onClose }: { rule: Draft; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<Draft>({ goal: '0', is_active: true, ...rule })
  const users = useQuery({ queryKey: ['users'], queryFn: listUsers })
  const set = (key: keyof Draft, value: unknown) => setForm({ ...form, [key]: value })
  const bases = COMMISSION_BASES.filter((b) => b.role === form.role)
  const people = (users.data?.results ?? []).filter((u) =>
    u.memberships.some((m) => m.role_name === form.role),
  )
  const save = useMutation({
    meta: { inlineError: true },
    mutationFn: () => saveCommissionRule(form),
    onSuccess: () => {
      notify('Regla guardada.', 'success')
      void queryClient.invalidateQueries({ queryKey: ['commission-rules'] })
      onClose()
    },
  })
  return (
    <Modal onClose={onClose} labelledBy="rule-title">
      <div className="max-h-[92vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-xl bg-surface p-5 shadow-xl">
        <h2 id="rule-title" className="text-lg font-semibold">
          {rule.id ? 'Editar regla' : 'Nueva regla de comisión'}
        </h2>
        <Field label="Nombre">
          <Input value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Rol">
            <Select
              value={form.role ?? ''}
              disabled={Boolean(rule.id)}
              onChange={(e) => {
                const role = e.target.value as CommissionRole
                setForm({
                  ...form,
                  role,
                  user: null,
                  base: COMMISSION_BASES.find((b) => b.role === role)?.value,
                })
              }}
            >
              <option value="">Elegir…</option>
              <option value="Cobrador">Cobrador</option>
              <option value="Oficial de crédito">Oficial de crédito</option>
            </Select>
          </Field>
          <Field label="Se calcula sobre">
            <Select
              value={form.base ?? ''}
              onChange={(e) => set('base', e.target.value)}
              disabled={!form.role}
            >
              {bases.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Porcentaje">
            <PercentInput value={form.rate ?? ''} onChange={(value) => set('rate', value)} />
          </Field>
          <Field label="Meta del mes (RD$, opcional)">
            <Input
              inputMode="decimal"
              value={form.goal ?? '0'}
              onChange={(e) => set('goal', e.target.value)}
            />
          </Field>
        </div>
        <Field label="Solo para esta persona (opcional)">
          <Select
            value={form.user ?? ''}
            disabled={Boolean(rule.id) || !form.role}
            onChange={(e) => set('user', e.target.value || null)}
          >
            <option value="">Todo el rol</option>
            {people.map((u) => (
              <option key={u.id} value={u.id}>
                {`${u.first_name} ${u.last_name}`.trim() || u.email}
              </option>
            ))}
          </Select>
        </Field>
        {rule.id ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active ?? true}
              onChange={(e) => set('is_active', e.target.checked)}
            />
            Activa
          </label>
        ) : null}
        <p className="text-[12.5px] text-muted">
          Con meta, se gana el porcentaje sobre toda la base solo si la base llega a la meta. Una
          regla para una persona reemplaza la de su rol.
        </p>
        {save.error instanceof ApiError ? (
          <Alert tone="danger">{errorMessage(save.error.data)}</Alert>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            Guardar
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function Rules({ editable }: { editable: boolean }) {
  const rules = useQuery({ queryKey: ['commission-rules'], queryFn: listCommissionRules })
  const [editing, setEditing] = useState<Draft>()
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Reglas</h2>
          <p className="text-[12.5px] text-muted">
            Al cobrador, por lo que cobra; al oficial, por lo que coloca.
          </p>
        </div>
        {editable ? (
          <Button variant="secondary" onClick={() => setEditing({})}>
            Nueva regla
          </Button>
        ) : null}
      </div>
      {rules.isPending ? (
        <Spinner />
      ) : rules.data?.length ? (
        <ul className="divide-y divide-edge text-sm">
          {rules.data.map((rule) => (
            <li key={rule.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <span className="font-semibold">{rule.name}</span>{' '}
                {rule.is_active ? null : <Badge tone="neutral">Inactiva</Badge>}
                <div className="text-[12.5px] text-muted">
                  {rule.user_name || `Todo el rol ${rule.role}`} · {pct(rule.rate)} de{' '}
                  {rule.base_label.toLowerCase()}
                  {Number(rule.goal) ? ` · meta ${rd(rule.goal)}` : ''}
                </div>
              </div>
              {editable ? (
                <Button variant="secondary" className="!h-8" onClick={() => setEditing(rule)}>
                  Editar
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>Sin reglas: nadie gana comisión todavía.</EmptyState>
      )}
      {editing ? <RuleDialog rule={editing} onClose={() => setEditing(undefined)} /> : null}
    </Card>
  )
}

/** P63 · Comisiones (decision 089): the month's calculation by person,
 * approved by the manager or accounting into payables. */
export function CommissionsPage({ me }: { me: Me }) {
  const queryClient = useQueryClient()
  const [dialog, ask] = usePrompt()
  const [month, setMonth] = useState(() => todayISO().slice(0, 7))
  const year = Number(month.slice(0, 4))
  const monthNumber = Number(month.slice(5, 7))
  const operate = hasRole(me, ['Gerente', 'Contabilidad'])
  // Approved once the month is over (the API says the same).
  const over = month < todayISO().slice(0, 7)
  const data = useQuery({
    queryKey: ['commissions', year, monthNumber],
    queryFn: () => getCommissions(year, monthNumber),
  })
  const refresh = (result: unknown) =>
    queryClient.setQueryData(['commissions', year, monthNumber], result)
  const calculate = useMutation({
    meta: { inlineError: true },
    mutationFn: () => calculateCommissions(year, monthNumber),
    onSuccess: (result) => {
      refresh(result)
      notify('Comisiones calculadas.', 'success')
    },
  })
  const approve = useMutation({
    meta: { inlineError: true },
    mutationFn: async (id: string) => {
      const ok = await ask({
        title: 'Aprobar las comisiones del mes',
        description:
          'Cada monto pasa a «Cuentas por pagar» a nombre del empleado, como gasto de personal del mes. Después ya no se recalcula.',
        confirmText: 'Aprobar',
      })
      return ok === null ? null : approveCommissions(id)
    },
    onSuccess: (result) => {
      if (!result) return
      refresh(result)
      notify('Comisiones aprobadas: quedaron en cuentas por pagar.', 'success')
    },
  })
  const run = data.data?.run
  const error = [calculate.error, approve.error].find((e) => e instanceof ApiError)
  return (
    <>
      {dialog}
      <PageHeader
        title="Comisiones"
        subtitle="Lo que gana cada cobrador y oficial en el mes según su regla. Al aprobarlas pasan a cuentas por pagar."
        actions={<ExportButtons report="comisiones" filters={{ mes: month }} />}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Mes">
              <Input
                type="month"
                max={todayISO().slice(0, 7)}
                value={month}
                onChange={(e) => e.target.value && setMonth(e.target.value)}
              />
            </Field>
            {operate && run?.status !== 'approved' ? (
              <Button
                variant="secondary"
                disabled={calculate.isPending}
                onClick={() => calculate.mutate()}
              >
                {run ? 'Recalcular' : 'Calcular'}
              </Button>
            ) : null}
            {operate && over && run?.status === 'draft' ? (
              <Button disabled={approve.isPending} onClick={() => approve.mutate(run.id)}>
                Aprobar
              </Button>
            ) : null}
          </div>
          {error instanceof ApiError ? (
            <Alert tone="danger">{errorMessage(error.data)}</Alert>
          ) : null}
          {data.isPending ? (
            <Spinner />
          ) : run ? (
            <Card className="space-y-3 !p-0">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
                <div className="flex items-center gap-2">
                  <Badge tone={run.status === 'approved' ? 'success' : 'info'}>
                    {run.status_label}
                  </Badge>
                  <span className="text-[12.5px] text-muted">
                    {run.status === 'approved'
                      ? `Aprobadas por ${run.approved_by} el ${dateOf(run.approved_at)}`
                      : `Calculadas por ${run.computed_by} el ${dateOf(run.computed_at)}`}
                  </span>
                </div>
                <span className="font-display text-lg font-bold tabular-nums">{rd(run.total)}</span>
              </div>
              {run.lines.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-max text-sm">
                    <thead>
                      <tr className="border-y border-edge text-left text-[12.5px] text-muted">
                        <th className="px-4 py-2 font-medium">Empleado</th>
                        <th className="px-3 py-2 font-medium">Regla</th>
                        <th className="px-3 py-2 text-right font-medium">Base</th>
                        <th className="px-3 py-2 text-right font-medium">%</th>
                        <th className="px-3 py-2 text-right font-medium">Meta</th>
                        <th className="px-3 py-2 text-right font-medium">Comisión</th>
                        <th className="px-4 py-2 font-medium">Por pagar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {run.lines.map((line) => (
                        <tr key={line.id} className="border-b border-edge/60">
                          <td className="px-4 py-2">
                            <div className="font-semibold">{line.user}</div>
                            <div className="text-[12px] text-muted">{line.role}</div>
                          </td>
                          <td className="px-3 py-2">
                            {line.rule}
                            <div className="text-[12px] text-muted">{line.base_label}</div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {rd(line.base_amount)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{pct(line.rate)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {Number(line.goal) ? rd(line.goal) : '—'}
                            {Number(line.goal) && !line.reached_goal ? (
                              <div className="text-[12px] text-warning-700">No la alcanzó</div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">
                            {rd(line.amount)}
                          </td>
                          <td className="px-4 py-2 text-[12.5px]">
                            {line.payable ? line.payable.status : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState>Nadie con una regla activa trabajó ese mes.</EmptyState>
              )}
            </Card>
          ) : (
            <EmptyState>
              Sin calcular. {operate ? 'Pulsa «Calcular» para ver lo de este mes.' : ''}
            </EmptyState>
          )}
        </div>
        <Rules editable={hasRole(me, ['Gerente'])} />
      </div>
    </>
  )
}
