import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState, type ReactNode } from 'react'

import type { Me } from '../api/accounts'
import { globalSearch } from '../api/customers'
import { phoneText, rd } from '../lib/format'
import { useDebounced } from '../lib/hooks'
import { ACCESS, hasRole } from '../lib/roles'

interface Option {
  key: string
  label: ReactNode
  hint?: ReactNode
  action?: boolean
  run: () => void
}

/** Ctrl+K global search (decision 017; P10): customers, loans and quick actions.
 * The shell mounts it while open, so every opening starts clean. */
export function CommandPalette({ me, onClose }: { me: Me; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const debounced = useDebounced(q, 250)
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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

  const options: Option[] = [
    ...(results.data?.loans ?? []).map((loan) => ({
      key: `loan-${loan.number}`,
      label: (
        <>
          <span className="font-medium tabular-nums">Préstamo {loan.number}</span>
          <span className="ml-2 text-muted">{loan.customer_name}</span>
        </>
      ),
      hint: rd(loan.principal_outstanding),
      run: () => go('/prestamos/$numero', { numero: loan.number }),
    })),
    ...(results.data?.customers ?? []).map((customer) => ({
      key: `customer-${customer.id}`,
      label: <span className="font-medium">{customer.display_name}</span>,
      hint: `${customer.document_number} · ${phoneText(customer.phone)}`,
      run: () => go('/clientes/$id', { id: customer.id }),
    })),
    ...(originator
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
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Búsqueda global"
        className="w-full max-w-lg overflow-hidden rounded-xl border border-edge bg-surface shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          autoFocus
          value={q}
          onChange={(event) => {
            setQ(event.target.value)
            setActive(0)
          }}
          placeholder="Buscar cliente, cédula, teléfono o número de préstamo…"
          aria-label="Buscar"
          className="w-full border-b border-edge bg-surface px-4 py-3 text-sm text-ink outline-none"
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
              className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm ${
                index === current ? 'bg-brand-100' : ''
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
    </div>
  )
}
