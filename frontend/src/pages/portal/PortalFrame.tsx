import type { ReactNode } from 'react'

import { Brand } from '../../components/ui'

/** The customer's side of Cobradía: one column, made for a phone. */
export function PortalFrame({
  company,
  actions,
  children,
}: {
  company?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <main className="mx-auto min-h-screen max-w-2xl space-y-4 px-4 py-6 sm:py-10">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Brand className="text-xl" />
          <div className="truncate text-[12.5px] text-muted">
            {company ? `Portal de clientes · ${company}` : 'Portal de clientes'}
          </div>
        </div>
        {actions}
      </header>
      {children}
    </main>
  )
}
