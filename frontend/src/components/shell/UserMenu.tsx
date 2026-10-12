import { Link } from '@tanstack/react-router'
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'

import { initials } from '../../lib/format'
import { useDarkTheme } from '../../lib/theme'
import { LogoutIcon, MoonIcon, SunIcon, UserIcon } from '../icons'

/** Avatar, name and role; opens «Mi cuenta», the theme and «Cerrar sesión».
 * At the foot of the forest menu (decision 114) or, on a phone, in the top bar.
 * The panel is fixed to the page, so the menu that clips its texture never
 * clips it. */
export function UserMenu({
  name,
  email,
  roleText,
  onLogout,
  leaving,
  placement,
  collapsed = false,
}: {
  name: string
  email: string
  roleText: string
  onLogout: () => void
  leaving: boolean
  placement: 'sidebar' | 'header'
  collapsed?: boolean
}) {
  const [position, setPosition] = useState<CSSProperties | null>(null)
  const [dark, toggleTheme] = useDarkTheme()
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const id = useId()
  const open = position !== null

  const toggle = () => {
    if (open || !button.current) return setPosition(null)
    const rect = button.current.getBoundingClientRect()
    if (placement === 'header')
      setPosition({ top: rect.bottom + 8, right: window.innerWidth - rect.right })
    else if (collapsed)
      setPosition({ left: rect.right + 12, bottom: window.innerHeight - rect.bottom })
    else
      setPosition({
        left: rect.left,
        bottom: window.innerHeight - rect.top + 8,
        width: Math.max(rect.width, 248),
      })
  }

  useEffect(() => {
    if (!open) return
    const close = () => setPosition(null)
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (!panel.current?.contains(target) && !button.current?.contains(target)) close()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      close()
      button.current?.focus()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
    }
  }, [open])

  const row =
    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-ink outline-none transition-colors hover:bg-brand-50 focus-visible:bg-brand-50'
  const avatar = (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-100 text-[12px] font-bold text-brand-800"
    >
      {initials(name)}
    </span>
  )

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`Tu cuenta: ${name}`}
        title={collapsed ? name : undefined}
        onClick={toggle}
        className={
          placement === 'header'
            ? 'press press-down grid size-10 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent-500'
            : `press flex w-full items-center gap-2.5 rounded-[9px] py-1.5 text-left outline-none hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-gold-500 ${
                collapsed ? 'justify-center' : 'px-1'
              } ${open ? 'bg-white/[0.06]' : ''}`
        }
      >
        {avatar}
        {placement === 'sidebar' && !collapsed ? (
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[13px] font-semibold text-on-forest">{name}</span>
            <span className="block truncate text-[11.5px] text-brand-200">{roleText}</span>
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          ref={panel}
          id={id}
          style={position}
          className="fixed z-50 w-64 animate-pop rounded-xl border border-edge bg-surface p-1.5 shadow-lg"
        >
          <div className="border-b border-edge px-2.5 pb-2.5 pt-1.5">
            <div className="truncate text-sm font-semibold">{name}</div>
            <div className="truncate text-[12px] text-muted">{email}</div>
            <div className="mt-0.5 truncate text-[12px] text-muted">{roleText}</div>
          </div>
          <div className="pt-1.5">
            <Link to="/cuenta" className={row} onClick={() => setPosition(null)}>
              <UserIcon className="size-[18px] shrink-0 text-muted" />
              Mi cuenta
            </Link>
            {placement === 'header' ? (
              // On a phone the theme has no button of its own in the bar.
              <button type="button" className={row} onClick={toggleTheme}>
                {dark ? (
                  <SunIcon className="size-[18px] shrink-0 text-muted" />
                ) : (
                  <MoonIcon className="size-[18px] shrink-0 text-muted" />
                )}
                {dark ? 'Tema claro' : 'Tema oscuro'}
              </button>
            ) : null}
            <button
              type="button"
              className={`${row} text-danger-600`}
              onClick={onLogout}
              disabled={leaving}
            >
              <LogoutIcon className="size-[18px] shrink-0" />
              {leaving ? 'Cerrando sesión…' : 'Cerrar sesión'}
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
