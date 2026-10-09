import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { listBranches, type Me } from '../api/accounts'
import { listScores } from '../api/reports'
import { ExportButtons } from '../components/ExportButtons'
import { GradeBadge, ScoreFactors } from '../components/Grade'
import {
  EmptyState,
  Field,
  PageHeader,
  Pagination,
  RowList,
  SearchInput,
  Select,
  Spinner,
} from '../components/ui'
import { dateOf } from '../lib/format'
import { hasRole } from '../lib/roles'

/** P62 · Clasificación de clientes (decision 088): grade, points and why. */
export function ScoresPage({ me }: { me: Me }) {
  const [grade, setGrade] = useState('')
  const [branch, setBranch] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<string>()
  const wide = hasRole(me, ['Gerente', 'Auditoría'])
  const branches = useQuery({ queryKey: ['branches'], queryFn: listBranches, enabled: wide })
  const list = useQuery({
    queryKey: ['scores', grade, branch, q, page],
    queryFn: () =>
      listScores({ grado: grade, sucursal: branch || undefined, q: q || undefined, page }),
    placeholderData: keepPreviousData,
  })
  const data = list.data
  const cards = [
    ...(data?.grades ?? []).map((g) => ({
      key: g.grade as string,
      title: `${g.grade} · ${g.label}`,
      hint: g.grade === 'D' ? `menos de 50` : `${g.min} o más`,
      count: data?.counts[g.grade as 'A'] ?? 0,
    })),
    {
      key: 'sin',
      title: 'Sin historial',
      hint: 'sin cuotas vencidas',
      count: data?.counts.none ?? 0,
    },
  ]
  const pick = (value: string) => {
    setGrade(grade === value ? '' : value)
    setPage(1)
  }
  return (
    <>
      <PageHeader
        title="Clasificación de clientes"
        subtitle="Puntos sobre 100: cuotas pagadas a tiempo (50), días promedio de atraso (30), antigüedad (10) y préstamos saldados (10). Se recalcula cada noche."
        actions={
          hasRole(me, ['Gerente', 'Supervisor', 'Auditoría']) ? (
            <ExportButtons
              report="clasificacion"
              filters={{ grado: grade || undefined, sucursal: branch || undefined }}
            />
          ) : null
        }
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {cards.map((card) => (
          <button
            key={card.key}
            type="button"
            aria-pressed={grade === card.key}
            onClick={() => pick(card.key)}
            className={`rounded-xl border p-3 text-left shadow-sm ${
              grade === card.key ? 'border-brand-700 bg-brand-100' : 'border-edge bg-surface'
            }`}
          >
            <div className="text-[12.5px] text-muted">{card.title}</div>
            <div className="font-display text-xl font-bold tabular-nums">{card.count}</div>
            <div className="text-[11.5px] text-muted">{card.hint}</div>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <SearchInput
          aria-label="Buscar cliente"
          placeholder="Buscar por nombre o cédula"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(1)
          }}
        />
        {wide && (branches.data?.results.length ?? 0) > 1 ? (
          <Field label="Sucursal">
            <Select
              value={branch}
              onChange={(e) => {
                setBranch(e.target.value)
                setPage(1)
              }}
            >
              <option value="">Todas</option>
              {branches.data?.results.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>
      {list.isPending ? (
        <Spinner />
      ) : data?.results.length ? (
        <>
          <RowList>
            {data.results.map((row) => (
              <li key={row.customer.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to="/clientes/$id"
                      params={{ id: row.customer.id }}
                      className="font-semibold hover:underline"
                    >
                      {row.customer.name}
                    </Link>
                    <div className="text-[12.5px] text-muted">
                      {row.customer.branch} · calculada el {dateOf(row.computed_at)}
                      {row.previous_grade && row.previous_grade !== row.grade
                        ? ` · antes ${row.previous_grade}`
                        : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {row.score ? (
                      <span className="tabular-nums text-sm">{row.score} pts</span>
                    ) : null}
                    <GradeBadge grade={row.grade} label={row.label} />
                    <button
                      type="button"
                      aria-expanded={open === row.customer.id}
                      onClick={() =>
                        setOpen(open === row.customer.id ? undefined : row.customer.id)
                      }
                      className="text-sm font-semibold text-brand-700 hover:underline"
                    >
                      ¿Por qué?
                    </button>
                  </div>
                </div>
                {open === row.customer.id ? (
                  <div className="mt-3 max-w-xl">
                    <ScoreFactors factors={row.factors} />
                  </div>
                ) : null}
              </li>
            ))}
          </RowList>
          <Pagination page={page} count={data.count} onChange={setPage} />
        </>
      ) : (
        <EmptyState>
          Sin clientes con esos filtros. La clasificación se calcula cada noche para los clientes
          con préstamos.
        </EmptyState>
      )}
    </>
  )
}
