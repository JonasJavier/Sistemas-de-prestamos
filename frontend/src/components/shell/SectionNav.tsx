import { Link } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'

import type { NavEntry, NavLeaf } from './menu'

/** The screens of a section (Reportes, Finanzas, Ajustes; decision 114): a
 * column beside the content on a desktop, a strip that slides on a phone. It
 * stays put while its screens change, so only the content rises. */
export function SectionNav({ section, current }: { section: NavEntry; current: NavLeaf }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    ref.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [current])
  return (
    <nav
      ref={ref}
      aria-label={section.label}
      className="-mx-4 mb-5 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:sticky lg:top-24 lg:mx-0 lg:mb-0 lg:self-start lg:overflow-visible lg:px-0"
    >
      <div className="eyebrow hidden px-3 pb-2 lg:block">{section.label}</div>
      <ul className="flex gap-1 lg:flex-col lg:gap-0.5">
        {section.children?.map((child) => {
          const active = child === current
          return (
            <li key={child.to} className="shrink-0">
              <Link
                to={child.to}
                aria-current={active ? 'page' : undefined}
                className={`press flex h-9 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 text-[13.5px] outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                  active
                    ? 'bg-brand-100 font-semibold text-brand-800'
                    : 'font-medium text-ink ring-1 ring-inset ring-edge hover:bg-brand-50 lg:ring-0'
                }`}
              >
                <span className={active ? 'text-brand-700' : 'text-muted'}>{child.icon}</span>
                {child.label}
                {child.badge ? (
                  <span className="ml-auto rounded-full bg-brand-700 px-1.5 text-[11px] font-semibold leading-[18px] text-on-brand">
                    {child.badge}
                  </span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
