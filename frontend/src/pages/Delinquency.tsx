import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import type { Me } from '../api/accounts'
import { getDelinquency } from '../api/payments'
import { buttonClass } from '../components/classes'
import { EmptyState, PageHeader, RowList, SearchInput, Spinner, Stat } from '../components/ui'
import { day, phoneText, rd } from '../lib/format'
import { useDebounced } from '../lib/hooks'
import { ACCESS, hasRole } from '../lib/roles'

const BUCKETS: Record<string, string> = {
  '1_7': '1–7 días',
  '8_30': '8–30 días',
  '31_60': '31–60 días',
  '61_90': '61–90 días',
  '90_mas': 'Más de 90',
}

/** P43: loans in arrears by bucket; counts and totals match the filters (F8). */
export function DelinquencyPage({ me }: { me: Me }) {
  const [bucket, setBucket] = useState('1_7')
  const [q, setQ] = useState('')
  const term = useDebounced(q.trim(), 300)
  const tray = useQuery({
    queryKey: ['delinquency', bucket, term],
    queryFn: () => getDelinquency({ tramo: bucket, q: term }),
    placeholderData: keepPreviousData,
  })
  const canCollect = hasRole(me, ACCESS.collect)
  const data = tray.data
  return (
    <>
      <PageHeader
        title="Atrasos"
        subtitle="Préstamos en atraso por tramo. Mora y días se recalculan cada noche y en cada cobro."
      />
      <div role="tablist" aria-label="Tramos" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {Object.entries(BUCKETS).map(([key, label]) => {
          const info = data?.buckets.find((b) => b.key === key)
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={bucket === key}
              onClick={() => setBucket(key)}
              className={`rounded-xl border p-3 text-left shadow-sm ${
                bucket === key
                  ? 'border-brand-700 bg-brand-100'
                  : 'border-edge bg-surface hover:bg-surface-2'
              } ${key === '90_mas' || key === '61_90' ? 'col-span-1' : ''}`}
            >
              <div className="text-[12.5px] text-muted">{label}</div>
              <div className="text-lg font-bold tabular-nums">{info?.count ?? '—'}</div>
              <div className="text-[12px] text-muted tabular-nums">
                {info ? rd(info.principal) : ''}
              </div>
            </button>
          )
        })}
      </div>
      <SearchInput
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por número o cliente…"
      />
      {tray.isPending ? (
        <Spinner />
      ) : data?.results.length ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat
              label={`Préstamos en ${BUCKETS[data.selected]}`}
              value={String(data.totals.count)}
            />
            <Stat label="Capital de estos préstamos" value={rd(data.totals.principal)} emphasis />
          </div>
          <RowList>
            {data.results.map((row) => (
              <li
                key={row.number}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <Link
                    to="/prestamos/$numero"
                    params={{ numero: row.number }}
                    className="font-semibold tabular-nums text-brand-700 hover:underline"
                  >
                    {row.number}
                  </Link>{' '}
                  <span className="text-sm">{row.customer_name}</span>
                  <div className="text-[12.5px] text-muted">
                    {row.days_past_due} días · {row.collector_name ?? 'sin cobrador'} ·{' '}
                    {row.last_payment_on ? `último pago ${day(row.last_payment_on)}` : 'sin pagos'}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="font-bold tabular-nums text-danger-600">{rd(row.overdue)}</div>
                    <div className="text-[12px] text-muted">vencido con mora</div>
                  </div>
                  {row.customer_phone ? (
                    <a
                      href={`tel:${row.customer_phone}`}
                      className={buttonClass('secondary', '!h-9')}
                      title={phoneText(row.customer_phone)}
                    >
                      Llamar
                    </a>
                  ) : null}
                  {canCollect ? (
                    <Link
                      to="/cobrar/$numero"
                      params={{ numero: row.number }}
                      className={buttonClass('primary', '!h-9')}
                    >
                      Cobrar
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </RowList>
          {data.totals.count > data.results.length ? (
            <p className="text-[12.5px] text-muted">
              Se muestran los {data.results.length} con más atraso; usa la búsqueda para encontrar
              los demás.
            </p>
          ) : null}
        </>
      ) : (
        <EmptyState>Ningún préstamo en este tramo.</EmptyState>
      )}
    </>
  )
}
