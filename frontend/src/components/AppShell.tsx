import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'

import type { Me } from '../api/accounts'
import { logout, type SessionUser } from '../api/auth'
import { CommandPalette } from './CommandPalette'
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
  return (
    <button
      type="button"
      onClick={toggle}
      title={dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      className="rounded-lg border border-edge bg-surface px-2.5 py-1.5 text-sm hover:bg-brand-100"
    >
      {dark ? '☀️' : '🌙'}
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

const can = (me: Me, ...roles: string[]) => Boolean(me.roles?.some((role) => roles.includes(role)))

/** Grouped navigation (decision 038): only what the role can use. */
function navFor(me: Me): NavGroup[] {
  if (me.is_platform_admin) {
    return [
      { title: null, items: [{ to: '/plataforma', label: 'Empresas' }] },
      { title: null, items: [{ to: '/cuenta', label: 'Mi cuenta' }] },
    ]
  }
  const operation: NavItem[] = [{ to: '/clientes', label: 'Clientes' }]
  if (can(me, 'Gerente', 'Supervisor', 'Oficial de crédito', 'Cajero', 'Contabilidad', 'Auditoría')) {
    operation.push({ to: '/solicitudes', label: 'Solicitudes' })
  }
  if (can(me, 'Gerente', 'Cajero', 'Contabilidad')) {
    operation.push({ to: '/desembolsos', label: 'Desembolsos' })
  }
  if (can(me, 'Gerente', 'Supervisor', 'Oficial de crédito', 'Cajero', 'Cobrador', 'Contabilidad', 'Auditoría')) {
    operation.push({ to: '/prestamos', label: 'Préstamos' })
  }
  if (can(me, 'Gerente', 'Supervisor', 'Oficial de crédito', 'Cajero')) {
    operation.push({ to: '/simulador', label: 'Simulador' })
  }
  const groups: NavGroup[] = [
    { title: null, items: [{ to: '/', label: 'Inicio' }] },
    { title: 'Operación', items: operation },
  ]
  if (can(me, 'Gerente', 'Contabilidad', 'Auditoría')) {
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
  'rounded-lg border-l-3 border-transparent px-3 py-2 text-sm text-brand-200 hover:bg-brand-900 hover:text-white [&.active]:border-gold-500 [&.active]:bg-brand-900 [&.active]:font-semibold [&.active]:text-white'

function NavLinks({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  return (
    <nav className="mt-6 flex flex-col gap-4">
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

/** Phones get a bottom bar (decision 038): the frequent actions plus «Más». */
function MobileBar({ me, groups }: { me: Me; groups: NavGroup[] }) {
  const [open, setOpen] = useState(false)
  const quick: NavItem[] = me.is_platform_admin
    ? [{ to: '/plataforma', label: 'Empresas' }]
    : [
        { to: '/', label: 'Inicio' },
        { to: '/clientes', label: 'Clientes' },
        ...(can(me, 'Gerente', 'Supervisor', 'Oficial de crédito', 'Cajero', 'Cobrador', 'Contabilidad', 'Auditoría')
          ? [{ to: '/prestamos', label: 'Préstamos' }]
          : []),
      ]
  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-40 sm:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute inset-x-0 bottom-0 max-h-[75vh] overflow-y-auto rounded-t-2xl bg-brand-950 p-4 pb-20"
            onClick={(e) => e.stopPropagation()}
          >
            <NavLinks groups={groups} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex h-16 border-t border-edge bg-surface sm:hidden">
        {quick.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            onClick={() => setOpen(false)}
            activeOptions={{ exact: item.to === '/' }}
            className="flex flex-1 items-center justify-center text-[13px] font-medium text-muted [&.active]:text-brand-700"
          >
            {item.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex flex-1 items-center justify-center text-[13px] font-medium text-muted"
        >
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
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      queryClient.clear()
      navigate({ to: '/entrar' })
    },
  })

  const groups = navFor(me)
  return (
    <div className="flex min-h-screen">
      {!me.is_platform_admin ? <CommandPalette /> : null}
      <aside className="hidden w-56 flex-col bg-brand-950 p-4 sm:flex">
        <Brand className="text-xl" tone="light" />
        <NavLinks groups={groups} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-edge bg-surface px-4">
          <span className="text-sm text-muted sm:hidden">
            <Brand className="text-lg" />
          </span>
          <span className="hidden text-sm text-muted sm:block" />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <span className="hidden text-sm text-muted md:inline">{user.email}</span>
            <Button
              variant="secondary"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              Salir
            </Button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-4 pb-24 pt-6 sm:pb-6">
          {children}
        </main>
      </div>
      <MobileBar me={me} groups={groups} />
    </div>
  )
}
