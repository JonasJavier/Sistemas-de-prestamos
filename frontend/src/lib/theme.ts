import { useSyncExternalStore } from 'react'

/** One source of truth for the theme: the header toggle and the user menu
 * both read it, so switching in one never leaves the other with a stale
 * label. main.tsx applies the saved choice before the first paint. */

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function isDark() {
  return document.documentElement.classList.contains('dark')
}

export function setDark(next: boolean) {
  document.documentElement.classList.toggle('dark', next)
  try {
    localStorage.setItem('theme', next ? 'dark' : 'light')
  } catch {
    // storage unavailable: the choice just won't persist
  }
  for (const listener of listeners) listener()
}

export function useDarkTheme() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false)
  return [dark, () => setDark(!dark)] as const
}
