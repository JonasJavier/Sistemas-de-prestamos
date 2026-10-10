import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import type { Me } from '../api/accounts'
import { ApiError } from '../api/client'
import {
  enterSupport,
  getCompanySupport,
  grantSupport,
  leaveSupport,
  listSupportGrants,
  type PlatformCompany,
  revokeSupport,
  revokeSupportAsOwner,
} from '../api/platform'
import { errorMessage, moment } from '../lib/format'
import { notify } from '../lib/toast'
import { Modal } from './Modal'
import { Alert, Badge, Button, Card, Field, Input, Spinner, Textarea } from './ui'

/** PT4 (decision 091): always on screen while the owner reads a company. */
export function SupportBanner({ me }: { me: Me }) {
  const leave = useMutation({
    mutationFn: leaveSupport,
    onSuccess: () => window.location.assign('/plataforma'),
  })
  if (!me.support) return null
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 border-b border-gold-500/40 bg-gold-100 px-4 py-2 text-sm text-gold-800"
    >
      <span>
        <strong>Modo soporte · solo lectura</strong> en {me.company_name} hasta{' '}
        {moment(me.support.ends_at)}. Cada pantalla queda registrada para la empresa.
      </span>
      <Button variant="secondary" size="sm" onClick={() => leave.mutate()}>
        Salir del modo soporte
      </Button>
    </div>
  )
}

/** From the company's file in the platform panel: grant, enter, revoke. */
export function SupportDialog({
  company,
  onClose,
}: {
  company: PlatformCompany
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const [hours, setHours] = useState('72')
  const grants = useQuery({
    queryKey: ['support-grants', company.id],
    queryFn: () => listSupportGrants(company.id),
  })
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ['support-grants', company.id] })
  const create = useMutation({
    meta: { inlineError: true },
    mutationFn: () => grantSupport(company.id, { reason, hours: Number(hours) }),
    onSuccess: () => {
      setReason('')
      notify('Acceso de soporte creado: la empresa ya lo ve.', 'success')
      refresh()
    },
  })
  const enter = useMutation({
    meta: { inlineError: true },
    mutationFn: enterSupport,
    onSuccess: () => window.location.assign('/'),
  })
  const revoke = useMutation({
    meta: { inlineError: true },
    mutationFn: revokeSupportAsOwner,
    onSuccess: refresh,
  })
  const error = [create.error, enter.error, revoke.error].find((e) => e instanceof ApiError)
  const name = company.trade_name || company.legal_name
  return (
    <Modal onClose={onClose} labelledBy="support-title">
      <div className="max-h-[92vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-2xl bg-surface p-5 shadow-xl">
        <h2 id="support-title" className="text-lg font-semibold">
          Modo soporte · {name}
        </h2>
        <p className="text-[12.5px] text-muted">
          Acceso temporal de solo lectura: la empresa lo ve en Ajustes, puede revocarlo y cada
          pantalla que abras queda registrada.
        </p>
        {error instanceof ApiError ? <Alert tone="danger">{errorMessage(error.data)}</Alert> : null}
        {grants.isPending ? (
          <Spinner />
        ) : grants.data?.length ? (
          <ul className="divide-y divide-edge text-sm">
            {grants.data.map((grant) => (
              <li key={grant.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge tone={grant.active ? 'success' : 'neutral'}>
                      {grant.active ? 'Vigente' : grant.revoked_at ? 'Revocado' : 'Terminado'}
                    </Badge>
                    <span className="truncate">{grant.reason}</span>
                  </div>
                  <div className="text-[12px] text-muted">
                    {moment(grant.starts_at)} → {moment(grant.revoked_at ?? grant.ends_at)}
                  </div>
                </div>
                {grant.active ? (
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => revoke.mutate(grant.id)}>
                      Revocar
                    </Button>
                    <Button variant="soft" size="sm" onClick={() => enter.mutate(grant.id)}>
                      Entrar
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <Field label="Motivo">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        </Field>
        <Field label="Duración (horas, hasta 168)">
          <Input inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          <Button disabled={!reason.trim() || create.isPending} onClick={() => create.mutate()}>
            Dar acceso de soporte
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** Ajustes (doc 06 §10): the company sees every support access and read. */
export function CompanySupportCard() {
  const queryClient = useQueryClient()
  const support = useQuery({ queryKey: ['company-support'], queryFn: getCompanySupport })
  const revoke = useMutation({
    mutationFn: revokeSupport,
    onSuccess: () => {
      notify('Acceso de soporte revocado.', 'success')
      void queryClient.invalidateQueries({ queryKey: ['company-support'] })
    },
  })
  const data = support.data
  if (!data || (!data.active && !data.grants.length)) return null
  const active = data.active
  return (
    <Card className="space-y-3">
      <h2 className="text-base font-semibold">Soporte de Cobradía</h2>
      {active ? (
        <Alert tone="warning">
          Soporte de Cobradía tiene acceso de lectura hasta {moment(active.ends_at)}. Motivo:{' '}
          {active.reason}.{' '}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => revoke.mutate(active.id)}
          >
            Revocar ahora
          </button>
        </Alert>
      ) : (
        <p className="text-[12.5px] text-muted">Sin acceso de soporte vigente.</p>
      )}
      <details>
        <summary className="cursor-pointer text-sm">
          Historial de accesos y pantallas vistas
        </summary>
        <ul className="mt-2 space-y-1 text-[12.5px]">
          {data.grants.map((grant) => (
            <li key={grant.id}>
              {moment(grant.starts_at)} → {moment(grant.revoked_at ?? grant.ends_at)} ·{' '}
              {grant.reason}
              {grant.revoked_at ? ' · revocado' : ''}
            </li>
          ))}
        </ul>
        {data.reads.length ? (
          <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto text-[12px] text-muted">
            {data.reads.map((read, index) => (
              <li key={index}>
                {moment(read.at)} · {read.path}
              </li>
            ))}
          </ul>
        ) : null}
      </details>
    </Card>
  )
}
