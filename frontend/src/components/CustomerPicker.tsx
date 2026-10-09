import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { phoneText } from '../lib/format'

import { listCustomers, type CustomerListItem } from '../api/customers'
import { useDebounced } from '../lib/hooks'
import { Badge, Input } from './ui'

/** Search-first customer selection (F1 step 1): name, document or phone. */
export function CustomerPicker({
  onPick,
  exclude = [],
  placeholder = 'Buscar por nombre, cédula o teléfono…',
}: {
  onPick: (customer: CustomerListItem) => void
  exclude?: string[]
  placeholder?: string
}) {
  const [q, setQ] = useState('')
  const term = useDebounced(q.trim(), 250)
  const results = useQuery({
    queryKey: ['customers', { q: term }],
    queryFn: () => listCustomers({ q: term }),
    enabled: term.length >= 2,
  })
  const rows = (results.data?.results ?? []).filter((c) => !exclude.includes(c.id))
  return (
    <div className="space-y-2">
      <Input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {term.length >= 2 ? (
        <ul className="max-h-64 divide-y divide-edge overflow-y-auto rounded-lg border border-edge bg-surface">
          {rows.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">
              {results.isFetching ? 'Buscando…' : 'Sin resultados.'}
            </li>
          ) : (
            rows.map((customer) => (
              <li key={customer.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(customer)
                    setQ('')
                  }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-brand-100"
                >
                  <span>
                    <span className="font-medium">{customer.display_name}</span>
                    <span className="ml-2 text-muted tabular-nums">
                      {customer.document_number} · {phoneText(customer.phone)}
                    </span>
                  </span>
                  {customer.status === 'blocked' ? <Badge tone="danger">Bloqueado</Badge> : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
