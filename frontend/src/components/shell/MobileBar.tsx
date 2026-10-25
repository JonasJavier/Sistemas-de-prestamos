import { Link, useRouterState } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'

import type { Me } from '../../api/accounts'
import { missingFeature } from '../../lib/plan'
import { ACCESS, hasRole, platformView } from '../../lib/roles'
import {
  AgendaIcon,
  ApplicationIcon,
  BuildingIcon,
  TagIcon,
  CollectIcon,
  HomeIcon,
  LoanIcon,
  MapIcon,
  MenuIcon,
  PeopleIcon,
  RouteIcon,
  WalletIcon,
} from '../icons'
import { Modal } from '../Modal'
import { Texture } from '../ui'
import { owns, type NavGroup } from './menu'
import { CompanyCard, NavLinks } from './Sidebar'

interface Tab {
  to: string
  label: string
  icon: ReactNode
}

const big = 'size-[22px] shrink-0'

/** The tabs of the bar by role (decision 114): the office «Inicio · Clientes ·
 * Cobrar · Ruta · Más», the cashier's «Caja» in place of the routes, the
 * collector's own route first. Who doesn't collect gets no «Cobrar». */
function tabsFor(me: Me): { tabs: Tab[]; collects: boolean } {
  if (platformView(me))
    return {
      tabs: [
        { to: '/plataforma', label: 'Empresas', icon: <BuildingIcon className={big} /> },
        { to: '/plataforma/planes', label: 'Planes', icon: <TagIcon className={big} /> },
      ],
      collects: false,
    }
  const collects = hasRole(me, ACCESS.collect)
  const customers = { to: '/clientes', label: 'Clientes', icon: <PeopleIcon className={big} /> }
  if (hasRole(me, ACCESS.myRoute)) {
    const tabs: Tab[] = [
      { to: '/ruta', label: 'Ruta', icon: <RouteIcon className={big} /> },
      customers,
    ]
    if (hasRole(me, ACCESS.manageCollections))
      tabs.push({ to: '/cobranza', label: 'Cobranza', icon: <AgendaIcon className={big} /> })
    return { tabs, collects }
  }
  const tabs: Tab[] = [{ to: '/', label: 'Inicio', icon: <HomeIcon className={big} /> }, customers]
  if (collects) {
    if (hasRole(me, ACCESS.routes))
      tabs.push({ to: '/rutas', label: 'Ruta', icon: <MapIcon className={big} /> })
    else if (hasRole(me, ACCESS.myCash))
      tabs.push({ to: '/caja', label: 'Caja', icon: <WalletIcon className={big} /> })
  } else {
    if (hasRole(me, ACCESS.applications))
      tabs.push({
        to: '/solicitudes',
        label: 'Solicitudes',
        icon: <ApplicationIcon className={big} />,
      })
    if (hasRole(me, ACCESS.loans))
      tabs.push({ to: '/prestamos', label: 'Préstamos', icon: <LoanIcon className={big} /> })
  }
  return { tabs, collects }
}

const tabClass =
  'press press-down flex min-w-0 flex-col items-center gap-1 rounded-lg pb-0.5 text-[10.5px] outline-none focus-visible:ring-2 focus-visible:ring-accent-500'

function TabFace({ icon, label, active }: { icon: ReactNode; label: string; active: boolean }) {
  return (
    <>
      <span
        className={`grid h-[30px] w-14 place-items-center rounded-full transition-colors duration-200 ${
          active ? 'bg-brand-100 text-ink [&_svg]:stroke-[2.1]' : ''
        }`}
      >
        {icon}
      </span>
      <span className={`max-w-full truncate ${active ? 'font-semibold text-ink' : 'font-medium'}`}>
        {label}
      </span>
    </>
  )
}

/** Phones get a bottom bar (decision 114): the tabs, the round «Cobrar» in the
 * middle that rises above the bar, and «Más» with the whole menu in a sheet. */
export function MobileBar({
  me,
  groups,
  onCollect,
  branchPicker,
}: {
  me: Me
  groups: NavGroup[]
  /** Opens the search of the loan to collect. */
  onCollect: () => void
  /** The branch of the figures, when the screen honors it. */
  branchPicker?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { tabs: all, collects } = tabsFor(me)
  const tabs = all.filter((tab) => !missingFeature(me, tab.to))
  const cells: ReactNode[] = tabs.map((tab) => (
    <Link
      key={tab.to}
      to={tab.to}
      onClick={() => setOpen(false)}
      aria-current={owns(tab.to, pathname) ? 'page' : undefined}
      className={`${tabClass} text-muted`}
    >
      <TabFace icon={tab.icon} label={tab.label} active={owns(tab.to, pathname)} />
    </Link>
  ))
  if (collects)
    cells.splice(
      2,
      0,
      <button
        key="cobrar"
        type="button"
        onClick={() => {
          setOpen(false)
          onCollect()
        }}
        className={`${tabClass} font-semibold text-ink`}
      >
        <span className="-mt-[22px] grid size-[52px] place-items-center rounded-full bg-brand-700 text-on-brand shadow-lg ring-4 ring-surface transition-transform duration-150 active:scale-[0.94]">
          <CollectIcon className="size-6 shrink-0" />
        </span>
        Cobrar
      </button>,
    )
  cells.push(
    <button
      key="mas"
      type="button"
      aria-expanded={open}
      onClick={() => setOpen((value) => !value)}
      className={`${tabClass} text-muted`}
    >
      <TabFace icon={<MenuIcon className={big} />} label="Más" active={open} />
    </button>,
  )

  return (
    <>
      {open ? (
        <Modal onClose={() => setOpen(false)} label="Menú" align="bottom">
          <div className="relative max-h-[85vh] w-full overflow-hidden rounded-t-3xl bg-brand-950 text-brand-200">
            <Texture tone="forest" />
            <div className="relative flex max-h-[85vh] flex-col gap-3 overflow-y-auto px-3 pb-[max(env(safe-area-inset-bottom),2rem)] pt-2.5">
              <span
                aria-hidden
                className="mx-auto block h-1 w-10 shrink-0 rounded-full bg-white/20"
              />
              <div className="px-1">
                <CompanyCard me={me} />
              </div>
              {branchPicker ? <div className="px-1">{branchPicker}</div> : null}
              <NavLinks groups={groups} onNavigate={() => setOpen(false)} scrolls={false} />
              <button
                type="button"
                className="mx-1 h-11 shrink-0 rounded-xl bg-white/[0.06] px-3 text-sm font-medium text-brand-200 hover:bg-white/10"
                onClick={() => setOpen(false)}
              >
                Cerrar menú
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
      <nav
        aria-label="Accesos rápidos"
        style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}
        className="fixed inset-x-0 bottom-0 z-50 grid items-end border-t border-edge bg-surface/95 px-2.5 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur-md sm:hidden"
      >
        {cells}
      </nav>
    </>
  )
}
