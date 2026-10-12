import type { ReactNode } from 'react'

import { Texture } from '../../components/ui'

/** The customer's side of Cobradía (decision 116): a forest band with the
 * brand and the lender, and the content rising over it like a sheet, one
 * column made for a phone. */
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
    <div className="min-h-screen bg-canvas">
      <header className="relative overflow-hidden bg-brand-950 pb-16 pt-6 text-on-forest">
        <Texture tone="forest" />
        <div className="relative mx-auto flex max-w-2xl items-center justify-between gap-3 px-4">
          <div className="min-w-0">
            <span className="font-display text-[22px] font-bold tracking-[-0.03em]">
              Cobrad<span className="text-gold-500">í</span>a
            </span>
            <div className="truncate text-[12.5px] text-brand-200">
              {company ? `Portal de clientes · ${company}` : 'Portal de clientes'}
            </div>
          </div>
          {actions}
        </div>
      </header>
      <main className="relative mx-auto -mt-10 max-w-2xl animate-rise space-y-4 px-4 pb-10">
        {children}
      </main>
    </div>
  )
}
