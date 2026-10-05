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

const SIMULATOR_ROLES = ['Gerente', 'Supervisor', 'Oficial de crédito', 'Cajero']

function navFor(me: Me): NavItem[] {
  const items: NavItem[] = me.is_platform_admin
    ? [{ to: '/plataforma', label: 'Empresas' }]
    : [
        { to: '/', label: 'Inicio' },
        { to: '/clientes', label: 'Clientes' },
      ]
  if (!me.is_platform_admin && me.roles?.some((role) => SIMULATOR_ROLES.includes(role))) {
    items.push({ to: '/simulador', label: 'Simulador' })
  }
  if (!me.is_platform_admin && me.is_manager) {
    items.push(
      { to: '/ajustes/sucursales', label: 'Sucursales' },
      { to: '/ajustes/usuarios', label: 'Usuarios' },
      { to: '/ajustes/suscripcion', label: 'Suscripción' },
    )
  }
  items.push({ to: '/cuenta', label: 'Mi cuenta' })
  return items
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

  return (
    <div className="flex min-h-screen">
      {!me.is_platform_admin ? <CommandPalette /> : null}
      <aside className="hidden w-56 flex-col bg-brand-950 p-4 sm:flex">
        <Brand className="text-xl" tone="light" />
        <nav className="mt-6 flex flex-col gap-1">
          {navFor(me).map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-lg border-l-3 border-transparent px-3 py-2 text-sm text-brand-200 hover:bg-brand-900 hover:text-white [&.active]:border-gold-500 [&.active]:bg-brand-900 [&.active]:font-semibold [&.active]:text-white"
              activeOptions={{ exact: item.to === '/' }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-edge bg-surface px-4">
          <span className="text-sm text-muted sm:hidden">
            <Brand className="text-lg" />
          </span>
          <span className="hidden text-sm text-muted sm:block" />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <span className="text-sm text-muted">{user.email}</span>
            <Button
              variant="secondary"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              Salir
            </Button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 space-y-4 px-4 py-6">{children}</main>
      </div>
    </div>
  )
}
