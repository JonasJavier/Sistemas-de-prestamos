import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { ApiError } from '../../api/client'
import {
  createPlan,
  deletePlan,
  listPlans,
  updatePlan,
  type PlanPayload,
  type PlanTier,
  type PlatformPlan,
} from '../../api/platform'
import { usePrompt } from '../../components/Dialog'
import { Modal } from '../../components/Modal'
import { MoreMenu } from '../../components/MoreMenu'
import {
  Alert,
  Badge,
  Button,
  CheckRow,
  EmptyState,
  Field,
  Input,
  LoadError,
  PageHeader,
  Select,
  Spinner,
  Table,
} from '../../components/ui'
import { errorMessage, rd } from '../../lib/format'
import { TIER_LABELS } from '../../lib/plan'
import { notify } from '../../lib/toast'

const cap = (value: number | null) => (value === null ? 'Sin límite' : String(value))

/** PT3 (decision 122): the plans and their caps, kept by the owner. The
 * prices are a commercial call; this screen only records it. */
export function PlansPage() {
  const queryClient = useQueryClient()
  const [dialog, ask] = usePrompt()
  const [editing, setEditing] = useState<PlatformPlan | 'new' | null>(null)
  const plans = useQuery({ queryKey: ['platform-plans'], queryFn: listPlans })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['platform-plans'] })

  const remove = useMutation({
    mutationFn: async (plan: PlatformPlan) => {
      const confirmed = await ask({
        title: `Borrar el plan «${plan.name}»`,
        description: 'Solo se borra un plan sin empresas; los demás se desactivan.',
        confirmText: 'Borrar',
        danger: true,
      })
      if (confirmed === null) return null
      await deletePlan(plan.id)
      return plan
    },
    onSuccess: (plan) => {
      if (!plan) return
      notify(`Plan «${plan.name}» borrado.`, 'success')
      void refresh()
    },
    onError: (error) =>
      notify(
        error instanceof ApiError
          ? errorMessage(error.data as Record<string, string[]>, 'No se pudo borrar el plan.')
          : 'No se pudo borrar el plan.',
        'danger',
      ),
  })
  const toggle = useMutation({
    mutationFn: (plan: PlatformPlan) => updatePlan(plan.id, { is_active: !plan.is_active }),
    onSuccess: (plan) => {
      notify(
        plan.is_active ? `«${plan.name}» vuelve a ofrecerse.` : `«${plan.name}» desactivado.`,
        'success',
      )
      void refresh()
    },
    onError: (error) =>
      notify(
        error instanceof ApiError
          ? errorMessage(error.data as Record<string, string[]>, 'No se pudo cambiar el plan.')
          : 'No se pudo cambiar el plan.',
        'danger',
      ),
  })

  return (
    <>
      {dialog}
      <PageHeader
        title="Planes"
        subtitle="Precio mensual y límites de cada plan. Una empresa nueva entra con el plan de prueba."
        actions={<Button onClick={() => setEditing('new')}>Nuevo plan</Button>}
      />
      {plans.isPending ? <Spinner /> : null}
      {plans.isError ? <LoadError error={plans.error} /> : null}
      {plans.data ? (
        plans.data.length ? (
          <Table
            label="Planes"
            columns="minmax(0,1.4fr) 8rem 6rem 6.5rem 7rem 6rem 3rem"
            head={[
              { label: 'Plan' },
              { label: 'Mensual', align: 'right' },
              { label: 'Usuarios', align: 'right' },
              { label: 'Sucursales', align: 'right' },
              { label: 'Préstamos', align: 'right' },
              { label: 'Empresas', align: 'right' },
              { label: '' },
            ]}
          >
            {plans.data.map((plan) => (
              <li
                key={plan.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 text-[13px] md:grid md:grid-cols-[var(--cols)] md:px-5"
              >
                <div className="flex min-w-0 basis-full items-center gap-2 md:basis-auto">
                  <span className="truncate font-semibold">{plan.name}</span>
                  <span className="text-[12px] text-muted">{TIER_LABELS[plan.tier]}</span>
                  {plan.is_trial ? <Badge tone="gold">Prueba</Badge> : null}
                  {plan.is_active ? null : <Badge tone="warning">Desactivado</Badge>}
                </div>
                <span className="font-semibold tabular-nums md:text-right">
                  {rd(plan.monthly_price)}
                </span>
                <span className="tabular-nums md:text-right">{cap(plan.max_users)}</span>
                <span className="tabular-nums md:text-right">{cap(plan.max_branches)}</span>
                <span className="tabular-nums md:text-right">{cap(plan.max_active_loans)}</span>
                <span className="tabular-nums md:text-right">{plan.companies}</span>
                <span className="flex justify-end">
                  <MoreMenu
                    compact
                    items={[
                      { label: 'Editar', onSelect: () => setEditing(plan) },
                      {
                        label: plan.is_active ? 'Desactivar' : 'Volver a ofrecer',
                        onSelect: () => toggle.mutate(plan),
                      },
                      ...(plan.companies === 0
                        ? [{ label: 'Borrar', danger: true, onSelect: () => remove.mutate(plan) }]
                        : []),
                    ]}
                  />
                </span>
              </li>
            ))}
          </Table>
        ) : (
          <EmptyState action={<Button onClick={() => setEditing('new')}>Nuevo plan</Button>}>
            Todavía no hay planes.
          </EmptyState>
        )
      ) : null}
      {editing ? (
        <PlanDialog
          plan={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void refresh()
          }}
        />
      ) : null}
    </>
  )
}

interface Draft {
  name: string
  monthly_price: string
  max_users: string
  max_branches: string
  max_active_loans: string
  is_trial: boolean
  is_active: boolean
  tier: PlanTier
}

const text = (value: number | null) => (value === null ? '' : String(value))
const limit = (value: string) => (value.trim() === '' ? null : Number(value))

function PlanDialog({
  plan,
  onClose,
  onSaved,
}: {
  plan: PlatformPlan | null
  onClose: () => void
  onSaved: () => void
}) {
  const [draft, setDraft] = useState<Draft>(() => ({
    name: plan?.name ?? '',
    monthly_price: plan?.monthly_price ?? '',
    max_users: text(plan?.max_users ?? null),
    max_branches: text(plan?.max_branches ?? null),
    max_active_loans: text(plan?.max_active_loans ?? null),
    is_trial: plan?.is_trial ?? false,
    is_active: plan?.is_active ?? true,
    tier: plan?.tier ?? 'empresa',
  }))
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft({ ...draft, [key]: value })
  const payload = (): PlanPayload => ({
    name: draft.name.trim(),
    monthly_price: draft.monthly_price.trim() || '0',
    currency: 'DOP',
    max_users: limit(draft.max_users),
    max_branches: limit(draft.max_branches),
    max_active_loans: limit(draft.max_active_loans),
    is_trial: draft.is_trial,
    is_active: draft.is_active,
    tier: draft.tier,
  })
  const save = useMutation({
    mutationFn: () => (plan ? updatePlan(plan.id, payload()) : createPlan(payload())),
    onSuccess: (saved) => {
      notify(`Plan «${saved.name}» guardado.`, 'success')
      onSaved()
    },
    onError: (failure) =>
      setError(
        failure instanceof ApiError
          ? errorMessage(failure.data as Record<string, string[]>, 'Revisa los datos del plan.')
          : 'No se pudo guardar el plan.',
      ),
  })
  const numbers = [draft.max_users, draft.max_branches, draft.max_active_loans].every(
    (value) => value.trim() === '' || (Number.isInteger(Number(value)) && Number(value) >= 0),
  )
  const valid =
    draft.name.trim() !== '' && numbers && !Number.isNaN(Number(draft.monthly_price || '0'))

  return (
    <Modal onClose={onClose} labelledBy="plan-title">
      <form
        className="w-full max-w-md space-y-4 rounded-2xl bg-surface p-5 shadow-xl"
        onSubmit={(event) => {
          event.preventDefault()
          if (valid) save.mutate()
        }}
      >
        <div>
          <h2 id="plan-title" className="text-[18px] font-semibold">
            {plan ? `Editar «${plan.name}»` : 'Nuevo plan'}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted">
            Un límite vacío significa sin límite. Los cambios aplican a las empresas que ya tienen
            el plan.
          </p>
        </div>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field label="Nombre">
          <Input autoFocus value={draft.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Precio mensual (RD$)">
          <Input
            inputMode="decimal"
            value={draft.monthly_price}
            onChange={(e) => set('monthly_price', e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Usuarios">
            <Input
              inputMode="numeric"
              value={draft.max_users}
              onChange={(e) => set('max_users', e.target.value)}
            />
          </Field>
          <Field label="Sucursales">
            <Input
              inputMode="numeric"
              value={draft.max_branches}
              onChange={(e) => set('max_branches', e.target.value)}
            />
          </Field>
          <Field label="Préstamos activos">
            <Input
              inputMode="numeric"
              value={draft.max_active_loans}
              onChange={(e) => set('max_active_loans', e.target.value)}
            />
          </Field>
        </div>
        <Field label="Funciones que incluye">
          <Select value={draft.tier} onChange={(e) => set('tier', e.target.value as PlanTier)}>
            <option value="esencial">Esencial: la oficina</option>
            <option value="profesional">Profesional: la calle (rutas, cobranza, mensajes…)</option>
            <option value="empresa">Empresa: todo (contabilidad, fiscal, legal…)</option>
          </Select>
        </Field>
        <CheckRow
          label="Es el plan de prueba"
          hint="El que recibe cada empresa al registrarse; solo puede haber uno activo."
          checked={draft.is_trial}
          onChange={(e) => set('is_trial', e.target.checked)}
        />
        <CheckRow
          label="Se ofrece"
          hint="Desactivado, nadie puede pasar a este plan; las empresas que lo tienen siguen igual."
          checked={draft.is_active}
          onChange={(e) => set('is_active', e.target.checked)}
        />
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!valid || save.isPending}>
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
