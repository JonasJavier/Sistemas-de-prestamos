import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { globalSearch } from '../api/customers'

/** Ctrl+K global search (decision 017; P10). Customers now, loans in phase 3. */
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((value) => !value)
      }
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) {
      setQ('')
      setDebounced('')
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(q), 250)
    return () => clearTimeout(timer)
  }, [q])

  const results = useQuery({
    queryKey: ['global-search', debounced],
    queryFn: () => globalSearch(debounced),
    enabled: open && debounced.trim().length >= 2,
  })

  if (!open) return null

  const go = (to: string, params?: Record<string, string>) => {
    setOpen(false)
    navigate({ to, params })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-24"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-edge bg-surface shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Buscar cliente por nombre, cédula o teléfono…"
          className="w-full border-b border-edge bg-surface px-4 py-3 text-sm text-ink outline-none"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              const first = results.data?.customers[0]
              if (first) go('/clientes/$id', { id: first.id })
            }
          }}
        />
        <div className="max-h-80 overflow-y-auto p-2">
          {results.data?.customers.map((customer) => (
            <button
              key={customer.id}
              type="button"
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-brand-100"
              onClick={() => go('/clientes/$id', { id: customer.id })}
            >
              <span className="font-medium">{customer.display_name}</span>
              <span className="text-[12.5px] text-muted tabular-nums">
                {customer.document_number} · {customer.phone}
              </span>
            </button>
          ))}
          {results.data && results.data.customers.length === 0 && debounced.length >= 2 ? (
            <p className="px-3 py-2 text-sm text-muted">Sin resultados.</p>
          ) : null}
          <button
            type="button"
            className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-edge px-3 py-2 text-left text-sm text-brand-700 hover:bg-brand-100"
            onClick={() => go('/clientes/nuevo')}
          >
            + Nuevo cliente
          </button>
        </div>
      </div>
    </div>
  )
}
