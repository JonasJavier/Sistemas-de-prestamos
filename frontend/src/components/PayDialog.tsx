import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'

import { ApiError } from '../api/client'
import { submitPaymentProof, type BankAccount, type PublicPlan } from '../api/platform'
import { errorMessage, whole } from '../lib/format'
import { notify } from '../lib/toast'
import { Modal } from './Modal'
import { Alert, Button, Field, Input, Segmented } from './ui'

/** The bank accounts to transfer to, each number ready to copy. */
export function BankAccounts({ accounts }: { accounts: BankAccount[] }) {
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      notify('Número copiado.', 'success')
    } catch {
      notify('No se pudo copiar; escríbelo a mano.')
    }
  }
  if (!accounts.length) {
    return <p className="text-[13px] text-muted">Escríbenos y te enviamos los datos bancarios.</p>
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {accounts.map((account) => (
        <li key={account.id} className="rounded-xl border border-edge bg-surface-2/60 px-4 py-3">
          <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">
            {account.bank}
          </div>
          <div className="text-[12.5px] text-muted">
            {account.type === 'checking' ? 'Cuenta corriente' : 'Cuenta de ahorro'} ·{' '}
            {account.currency}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-display text-[22px] font-bold tracking-[-0.01em] tabular-nums">
              {account.number}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => copy(account.number)}
              aria-label={`Copiar el número de ${account.bank}`}
            >
              Copiar
            </Button>
          </div>
          <div className="text-[12.5px] text-muted">Titular: {account.holder}</div>
          {account.iban ? (
            <div className="mt-0.5 truncate text-[11.5px] text-muted tabular-nums">
              {account.iban}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

/** Decision 125: «Ya pagué»: the plan, the period, the amount and the
 * receipt; the owner confirms it from the panel. */
export function PayDialog({
  plan,
  accounts,
  yearly,
  onClose,
}: {
  plan: PublicPlan
  accounts: BankAccount[]
  yearly: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const titleId = useId()
  const [period, setPeriod] = useState<'monthly' | 'annual'>(yearly ? 'annual' : 'monthly')
  const [reference, setReference] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const price = Number(plan.monthly_price)
  const amount = period === 'annual' ? price * 10 : price

  const send = useMutation({
    meta: { inlineError: true },
    mutationFn: () => {
      if (!file) throw new Error('Adjunta el comprobante.')
      return submitPaymentProof({ plan: plan.id, period, amount, reference, file })
    },
    onSuccess: async () => {
      notify('Comprobante enviado. Te avisamos al confirmarlo, en el día.', 'success')
      await queryClient.invalidateQueries({ queryKey: ['company-payment'] })
      onClose()
    },
    onError: (failure) =>
      setError(
        failure instanceof ApiError
          ? errorMessage(failure.data as Record<string, string[]>, 'No se pudo enviar.')
          : failure instanceof Error
            ? failure.message
            : 'No se pudo enviar.',
      ),
  })

  return (
    <Modal onClose={onClose} labelledBy={titleId}>
      <form
        className="max-h-[92vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl bg-surface p-5 shadow-xl sm:p-6"
        onSubmit={(event) => {
          event.preventDefault()
          send.mutate()
        }}
      >
        <div>
          <h2 id={titleId} className="text-[18px] font-semibold">
            Activar el plan {plan.name}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted">
            Transfiere el monto a una de estas cuentas y súbenos el comprobante. Confirmamos el pago
            en el día y tu plan queda activo.
          </p>
        </div>
        <Segmented
          label="Período"
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'monthly', label: 'Mensual' },
            { value: 'annual', label: 'Anual', count: '· 2 meses gratis' },
          ]}
        />
        <div className="flex items-baseline justify-between rounded-xl bg-gold-100 px-4 py-3 ring-1 ring-inset ring-gold-500/30">
          <span className="text-[13px] text-gold-800">
            {period === 'annual' ? 'Pago anual (10 meses)' : 'Pago mensual'}
          </span>
          <span className="font-display text-[22px] font-bold text-ink">RD$ {whole(amount)}</span>
        </div>
        <BankAccounts accounts={accounts} />
        <Field label="Referencia o número de la transferencia (opcional)">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label="Comprobante (foto o PDF)" hint="Hasta 10 MB.">
          <input
            type="file"
            accept="image/*,.pdf,.heic"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-[13px] text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand-100 file:px-3 file:py-2 file:text-[13px] file:font-semibold file:text-brand-800"
          />
        </Field>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={send.isPending || !file}>
            {send.isPending ? 'Enviando…' : 'Enviar comprobante'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
