import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { ApiError } from '../api/client'
import { simulate, type Simulation, type SimulationRequest } from '../api/lending'

export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

/** The server quotes as the user types (doc 01, principle 3). */
export function useLiveQuote(request: SimulationRequest | null) {
  const debounced = useDebounced(request, 350)
  const quote = useQuery<Simulation, Error>({
    queryKey: ['simulate', debounced],
    queryFn: () => simulate(debounced!),
    enabled: debounced !== null,
    retry: false,
    placeholderData: (previous) => previous,
  })
  const fieldErrors =
    quote.error instanceof ApiError && quote.error.status === 400
      ? (quote.error.data as Record<string, string[] | string>)
      : null
  const errorText = (key: string) => {
    const value = fieldErrors?.[key]
    return Array.isArray(value) ? value[0] : value
  }
  return { quote, fieldErrors, errorText }
}
