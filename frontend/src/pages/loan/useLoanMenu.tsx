import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'

import type { Me } from '../../api/accounts'
import { ApiError } from '../../api/client'
import { renewLoan, type Loan } from '../../api/origination'
import {
  ArrowsIcon,
  BriefcaseIcon,
  CalendarIcon,
  InvoiceIcon,
  PencilIcon,
  RouteIcon,
  ScaleIcon,
  ShieldIcon,
  StampIcon,
} from '../../components/icons'
import type { MoreItem } from '../../components/MoreMenu'
import { Alert } from '../../components/ui'
import { errorMessage } from '../../lib/format'
import { ACCESS, hasRole } from '../../lib/roles'
import {
  CollectorDialog,
  DateChangeDialog,
  LegalCaseDialog,
  PayoffLetterDialog,
  RestructureDialog,
  VoidDialog,
  WriteOffDialog,
} from './LoanActions'

type Dialog = 'payoff' | 'dates' | 'collector' | 'restructure' | 'writeoff' | 'legal' | null

const ic = 'size-[18px] shrink-0'

/** The actions of a loan by role (doc 07 P32) with their dialogs, shared by
 * the loan's screen («Más») and the customer's file (its action list, decision
 * 114). The destructive ones come last, in red. */
export function useLoanMenu(me: Me, loan: Loan | undefined) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [voiding, setVoiding] = useState(false)
  const numero = loan?.number ?? ''
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['loan', numero] })
    void queryClient.invalidateQueries({ queryKey: ['loans'] })
  }
  const renewal = useMutation({
    meta: { inlineError: true },
    mutationFn: () => renewLoan(numero),
    onSuccess: (application) =>
      void navigate({ to: '/solicitudes/$id', params: { id: application.id } }),
  })
  if (!loan) return { items: [] as MoreItem[], dialogs: null as ReactNode, error: null }

  const active = loan.status === 'active'
  const terms = loan.current_terms
  const items: MoreItem[] = [
    {
      label: 'Estado de cuenta (PDF)',
      icon: <InvoiceIcon className={ic} />,
      onSelect: () =>
        window.open(
          `/api/v1/prestamos/${encodeURIComponent(numero)}/estado-de-cuenta/`,
          '_blank',
          'noopener',
        ),
    },
    ...(active && hasRole(me, ACCESS.payoffLetters)
      ? [
          {
            label: 'Carta de saldo',
            icon: <StampIcon className={ic} />,
            onSelect: () => setDialog('payoff'),
          },
        ]
      : []),
    ...(active && hasRole(me, ACCESS.supervise)
      ? [
          {
            label: 'Cambiar fechas',
            icon: <CalendarIcon className={ic} />,
            onSelect: () => setDialog('dates'),
          },
          {
            label: 'Cambiar cobrador',
            icon: <RouteIcon className={ic} />,
            onSelect: () => setDialog('collector'),
          },
        ]
      : []),
    ...(active && hasRole(me, ACCESS.originate)
      ? [
          {
            label: 'Renovar',
            icon: <ArrowsIcon className={ic} />,
            onSelect: () => renewal.mutate(),
          },
          {
            label: 'Reestructurar',
            icon: <PencilIcon className={ic} />,
            onSelect: () => setDialog('restructure'),
          },
        ]
      : []),
    ...((active || loan.status === 'written_off') && !loan.legal_case && hasRole(me, ['Gerente'])
      ? [
          {
            label: 'Enviar a la vía legal',
            icon: <ScaleIcon className={ic} />,
            onSelect: () => setDialog('legal'),
            danger: true,
          },
        ]
      : []),
    ...(active && hasRole(me, ACCESS.writeOff)
      ? [
          {
            label: 'Castigar',
            icon: <BriefcaseIcon className={ic} />,
            onSelect: () => setDialog('writeoff'),
            danger: true,
          },
        ]
      : []),
    ...(active && hasRole(me, ACCESS.voidLoans) && !voiding
      ? [
          {
            label: 'Anular',
            icon: <ShieldIcon className={ic} />,
            onSelect: () => setVoiding(true),
            danger: true,
          },
        ]
      : []),
  ]
  const close = () => {
    setDialog(null)
    refresh()
  }
  const dialogs = (
    <>
      {voiding ? (
        <VoidDialog
          number={numero}
          onDone={() => {
            setVoiding(false)
            refresh()
          }}
        />
      ) : null}
      {dialog === 'payoff' ? (
        <PayoffLetterDialog number={numero} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === 'legal' ? (
        <LegalCaseDialog
          number={numero}
          onClose={() => setDialog(null)}
          onOpened={(id) => void navigate({ to: '/legal/$id', params: { id } })}
        />
      ) : null}
      {dialog === 'writeoff' ? (
        <WriteOffDialog number={numero} me={me} daysPastDue={loan.days_past_due} onClose={close} />
      ) : null}
      {dialog === 'restructure' && terms ? (
        <RestructureDialog
          number={numero}
          current={{
            installments: terms.installments,
            frequency: terms.frequency,
            rate: terms.rate,
          }}
          onClose={close}
        />
      ) : null}
      {dialog === 'dates' ? <DateChangeDialog number={numero} onClose={close} /> : null}
      {dialog === 'collector' ? (
        <CollectorDialog number={numero} current={loan.collector} onClose={close} />
      ) : null}
    </>
  )
  const error =
    renewal.error instanceof ApiError ? (
      <Alert tone="danger">{errorMessage(renewal.error.data)}</Alert>
    ) : null
  return { items, dialogs, error }
}
