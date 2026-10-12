import { useQuery } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { listBranches, type Me } from '../../api/accounts'
import { plural } from '../../lib/format'
import { ACCESS, hasRole } from '../../lib/roles'
import { PanelFoldIcon, PanelUnfoldIcon } from '../icons'
import { Texture } from '../ui'
import { locate, type NavGroup } from './menu'

/** The wordmark of the menu: Sora with the gold «í» (decision 114). Folded,
 * the «Cí» in a translucent square. */
export function Wordmark({
  folded = false,
  tone = 'forest',
}: {
  folded?: boolean
  tone?: 'forest' | 'sand'
}) {
  if (folded)
    return (
      <span className="grid size-9 place-items-center rounded-[10px] bg-white/[0.07] font-display text-base font-bold tracking-[-0.03em] text-on-forest ring-1 ring-inset ring-white/10">
        <span>
          C<span className="text-gold-500">í</span>
        </span>
      </span>
    )
  return (
    <span
      className={`font-display text-[21px] font-bold tracking-[-0.03em] ${
        tone === 'forest' ? 'text-on-forest' : 'text-ink'
      }`}
    >
      Cobrad<span className="text-gold-500">í</span>a
    </span>
  )
}

const STATUS: Record<string, { label: string; className: string }> = {
  trial: { label: 'En prueba', className: 'bg-gold-500/15 text-gold-500 ring-gold-500/30' },
  suspended: {
    label: 'Solo lectura',
    className: 'bg-danger-600/20 text-on-forest ring-danger-600/40',
  },
}

/** The company the person works in, always in sight (doc 07 - 2). */
export function CompanyCard({ me }: { me: Me }) {
  const wide = hasRole(me, ACCESS.allBranches)
  // Shared with the branch picker of the top bar: one request for both.
  const branches = useQuery({ queryKey: ['branches'], queryFn: listBranches, enabled: wide })
  if (!me.company_name) return null
  const chip = me.company_status ? STATUS[me.company_status] : undefined
  const count = branches.data?.results.length
  return (
    <div className="relative flex items-center gap-2.5 rounded-[10px] bg-white/5 px-3 py-2.5 ring-1 ring-inset ring-white/[0.08]">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-on-forest" title={me.company_name}>
          {me.company_name}
        </div>
        <div className="truncate text-[11.5px] text-brand-200">
          {count ? plural(count, 'sucursal', 'sucursales') : 'Empresa'}
        </div>
      </div>
      {chip ? (
        <span
          className={`shrink-0 rounded-full px-2 text-[10.5px] font-semibold leading-5 ring-1 ring-inset ${chip.className}`}
        >
          {chip.label}
        </span>
      ) : null}
    </div>
  )
}

/** The menu's links, grouped (decision 114): 38 px rows, the active one on a
 * lighter forest with the gold bar against the edge. Folded, a rail of icons
 * named by a bubble. */
export function NavLinks({
  groups,
  onNavigate,
  collapsed = false,
  scrolls = true,
}: {
  groups: NavGroup[]
  onNavigate?: () => void
  collapsed?: boolean
  /** In the sidebar the menu scrolls on its own; in the phone's sheet the
   * sheet scrolls. */
  scrolls?: boolean
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const here = locate(pathname, groups)
  // The bubble of the rail, fixed on the page so the scrolling menu never clips it.
  const [tip, setTip] = useState<{ label: string; top: number; left: number } | null>(null)
  const showTip = (target: HTMLElement, label: string) => {
    const rect = target.getBoundingClientRect()
    setTip({ label, top: rect.top + rect.height / 2, left: rect.right + 12 })
  }
  // A long menu keeps the screen in use in sight.
  const navRef = useRef<HTMLElement>(null)
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' })
  }, [pathname])

  return (
    <nav
      ref={navRef}
      aria-label="Menú principal"
      className={`relative flex flex-col gap-3.5 px-3 pb-3 pt-1 ${
        scrolls ? 'scroll-quiet min-h-0 flex-1 overflow-y-auto overflow-x-hidden' : ''
      }`}
    >
      {groups.map((group) => (
        <div key={group.title ?? 'main'} className="flex flex-col gap-px">
          {group.title && !collapsed ? (
            <div className="px-2.5 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-brand-200/70">
              {group.title}
            </div>
          ) : null}
          {group.items.map((entry) => {
            const active =
              here !== null && (here.section ? here.section === entry : here.leaf === entry)
            const name = entry.badge ? `${entry.label} (${entry.badge})` : entry.label
            return (
              <Link
                key={entry.to}
                to={entry.to}
                aria-current={active ? 'page' : undefined}
                aria-label={collapsed ? name : undefined}
                onClick={() => {
                  setTip(null)
                  onNavigate?.()
                }}
                onMouseEnter={collapsed ? (event) => showTip(event.currentTarget, name) : undefined}
                onMouseLeave={collapsed ? () => setTip(null) : undefined}
                onFocus={collapsed ? (event) => showTip(event.currentTarget, name) : undefined}
                onBlur={collapsed ? () => setTip(null) : undefined}
                className={`relative flex h-[38px] shrink-0 items-center gap-3 rounded-[9px] text-[13.5px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-gold-500 ${
                  collapsed ? 'justify-center' : 'px-3'
                } ${
                  active
                    ? 'bg-brand-900 font-semibold text-on-forest [&_svg]:stroke-[2.2]'
                    : 'font-medium text-brand-200 hover:bg-white/[0.06] hover:text-on-forest'
                }`}
              >
                {active ? (
                  <span
                    aria-hidden
                    className="absolute inset-y-[9px] -left-3 w-[3px] rounded-r-[3px] bg-gold-500"
                  />
                ) : null}
                {entry.icon}
                {collapsed ? (
                  entry.badge ? (
                    <span
                      aria-hidden
                      className="absolute right-3 top-2 size-1.5 rounded-full bg-gold-500"
                    />
                  ) : null
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                    {entry.badge ? (
                      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-white/10 px-1.5 text-[11px] font-semibold text-on-forest">
                        {entry.badge}
                      </span>
                    ) : null}
                  </>
                )}
              </Link>
            )
          })}
        </div>
      ))}
      {tip ? (
        <div
          role="tooltip"
          style={{ top: tip.top, left: tip.left }}
          className="pointer-events-none fixed z-50 -translate-y-1/2 animate-fade whitespace-nowrap rounded-lg bg-ink px-2.5 py-1 text-[12.5px] font-medium text-canvas shadow-lg"
        >
          {tip.label}
        </div>
      ) : null}
    </nav>
  )
}

/** The forest menu (decision 114): 248 px, 76 folded, the choice remembered.
 * A tablet always gets the rail: the content needs the room. */
export function Sidebar({
  me,
  groups,
  home,
  collapsed,
  canFold,
  onFold,
  account,
}: {
  me: Me
  groups: NavGroup[]
  home: string
  collapsed: boolean
  /** False on a tablet, where the rail is the only option. */
  canFold: boolean
  onFold: () => void
  /** The user menu at the foot. */
  account: ReactNode
}) {
  return (
    <aside
      className={`sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden bg-brand-950 text-brand-200 transition-[width] duration-240 ease-out-soft sm:flex ${
        collapsed ? 'w-[76px]' : 'w-[248px]'
      }`}
    >
      <Texture tone="forest" />
      <div className="relative flex h-[68px] shrink-0 items-center px-5">
        <Link
          to={home}
          aria-label="Cobradía: inicio"
          className="-mx-1 rounded-lg px-1 outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
        >
          <Wordmark folded={collapsed} />
        </Link>
      </div>
      {collapsed ? null : (
        <div className="mx-3.5 mb-2.5">
          <CompanyCard me={me} />
        </div>
      )}
      <NavLinks groups={groups} collapsed={collapsed} />
      <div className="relative flex flex-col gap-1.5 border-t border-white/[0.08] p-3">
        {account}
        {canFold ? (
          <button
            type="button"
            onClick={onFold}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Desplegar el menú' : 'Plegar el menú'}
            title={collapsed ? 'Desplegar el menú' : undefined}
            className={`press press-down flex h-9 items-center gap-3 rounded-[9px] text-[13px] text-brand-200 outline-none hover:bg-white/[0.06] hover:text-on-forest focus-visible:ring-2 focus-visible:ring-gold-500 ${
              collapsed ? 'justify-center' : 'px-3'
            }`}
          >
            {collapsed ? (
              <PanelUnfoldIcon className="size-5 shrink-0" />
            ) : (
              <PanelFoldIcon className="size-5 shrink-0" />
            )}
            {collapsed ? null : <span className="whitespace-nowrap">Plegar menú</span>}
          </button>
        ) : null}
      </div>
    </aside>
  )
}
