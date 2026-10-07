import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useState, type ReactNode } from 'react'

import type { Me } from '../api/accounts'
import { logout, type SessionUser } from '../api/auth'
import { ACCESS, hasRole } from '../lib/roles'
import { CommandPalette } from './CommandPalette'
import { HomeIcon, LoanIcon, MenuIcon, MoonIcon, PeopleIcon, SearchIcon, SunIcon } from './icons'
import { Brand, Button } from './ui'

function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const toggle = () => {
    const next = !dark
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light')
    } catch {
      // storage unavailable: the choice just won't persist
    }
    setDark(next)
  }
  const label = dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'
  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className="grid size-9 place-items-center rounded-lg border border-edge bg-surface text-muted outline-none hover:bg-brand-100 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent-500"
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}

interface NavItem {
  to: string
  label: string
}

interface NavGroup {
  title: string | null
  items: NavItem[]
}

/** Grouped navigation (decision 038): only what the role can use. */
function navFor(me: Me): NavGroup[] {
  if (me.is_platform_admin) {
    return [
      { title: null, items: [{ to: '/plataforma', label: 'Empresas' }] },
      { title: null, items: [{ to: '/cuenta', label: 'Mi cuenta' }] },
    ]
  }
  const operation: NavItem[] = [{ to: '/clientes', label: 'Clientes' }]
  if (hasRole(me, ACCESS.applications)) operation.push({ to: '/solicitudes', label: 'Solicitudes' })
  if (hasRole(me, ACCESS.disburse)) operation.push({ to: '/desembolsos', label: 'Desembolsos' })
  if (hasRole(me, ACCESS.loans)) operation.push({ to: '/prestamos', label: 'Préstamos' })
  if (hasRole(me, ACCESS.simulate)) operation.push({ to: '/simulador', label: 'Simulador' })
  const groups: NavGroup[] = [
    { title: null, items: [{ to: '/', label: 'Inicio' }] },
    { title: 'Operación', items: operation },
  ]
  if (hasRole(me, ACCESS.finance)) {
    groups.push({ title: 'Finanzas', items: [{ to: '/cuentas', label: 'Cuentas y bancos' }] })
  }
  if (me.is_manager) {
    groups.push({
      title: 'Ajustes',
      items: [
        { to: '/ajustes/productos', label: 'Productos' },
        { to: '/ajustes/feriados', label: 'Feriados' },
        { to: '/ajustes/numeraciones', label: 'Numeraciones' },
        { to: '/ajustes/sucursales', label: 'Sucursales' },
        { to: '/ajustes/usuarios', label: 'Usuarios' },
        { to: '/ajustes/suscripcion', label: 'Suscripción' },
      ],
    })
  }
  groups.push({ title: null, items: [{ to: '/cuenta', label: 'Mi cuenta' }] })
  return groups
}

const linkClasses =
  'rounded-lg border-l-3 border-transparent px-3 py-2 text-sm text-brand-200 outline-none hover:bg-brand-900 hover:text-white focus-visible:ring-2 focus-visible:ring-gold-500 [&.active]:border-gold-500 [&.active]:bg-brand-900 [&.active]:font-semibold [&.active]:text-white'

function NavLinks({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  return (
    <nav aria-label="Menú principal" className="flex flex-col gap-4">
      {groups.map((group, index) => (
        <div key={group.title ?? index} className="flex flex-col gap-1">
          {group.title ? (
            <span className="px-3 text-[11px] font-semibold uppercase tracking-wider text-brand-200/70">
              {group.title}
            </span>
          ) : null}
          {group.items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={linkClasses}
              activeOptions={{ exact: item.to === '/' }}
            >
              {item.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  )
}

const STATUS_CHIP: Record<string, { label: string; className: string }> = {
  trial: { label: 'En prueba', className: 'bg-gold-100 text-gold-800' },
  suspended: { label: 'Solo lectura', className: 'bg-danger-600/15 text-danger-600' },
}

/** The tenant the user works in, always in sight (doc 07 - section 2). */
function CompanyBadge({ me }: { me: Me }) {
  if (!me.company_name) return null
  const chip = me.company_status ? STATUS_CHIP[me.company_status] : undefined
  return (
    <div className="rounded-lg bg-brand-900/60 px-3 py-2">
      <div className="truncate text-sm font-medium text-white" title={me.company_name}>
        {me.company_name}
      </div>
      {chip ? (
        <span
          className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip.className}`}
        >
          {chip.label}
        </span>
      ) : null}
    </div>
  )
}

const barItem =
  'flex flex-1 flex-col items-center justify-center gap-0.5 text-[11.5px] font-medium text-muted outline-none focus-visible:bg-brand-100 [&.active]:text-brand-700'

/** Phones get a bottom bar (decision 038): the frequent actions, search and «Más». */
function MobileBar({ me, groups, onSearch }: { me: Me; groups: NavGroup[]; onSearch: () => void }) {
  const [open, setOpen] = useState(false)
  const quick = me.is_platform_admin
    ? [{ to: '/plataforma', label: 'Empresas', icon: <HomeIcon /> }]
    : [
        { to: '/', label: 'Inicio', icon: <HomeIcon /> },
        { to: '/clientes', label: 'Clientes', icon: <PeopleIcon /> },
        ...(hasRole(me, ACCESS.loans)
          ? [{ to: '/prestamos', label: 'Préstamos', icon: <LoanIcon /> }]
          : []),
      ]
  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-40 sm:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menú"
            className="absolute inset-x-0 bottom-0 max-h-[75vh] space-y-4 overflow-y-auto rounded-t-2xl bg-brand-950 p-4 pb-20"
            onClick={(e) => e.stopPropagation()}
          >
            <CompanyBadge me={me} />
            <NavLinks groups={groups} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
      <nav
        aria-label="Accesos rápidos"
        className="fixed inset-x-0 bottom-0 z-50 flex h-16 border-t border-edge bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        {quick.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            onClick={() => setOpen(false)}
            activeOptions={{ exact: item.to === '/' }}
            className={barItem}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
        {!me.is_platform_admin ? (
          <button
            type="button"
            className={barItem}
            onClick={() => {
              setOpen(false)
              onSearch()
            }}
          >
            <SearchIcon />
            Buscar
          </button>
        ) : null}
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className={barItem}
        >
          <MenuIcon />
          Más
        </button>
      </nav>
    </>
  )
}

export function AppShell({
  user,
  me,
  children,
}: {
  user: SessionUser
  me: Me
  children: ReactNode
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searching, setSearching] = useState(false)
  const closeSearch = useCallback(() => setSearching(false), [])
  const searchable = !me.is_platform_admin

  useEffect(() => {
    if (!searchable) return
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearching((value) => !value)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [searchable])
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      queryClient.clear()
      navigate({ to: '/entrar' })
    },
  })

  const groups = navFor(me)
  const name = [me.first_name, me.last_name].filter(Boolean).join(' ') || user.email
  const roleText = me.is_platform_admin ? 'Dueño de la plataforma' : me.roles.join(' · ')
  return (
    <div className="flex min-h-screen">
      <a
        href="#contenido"
        className="sr-only z-50 rounded-lg bg-surface px-3 py-2 text-sm font-semibold focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Saltar al contenido
      </a>
      {searchable && searching ? <CommandPalette me={me} onClose={closeSearch} /> : null}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-5 overflow-y-auto bg-brand-950 p-4 sm:flex">
        <Link
          to="/"
          className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
        >
          <Brand className="text-xl" tone="light" />
        </Link>
        <CompanyBadge me={me} />
        <NavLinks groups={groups} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-edge bg-surface/95 px-4 backdrop-blur">
          <span className="sm:hidden">
            <Brand className="text-lg" />
          </span>
          {!me.is_platform_admin ? (
            <button
              type="button"
              onClick={() => setSearching(true)}
              className="hidden h-9 w-full max-w-sm items-center gap-2 rounded-lg border border-edge bg-surface-2 px-3 text-sm text-muted outline-none hover:border-brand-700/40 focus-visible:ring-2 focus-visible:ring-accent-500 sm:flex"
            >
              <SearchIcon />
              <span className="flex-1 truncate text-left">Buscar cliente, cédula o préstamo…</span>
              <kbd className="rounded border border-edge bg-surface px-1.5 font-sans text-[11px]">
                Ctrl K
              </kbd>
            </button>
          ) : (
            <span className="hidden sm:block" />
          )}
          <div className="flex items-center gap-3">
            <div className="hidden text-right leading-tight md:block">
              <div className="text-sm font-medium">{name}</div>
              <div className="max-w-56 truncate text-[12px] text-muted" title={roleText}>
                {roleText}
              </div>
            </div>
            <ThemeToggle />
            <Button
              variant="secondary"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              Salir
            </Button>
          </div>
        </header>
        <main
          id="contenido"
          tabIndex={-1}
          className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-4 pb-24 pt-6 outline-none sm:pb-8"
        >
          {children}
        </main>
      </div>
      <MobileBar me={me} groups={groups} onSearch={() => setSearching(true)} />
    </div>
  )
}
