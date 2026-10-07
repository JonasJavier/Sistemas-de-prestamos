import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { usePrompt } from '../components/Dialog'

import { api, ApiError } from '../api/client'
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
} from '../components/ui'
import { day, errorMessage } from '../lib/format'

interface Holiday {
  id: string
  date: string
  name: string
  is_confirmed: boolean
}

const listHolidays = (year: number): Promise<Holiday[]> => api(`/api/v1/feriados/?year=${year}`)

/** P75 «Feriados»: unconfirmed holidays do not move due dates (doc 03 - 4). */
export function HolidaysPage() {
  const [dialog, ask] = usePrompt()
  const queryClient = useQueryClient()
  const current = new Date().getFullYear()
  const [year, setYear] = useState(current)
  const holidays = useQuery({ queryKey: ['holidays', year], queryFn: () => listHolidays(year) })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['holidays'] })
  const [date, setDate] = useState('')
  const [name, setName] = useState('')

  const add = useMutation({
    mutationFn: () => api('/api/v1/feriados/', { method: 'POST', body: { date, name } }),
    onSuccess: () => {
      setDate('')
      setName('')
      refresh()
    },
  })
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Holiday> }) =>
      api(`/api/v1/feriados/${id}/`, { method: 'PATCH', body: data }),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/v1/feriados/${id}/`, { method: 'DELETE' }),
    onSuccess: refresh,
  })
  const seed = useMutation({
    mutationFn: () => api('/api/v1/feriados/sembrar/', { method: 'POST', body: { year } }),
    onSuccess: refresh,
  })
  const failure = [add.error, update.error, remove.error, seed.error].find(
    (e) => e instanceof ApiError,
  ) as ApiError | undefined
  const pending = holidays.data?.filter((h) => !h.is_confirmed).length ?? 0

  return (
    <>
      {dialog}
      <PageHeader
        title="Feriados"
        subtitle="Las cuotas que caen en feriado confirmado pasan al siguiente día laborable; los préstamos ya desembolsados conservan sus fechas."
        actions={
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[current - 1, current, current + 1, current + 2].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        }
      />
      {pending > 0 ? (
        <Alert tone="warning">
          {pending} feriado{pending === 1 ? '' : 's'} trasladable{pending === 1 ? '' : 's'} sin
          confirmar (Ley 139-97): confírmalos o ajusta su fecha.
        </Alert>
      ) : null}
      {failure ? <Alert tone="danger">{errorMessage(failure.data)}</Alert> : null}

      <Card className="!p-0">
        {holidays.isPending ? (
          <div className="p-4">
            <Spinner />
          </div>
        ) : holidays.data && holidays.data.length > 0 ? (
          <ul className="divide-y divide-edge">
            {holidays.data.map((holiday) => (
              <li
                key={holiday.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
              >
                <span className="flex items-center gap-3">
                  <span className="w-24 tabular-nums">{day(holiday.date)}</span>
                  <span>{holiday.name}</span>
                  {holiday.is_confirmed ? (
                    <Badge tone="success">Confirmado</Badge>
                  ) : (
                    <Badge tone="warning">Por confirmar</Badge>
                  )}
                </span>
                <span className="flex items-center gap-3">
                  {!holiday.is_confirmed ? (
                    <button
                      type="button"
                      className="text-[12.5px] font-medium text-brand-700 hover:underline"
                      onClick={() =>
                        update.mutate({ id: holiday.id, data: { is_confirmed: true } })
                      }
                    >
                      Confirmar
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="text-[12.5px] font-medium text-brand-700 hover:underline"
                    onClick={async () => {
                      const next = await ask({
                        title: `Trasladar «${holiday.name}»`,
                        label: 'Nueva fecha',
                        type: 'date',
                        initial: holiday.date,
                        required: true,
                        confirmText: 'Trasladar',
                      })
                      if (next)
                        update.mutate({ id: holiday.id, data: { date: next, is_confirmed: true } })
                    }}
                  >
                    Trasladar
                  </button>
                  <button
                    type="button"
                    className="text-[12.5px] text-danger-600 hover:underline"
                    onClick={() => remove.mutate(holiday.id)}
                  >
                    Quitar
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-4 text-sm text-muted">
            Sin feriados en {year}.{' '}
            <button
              type="button"
              className="font-medium text-brand-700 hover:underline"
              onClick={() => seed.mutate()}
            >
              Cargar los feriados dominicanos de {year}
            </button>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 text-base font-semibold">Agregar feriado</h2>
        <p className="mb-3 text-[12.5px] text-muted">
          Viernes Santo y Corpus Christi cambian cada año: agrégalos aquí.
        </p>
        <form
          className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[180px_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault()
            add.mutate()
          }}
        >
          <Field label="Fecha">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Nombre">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Viernes Santo"
            />
          </Field>
          <Button type="submit" disabled={!date || !name || add.isPending}>
            Agregar
          </Button>
        </form>
      </Card>
    </>
  )
}
