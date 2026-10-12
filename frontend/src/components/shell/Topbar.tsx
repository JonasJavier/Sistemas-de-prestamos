import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Fragment, type ReactNode } from 'react'

import { listBranches, type Me } from '../../api/accounts'
import { ACCESS, hasRole } from '../../lib/roles'
import { useBranchScope } from '../../lib/scope'
import { useDarkTheme } from '../../lib/theme'
import { BellIcon, ChevronRightIcon, MoonIcon, SearchIcon, SunIcon } from '../icons'
import type { Crumb } from './menu'
import { Wordmark } from './Sidebar'

export const iconButton =
  'press press-down relative grid size-10 place-items-center rounded-control text-muted outline-none hover:bg-brand-50 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent-500 sm:size-[38px]'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)

function ThemeToggle() {
  const [dark, toggle] = useDarkTheme()
  const label = dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'
  return (
    <button type="button" onClick={toggle} title={label} aria-label={label} className={iconButton}>
      {/* The icon pops in when the theme changes. */}
      <span key={String(dark)} className="grid animate-pop">
        {dark ? <SunIcon /> : <MoonIcon />}
      </span>
    </button>
  )
}

/** The bell (doc 07 - 2): unread notices and authorizations to decide. A red
 * dot says there is something; the count goes in its name. */
export function Bell({ me }: { me: Me }) {
  const count = (me.unread_notifications ?? 0) + (me.pending_approvals ?? 0)
  const label = count
    ? `Avisos: ${count} pendiente${count === 1 ? '' : 's'}`
    : 'Avisos y autorizaciones'
  return (
    <Link to="/avisos" title={label} aria-label={label} className={iconButton}>
      <BellIcon />
      {count ? (
        <span
          aria-hidden
          className="absolute right-2.5 top-[9px] size-[7px] rounded-full bg-danger-600 ring-2 ring-canvas"
        />
      ) : null}
    </Link>
  )
}

/** Section › screen › detail; every crumb but the last one goes back. */
function Crumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Estás en" className="hidden min-w-0 md:block">
      <ol className="flex min-w-0 items-center gap-2 text-[13px] text-muted">
        {crumbs.map((crumb, index) => (
          <Fragment key={`${crumb.label}-${index}`}>
            {index ? (
              <li aria-hidden className="shrink-0">
                <ChevronRightIcon />
              </li>
            ) : null}
            <li className="min-w-0 truncate">
              {crumb.to ? (
                <Link
                  to={crumb.to}
                  className="rounded outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-accent-500"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current="page" className="font-medium text-ink">
                  {crumb.label}
                </span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  )
}

/** The branch the figures of this screen follow (decision 114). Only for who
 * reads every branch, only with more than one, only on a screen that honors it. */
export function BranchPicker({ me, tone = 'sand' }: { me: Me; tone?: 'sand' | 'forest' }) {
  const [branch, setBranch] = useBranchScope()
  const wide = hasRole(me, ACCESS.allBranches)
  const branches = useQuery({ queryKey: ['branches'], queryFn: listBranches, enabled: wide })
  const list = branches.data?.results ?? []
  if (!wide || list.length < 2) return null
  // A branch kept from another session that no longer exists reads as «all».
  const value = list.some((b) => b.id === branch) ? branch : ''
  return (
    <label
      className={`relative flex h-[38px] shrink-0 items-center rounded-control ring-1 ring-inset transition-colors ${
        tone === 'sand'
          ? 'text-ink ring-edge hover:bg-surface'
          : 'bg-white/5 text-on-forest ring-white/[0.08]'
      }`}
    >
      <span className="sr-only">Sucursal</span>
      {/* Emerald: the whole company; gold: narrowed to one branch. */}
      <span
        aria-hidden
        className={`pointer-events-none absolute left-3 size-1.5 rounded-full ${
          value ? 'bg-gold-500' : 'bg-brand-700'
        }`}
      />
      <select
        value={value}
        onChange={(event) => setBranch(event.target.value)}
        className={`h-full w-full cursor-pointer rounded-control bg-transparent pl-6 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
          tone === 'forest' ? '[&>option]:text-ink' : ''
        }`}
      >
        <option value="">Toda la empresa</option>
        {list.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </label>
  )
}

/** The top bar of tablet and desktop (decision 114): 64 px on the sand. */
export function Topbar({
  me,
  crumbs,
  onSearch,
  scoped,
}: {
  me: Me
  crumbs: Crumb[]
  /** Absent for the platform owner: there is nothing of a company to find. */
  onSearch?: () => void
  /** The screen follows the branch of the bar. */
  scoped: boolean
}) {
  return (
    <header className="sticky top-0 z-30 hidden h-16 shrink-0 items-center gap-4 border-b border-edge bg-canvas/90 px-6 backdrop-blur-md sm:flex lg:px-8">
      <Crumbs crumbs={crumbs} />
      <div className="flex-1" />
      {onSearch ? (
        <button
          type="button"
          onClick={onSearch}
          className="flex h-[38px] w-full min-w-0 max-w-[340px] items-center gap-2.5 rounded-control bg-surface pl-3 pr-2.5 text-[13px] text-muted ring-1 ring-inset ring-edge outline-none transition-shadow hover:ring-muted/40 focus-visible:ring-2 focus-visible:ring-accent-500"
        >
          <SearchIcon className="size-[19px] shrink-0" />
          <span className="flex-1 truncate text-left">Buscar cliente, cédula o préstamo…</span>
          <kbd className="rounded-[5px] bg-surface-2 px-1.5 font-sans text-[11px] font-semibold leading-5 ring-1 ring-inset ring-edge">
            {isMac ? '⌘K' : 'Ctrl K'}
          </kbd>
        </button>
      ) : null}
      {scoped ? (
        <span className="hidden lg:block">
          <BranchPicker me={me} />
        </span>
      ) : null}
      <div className="flex shrink-0 items-center gap-1">
        <ThemeToggle />
        {onSearch ? <Bell me={me} /> : null}
      </div>
    </header>
  )
}

/** The top bar of a phone: the wordmark, the search, the bell and the avatar. */
export function PhoneBar({
  me,
  home,
  onSearch,
  account,
}: {
  me: Me
  home: string
  onSearch?: () => void
  account: ReactNode
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-1 border-b border-edge bg-canvas/90 pl-4 pr-2 backdrop-blur-md sm:hidden">
      <Link
        to={home}
        aria-label="Cobradía: inicio"
        className="mr-auto rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      >
        <Wordmark tone="sand" />
      </Link>
      {onSearch ? (
        <>
          <button type="button" onClick={onSearch} aria-label="Buscar" className={iconButton}>
            <SearchIcon />
          </button>
          <Bell me={me} />
        </>
      ) : null}
      {account}
    </header>
  )
}
