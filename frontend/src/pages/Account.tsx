import { useQuery } from '@tanstack/react-query'
import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'

import { getMe, type Me } from '../api/accounts'
import { DevicesIcon, KeyIcon, ShieldCheckIcon, UserIcon } from '../components/icons'
import { Alert, PageHeader } from '../components/ui'

/** Mi cuenta (P04, decision 117): one page per concern, side by side as the
 * sub-menus of Ajustes; on a phone the four short names fit in one strip. */
const SECTIONS = [
  { to: '/cuenta', label: 'Perfil', short: 'Perfil', icon: <UserIcon /> },
  { to: '/cuenta/contrasena', label: 'Contraseña', short: 'Contraseña', icon: <KeyIcon /> },
  {
    to: '/cuenta/dos-pasos',
    label: 'Verificación en dos pasos',
    short: 'Dos pasos',
    icon: <ShieldCheckIcon />,
  },
  { to: '/cuenta/sesiones', label: 'Sesiones abiertas', short: 'Sesiones', icon: <DevicesIcon /> },
] as const

export function AccountPage({ me: initial }: { me: Me }) {
  const me = useQuery({ queryKey: ['me'], queryFn: getMe, initialData: initial }).data
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const pending = me.mfa_required && !me.mfa_enabled

  return (
    <>
      <PageHeader title="Mi cuenta" subtitle="Tu perfil y la seguridad de tu acceso." />

      {pending && pathname !== '/cuenta/dos-pasos' ? (
        <Alert tone="warning">
          La verificación en dos pasos es obligatoria: actívala para seguir usando el sistema.{' '}
          <Link to="/cuenta/dos-pasos" className="font-semibold underline underline-offset-2">
            Activarla ahora
          </Link>
        </Alert>
      ) : null}

      <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8">
        <AccountNav pathname={pathname} mfaOn={me.mfa_enabled} />
        <div className="min-w-0 space-y-5">
          <Outlet />
        </div>
      </div>
    </>
  )
}

function AccountNav({ pathname, mfaOn }: { pathname: string; mfaOn: boolean }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    ref.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [pathname])
  return (
    <nav
      ref={ref}
      aria-label="Mi cuenta"
      className="-mx-4 mb-5 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:sticky lg:top-24 lg:mx-0 lg:mb-0 lg:self-start lg:overflow-visible lg:px-0"
    >
      <div className="eyebrow hidden px-3 pb-2 lg:block">Mi cuenta</div>
      <ul className="flex gap-1 lg:flex-col lg:gap-0.5">
        {SECTIONS.map((section) => {
          const active = section.to === pathname
          return (
            <li key={section.to} className="shrink-0">
              <Link
                to={section.to}
                aria-current={active ? 'page' : undefined}
                className={`press flex h-9 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-[13.5px] outline-none lg:gap-2.5 focus-visible:ring-2 focus-visible:ring-accent-500 ${
                  active
                    ? 'bg-brand-100 font-semibold text-brand-800'
                    : 'font-medium text-ink ring-1 ring-inset ring-edge hover:bg-brand-50 lg:ring-0'
                }`}
              >
                <span className={`hidden lg:block ${active ? 'text-brand-700' : 'text-muted'}`}>
                  {section.icon}
                </span>
                <span className="lg:hidden">{section.short}</span>
                <span className="hidden lg:inline">{section.label}</span>
                {section.to === '/cuenta/dos-pasos' ? <StateDot on={mfaOn} /> : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** The 2FA state beside its entry: green when on, amber while pending (the
 * page itself says it in words). */
function StateDot({ on }: { on: boolean }) {
  const text = on ? 'Activa' : 'Pendiente'
  return (
    <span title={text} className="ml-auto grid size-4 place-items-center">
      <span
        aria-hidden
        className={`size-2 rounded-full ring-2 ${
          on ? 'bg-success-600 ring-success-600/20' : 'bg-warning-700 ring-warning-700/20'
        }`}
      />
      <span className="sr-only">({text})</span>
    </span>
  )
}
