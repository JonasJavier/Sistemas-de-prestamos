import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { ApiError } from '../api/client'
import { simulate, type Simulation, type SimulationRequest } from '../api/lending'

const calm = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** The figure of the day counts up to its value in 1.2 s with a cubic ease-out
 * (decision 115); each refresh glides from the last value to the new one.
 * With reduced motion it just shows the value. */
export function useCountUp(target: number, duration = 1200): number {
  const still = calm()
  const [value, setValue] = useState(0)
  const shown = useRef(0)
  useEffect(() => {
    if (still) return
    const origin = shown.current
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration)
      const next = origin + (target - origin) * (1 - (1 - progress) ** 3)
      shown.current = next
      setValue(next)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, duration, still])
  return still ? target : value
}

/** Whether a media query matches now, following it as the window changes:
 * one copy of a block placed by width, never two hidden by CSS. */
export function useMedia(query: string) {
  return useSyncExternalStore(
    (listener) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', listener)
      return () => list.removeEventListener('change', listener)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** The browser tab says where the person is: «María Gómez · Cobradía». */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    if (!title) return
    document.title = `${title} · Cobradía`
    return () => {
      document.title = 'Cobradía'
    }
  }, [title])
}

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
