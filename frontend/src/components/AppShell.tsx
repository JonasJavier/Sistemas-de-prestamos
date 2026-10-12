import {
  useIsFetching,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'

import { getMe, type Me } from '../api/accounts'
import { logout, type SessionUser } from '../api/auth'
import { platformView } from '../lib/roles'
import { SCOPED_PATHS } from '../lib/scope'
import { CommandPalette, type PaletteIntent } from './CommandPalette'
import { crumbsFor, locate, navFor } from './shell/menu'
import { MobileBar } from './shell/MobileBar'
import { SectionNav } from './shell/SectionNav'
import { Sidebar } from './shell/Sidebar'
import { BranchPicker, PhoneBar, Topbar } from './shell/Topbar'
import { UserMenu } from './shell/UserMenu'
import { SupportBanner } from './Support'

const COLLAPSE_KEY = 'nav-collapsed'

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

const WIDE = '(min-width: 1024px)'

/** A desktop has room for the open menu; a tablet keeps the rail. */
function useWide() {
  return useSyncExternalStore(
    (listener) => {
      const query = window.matchMedia(WIDE)
      query.addEventListener('change', listener)
      return () => query.removeEventListener('change', listener)
    },
    () => window.matchMedia(WIDE).matches,
    () => true,
  )
}

/** A thin bar at the top while a screen loads its data or saves: the app
 * never looks frozen. Waits a moment so quick answers don't flash it. */
function TopProgress() {
  const loading = useIsFetching({ predicate: (query) => query.state.data === undefined })
  const saving = useIsMutating()
  const busy = loading + saving > 0
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!busy) return
    const timer = window.setTimeout(() => setShown(true), 180)
    return () => {
      window.clearTimeout(timer)
      setShown(false)
    }
  }, [busy])
  if (!busy || !shown) return null
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-0.5 overflow-hidden bg-brand-700/15"
    >
      <div className="h-full w-1/3 animate-progress rounded-full bg-brand-700" />
    </div>
  )
}

/** The frame of every screen (decision 114): the forest menu, the top bar
 * with the breadcrumbs, a section's own menu when it has one, and the bottom
 * bar of the phone. */
export function AppShell({
  user,
  me: initialMe,
  children,
}: {
  user: SessionUser
  me: Me
  children: ReactNode
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // The badges stay fresh: Me is re-read every minute while the app is open.
  const live = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    initialData: initialMe,
    refetchInterval: 60_000,
  })
  const me = live.data ?? initialMe
  const [searching, setSearching] = useState<PaletteIntent | null>(null)
  const closeSearch = useCallback(() => setSearching(null), [])
  const company = !platformView(me)

  // The menu folds to a rail of icons; the choice is remembered.
  const [folded, setFolded] = useState(readCollapsed)
  const wide = useWide()
  const collapsed = folded || !wide
  const toggleFolded = () => {
    const next = !folded
    setFolded(next)
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
    } catch {
      // storage unavailable: the choice lasts until the page reloads
    }
  }

  useEffect(() => {
    if (!company) return
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearching((value) => (value ? null : 'buscar'))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [company])

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      queryClient.clear()
      navigate({ to: '/entrar' })
    },
  })

  const groups = navFor(me)
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const here = locate(pathname, groups)
  const section = here?.section?.children ? here.section : null
  const scoped = company && SCOPED_PATHS.includes(pathname)
  const home = groups[0]?.items[0]?.to ?? '/'
  const name = [me.first_name, me.last_name].filter(Boolean).join(' ') || user.email
  const roleText = platformView(me)
    ? 'Dueño de la plataforma'
    : me.support
      ? 'Soporte de Cobradía · solo lectura'
      : me.roles.join(' · ')
  const account = (placement: 'sidebar' | 'header') => (
    <UserMenu
      name={name}
      email={user.email}
      roleText={roleText}
      onLogout={() => logoutMutation.mutate()}
      leaving={logoutMutation.isPending}
      placement={placement}
      collapsed={placement === 'sidebar' && collapsed}
    />
  )
  const search = company ? () => setSearching('buscar') : undefined

  // Each screen rises into place (decision 112): the key restarts the
  // animation when the path changes; a section's menu stays still.
  const content = (
    <div key={pathname} className="min-w-0 animate-rise space-y-5">
      {children}
    </div>
  )

  return (
    <div className="flex min-h-screen">
      <a
        href="#contenido"
        className="sr-only z-50 rounded-lg bg-surface px-3 py-2 text-sm font-semibold focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Saltar al contenido
      </a>
      <TopProgress />
      {company && searching ? (
        <CommandPalette me={me} intent={searching} onClose={closeSearch} />
      ) : null}
      <Sidebar
        me={me}
        groups={groups}
        home={home}
        collapsed={collapsed}
        canFold={wide}
        onFold={toggleFolded}
        account={account('sidebar')}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <SupportBanner me={me} />
        <Topbar me={me} crumbs={crumbsFor(pathname, groups)} onSearch={search} scoped={scoped} />
        <PhoneBar me={me} home={home} onSearch={search} account={account('header')} />
        <main
          id="contenido"
          tabIndex={-1}
          className={`mx-auto w-full flex-1 px-4 pb-28 pt-6 outline-none sm:px-6 sm:pb-10 sm:pt-7 lg:px-8 ${
            section ? 'max-w-[80rem]' : 'max-w-6xl'
          }`}
        >
          {section && here ? (
            <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
              <SectionNav section={section} current={here.leaf} />
              {content}
            </div>
          ) : (
            content
          )}
        </main>
      </div>
      <MobileBar
        me={me}
        groups={groups}
        onCollect={() => setSearching('cobrar')}
        branchPicker={scoped ? <BranchPicker me={me} tone="forest" /> : undefined}
      />
    </div>
  )
}
