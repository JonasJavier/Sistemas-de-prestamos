import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { ApiError } from '../../api/client'
import {
  createBankAccount,
  deleteBankAccount,
  listBankAccounts,
  updateBankAccount,
  type BankAccount,
  type BankAccountPayload,
} from '../../api/platform'
import { usePrompt } from '../../components/Dialog'
import { Modal } from '../../components/Modal'
import { MoreMenu } from '../../components/MoreMenu'
import {
  Alert,
  Badge,
  Button,
  CheckRow,
  Field,
  Input,
  LoadError,
  Section,
  Select,
  Spinner,
  Table,
} from '../../components/ui'
import { errorMessage } from '../../lib/format'
import { notify } from '../../lib/toast'

/** Decision 125: the accounts the companies transfer the subscription to. */
export function BankAccountsPanel() {
  const queryClient = useQueryClient()
  const [dialog, ask] = usePrompt()
  const [editing, setEditing] = useState<BankAccount | 'new' | null>(null)
  const accounts = useQuery({ queryKey: ['platform-bank-accounts'], queryFn: listBankAccounts })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['platform-bank-accounts'] })
  const fail = (error: unknown, fallback: string) =>
    notify(
      error instanceof ApiError
        ? errorMessage(error.data as Record<string, string[]>, fallback)
        : fallback,
      'danger',
    )
  const toggle = useMutation({
    mutationFn: (account: BankAccount) =>
      updateBankAccount(account.id, { is_active: !account.is_active }),
    onSuccess: () => void refresh(),
    onError: (error) => fail(error, 'No se pudo cambiar la cuenta.'),
  })
  const remove = useMutation({
    mutationFn: async (account: BankAccount) => {
      const ok = await ask({
        title: `Borrar la cuenta de ${account.bank}`,
        description: 'Las empresas dejarán de verla al pagar.',
        confirmText: 'Borrar',
        danger: true,
      })
      if (ok === null) return null
      await deleteBankAccount(account.id)
      return account
    },
    onSuccess: (done) => {
      if (done) void refresh()
    },
    onError: (error) => fail(error, 'No se pudo borrar la cuenta.'),
  })

  return (
    <Section
      title="Cuentas para transferencias"
      aside="Las que ven las empresas al pagar la suscripción."
    >
      {dialog}
      {accounts.isPending ? <Spinner /> : null}
      {accounts.isError ? <LoadError error={accounts.error} /> : null}
      {accounts.data ? (
        <Table
          label="Cuentas bancarias"
          columns="minmax(0,1.2fr) minmax(0,1fr) minmax(0,1.2fr) 7rem 3rem"
          head={[
            { label: 'Banco' },
            { label: 'Número' },
            { label: 'Titular' },
            { label: 'Estado' },
            { label: '' },
          ]}
          footer={
            <Button size="sm" onClick={() => setEditing('new')}>
              Agregar cuenta
            </Button>
          }
        >
          {accounts.data.map((account) => (
            <li
              key={account.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 text-[13px] md:grid md:grid-cols-[var(--cols)] md:px-5"
            >
              <div className="min-w-0 basis-full md:basis-auto">
                <div className="truncate font-semibold">{account.bank}</div>
                <div className="text-[12px] text-muted">
                  {account.type === 'checking' ? 'Cuenta corriente' : 'Cuenta de ahorro'} ·{' '}
                  {account.currency}
                </div>
              </div>
              <span className="font-medium tabular-nums">{account.number}</span>
              <span className="truncate text-muted md:text-ink">{account.holder}</span>
              <span>
                <Badge tone={account.is_active ? 'success' : 'neutral'} dot>
                  {account.is_active ? 'Visible' : 'Oculta'}
                </Badge>
              </span>
              <span className="flex justify-end">
                <MoreMenu
                  compact
                  items={[
                    { label: 'Editar', onSelect: () => setEditing(account) },
                    {
                      label: account.is_active ? 'Ocultar' : 'Mostrar',
                      onSelect: () => toggle.mutate(account),
                    },
                    { label: 'Borrar', danger: true, onSelect: () => remove.mutate(account) },
                  ]}
                />
              </span>
            </li>
          ))}
          {accounts.data.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-muted">
              Sin cuentas: las empresas no sabrán a dónde transferir.
            </li>
          ) : null}
        </Table>
      ) : null}
      {editing ? (
        <AccountDialog
          account={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void refresh()
          }}
        />
      ) : null}
    </Section>
  )
}

function AccountDialog({
  account,
  onClose,
  onSaved,
}: {
  account: BankAccount | null
  onClose: () => void
  onSaved: () => void
}) {
  const [draft, setDraft] = useState<BankAccountPayload>(() => ({
    bank: account?.bank ?? '',
    type: account?.type ?? 'savings',
    number: account?.number ?? '',
    iban: account?.iban ?? '',
    holder: account?.holder ?? '',
    currency: account?.currency ?? 'DOP',
    is_active: account?.is_active ?? true,
    position: account?.position ?? 0,
  }))
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof BankAccountPayload>(key: K, value: BankAccountPayload[K]) =>
    setDraft({ ...draft, [key]: value })
  const save = useMutation({
    mutationFn: () => (account ? updateBankAccount(account.id, draft) : createBankAccount(draft)),
    onSuccess: () => {
      notify('Cuenta guardada.', 'success')
      onSaved()
    },
    onError: (failure) =>
      setError(
        failure instanceof ApiError
          ? errorMessage(failure.data as Record<string, string[]>, 'Revisa los datos.')
          : 'No se pudo guardar la cuenta.',
      ),
  })
  const valid = draft.bank.trim() && draft.number.trim() && draft.holder.trim()
  return (
    <Modal onClose={onClose} labelledBy="bank-title">
      <form
        className="w-full max-w-md space-y-4 rounded-2xl bg-surface p-5 shadow-xl"
        onSubmit={(event) => {
          event.preventDefault()
          if (valid) save.mutate()
        }}
      >
        <h2 id="bank-title" className="text-[18px] font-semibold">
          {account ? 'Editar cuenta' : 'Nueva cuenta'}
        </h2>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field label="Banco">
          <Input autoFocus value={draft.bank} onChange={(e) => set('bank', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <Select
              value={draft.type}
              onChange={(e) => set('type', e.target.value as BankAccount['type'])}
            >
              <option value="savings">Cuenta de ahorro</option>
              <option value="checking">Cuenta corriente</option>
            </Select>
          </Field>
          <Field label="Moneda">
            <Input value={draft.currency} onChange={(e) => set('currency', e.target.value)} />
          </Field>
        </div>
        <Field label="Número de cuenta">
          <Input
            inputMode="numeric"
            value={draft.number}
            onChange={(e) => set('number', e.target.value)}
          />
        </Field>
        <Field label="Cuenta estándar (opcional)" hint="El número largo que empieza con DO.">
          <Input value={draft.iban} onChange={(e) => set('iban', e.target.value)} />
        </Field>
        <Field label="Titular">
          <Input value={draft.holder} onChange={(e) => set('holder', e.target.value)} />
        </Field>
        <CheckRow
          label="Visible para las empresas"
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
