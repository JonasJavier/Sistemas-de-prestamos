import { useSyncExternalStore } from 'react'

/** The branch the figures are narrowed to («» = the whole company), chosen in
 * the top bar and read by the screens that honor it (decision 114). One
 * source of truth, like the theme; it lasts for the browser tab. */

const KEY = 'branch-scope'
const listeners = new Set<() => void>()

function read() {
  try {
    return sessionStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

let current = read()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setBranchScope(next: string) {
  current = next
  try {
    sessionStorage.setItem(KEY, next)
  } catch {
    // storage unavailable: the choice lasts until the page reloads
  }
  for (const listener of listeners) listener()
}

export function useBranchScope() {
  const branch = useSyncExternalStore(
    subscribe,
    () => current,
    () => '',
  )
  return [branch, setBranchScope] as const
}

/** The screens whose figures follow the branch of the top bar. */
export const SCOPED_PATHS = ['/']
