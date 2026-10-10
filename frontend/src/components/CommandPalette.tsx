import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'

import type { Me } from '../api/accounts'
import { globalSearch } from '../api/customers'
import { phoneText, rd } from '../lib/format'
import { useDebounced } from '../lib/hooks'
import { ACCESS, hasRole } from '../lib/roles'
import { CollectIcon, SearchIcon } from './icons'
import { Modal } from './Modal'

interface Option {
  key: string
  label: ReactNode
  hint?: ReactNode
  action?: boolean
  run: () => void
}

/** «buscar»: Ctrl+K; «cobrar»: the Cobrar button picks the loan to collect. */
export type PaletteIntent = 'buscar' | 'cobrar'

/** Ctrl+K global search (decision 017; P10): customers, loans and quick actions.
 * The shell mounts it while open, so every opening starts clean. */
export function CommandPalette({
  me,
  intent = 'buscar',
  onClose,
}: {
  me: Me
  intent?: PaletteIntent
  onClose: () => void
}) {
  const [mode, setMode] = useState<PaletteIntent>(intent)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const debounced = useDebounced(q, 250)
  const navigate = useNavigate()

  const term = debounced.trim()
  const results = useQuery({
    queryKey: ['global-search', term],
    queryFn: () => globalSearch(term),
    enabled: term.length >= 2,
  })

  const go = (to: string, params?: Record<string, string>) => {
    onClose()
    navigate({ to, params })
  }
  const originator = hasRole(me, ACCESS.originate)
  const collector = hasRole(me, ACCESS.collect)
  const collecting = mode === 'cobrar'

  const loanOptions: Option[] = (results.data?.loans ?? [])
    .filter((loan) => !collecting || loan.status === 'active')
    .map((loan) => ({
      key: `loan-${loan.number}`,
      label: (
        <>
          <span className="font-medium tabular-nums">
            {collecting ? 'Cobrar' : 'Préstamo'} {loan.number}
          </span>
          <span className="ml-2 text-muted">{loan.customer_name}</span>
        </>
      ),
      hint: rd(loan.principal_outstanding),
      run: () =>
        collecting
          ? go('/cobrar/$numero', { numero: loan.number })
          : go('/prestamos/$numero', { numero: loan.number }),
    }))
  const customerOptions: Option[] = (results.data?.customers ?? []).map((customer) => ({
    key: `customer-${customer.id}`,
    label: <span className="font-medium">{customer.display_name}</span>,
    hint: `${customer.document_number} · ${phoneText(customer.phone)}`,
    run: () => go('/clientes/$id', { id: customer.id }),
  }))
  // A loan number typed: loans first. A name or a document: the person first.
  const byNumber = (results.data?.loans ?? []).some((loan) =>
    loan.number.toLowerCase().includes(term.toLowerCase()),
  )
  const options: Option[] = [
    ...(collecting
      ? loanOptions
      : byNumber
        ? [...loanOptions, ...customerOptions]
        : [...customerOptions, ...loanOptions]),
    ...(collector && !collecting
      ? [
          {
            key: 'collect',
            label: 'Cobrar un préstamo…',
            action: true,
            run: () => {
              setMode('cobrar')
              setActive(0)
            },
          },
        ]
      : []),
    ...(originator && !collecting
      ? [
          {
            key: 'new-customer',
            label: '+ Nuevo cliente',
            action: true,
            run: () => go('/clientes/nuevo'),
          },
          {
            key: 'new-application',
            label: '+ Nueva solicitud',
            action: true,
            run: () => go('/solicitudes/nueva'),
          },
        ]
      : []),
  ]
  const current = Math.min(active, Math.max(options.length - 1, 0))
  const found = options.filter((option) => !option.action).length

  return (
    <Modal onClose={onClose} label="Búsqueda global" align="top">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-edge bg-surface shadow-xl">
        <div className="flex items-center gap-3 border-b border-edge px-4">
          <span className={collecting ? 'text-brand-700' : 'text-muted'}>
            {collecting ? <CollectIcon /> : <SearchIcon />}
          </span>
          <input
            autoFocus
            value={q}
            onChange={(event) => {
              setQ(event.target.value)
              setActive(0)
            }}
            placeholder={
              collecting
                ? 'Préstamo o cliente a cobrar…'
                : 'Buscar cliente, cédula, teléfono o número de préstamo…'
            }
            aria-label={collecting ? 'Préstamo a cobrar' : 'Buscar'}
            className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted/80"
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActive((current + 1) % Math.max(options.length, 1))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActive((current - 1 + options.length) % Math.max(options.length, 1))
              } else if (event.key === 'Enter') {
                options[current]?.run()
              }
            }}
          />
          <kbd className="hidden rounded-md border border-edge bg-surface-2 px-1.5 text-[11px] font-medium leading-5 text-muted sm:block">
            Esc
          </kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2" role="listbox" aria-label="Resultados">
          {term.length < 2 ? (
            <p className="px-3 py-2 text-[12.5px] text-muted">
              Escribe al menos 2 letras o números. Usa ↑ ↓ y Enter para elegir.
            </p>
          ) : results.isFetching && !results.data ? (
            <p className="px-3 py-2 text-sm text-muted">Buscando…</p>
          ) : results.data && found === 0 ? (
            <p className="px-3 py-2 text-sm text-muted">Sin resultados para «{term}».</p>
          ) : null}
          {options.map((option, index) => (
            <button
              key={option.key}
              type="button"
              role="option"
              aria-selected={index === current}
              onMouseEnter={() => setActive(index)}
              onClick={option.run}
              className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                index === current ? 'bg-brand-50 ring-1 ring-inset ring-brand-700/15' : ''
              } ${option.action ? 'text-brand-700' : ''} ${
                option.action && options[index - 1] && !options[index - 1].action
                  ? 'mt-1 border-t border-edge'
                  : ''
              }`}
            >
              <span className="min-w-0 truncate">{option.label}</span>
              {option.hint ? (
                <span className="shrink-0 text-[12.5px] text-muted tabular-nums">
                  {option.hint}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}
