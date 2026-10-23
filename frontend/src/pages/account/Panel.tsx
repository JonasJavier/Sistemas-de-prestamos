import type { FormEvent, ReactNode } from 'react'

import { cardClass } from '../../components/classes'

/** A block of Mi cuenta (decision 117): title and what it is for on top, the
 * content, and its action in a quiet footer on the right. With onSubmit the
 * whole block is the form, so Enter in any field saves it. */
export function Panel({
  title,
  description,
  aside,
  footer,
  onSubmit,
  children,
}: {
  title: string
  description?: ReactNode
  /** At the right of the title: the state of what the block manages. */
  aside?: ReactNode
  footer?: ReactNode
  onSubmit?: () => void
  children?: ReactNode
}) {
  const body = (
    <>
      <div className="space-y-4 p-4 sm:p-6">
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 sm:flex-nowrap">
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="text-[17px] font-semibold">{title}</h2>
            {description ? (
              <div className="max-w-2xl text-[13.5px] leading-relaxed text-muted">
                {description}
              </div>
            ) : null}
          </div>
          {aside}
        </header>
        {children}
      </div>
      {footer ? (
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 border-t border-edge bg-surface-2/50 px-4 py-3 sm:px-6">
          {footer}
        </div>
      ) : null}
    </>
  )
  const className = `${cardClass} overflow-hidden`
  if (!onSubmit) {
    return (
      <section aria-label={title} className={className}>
        {body}
      </section>
    )
  }
  return (
    <form
      aria-label={title}
      className={className}
      onSubmit={(event: FormEvent) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      {body}
    </form>
  )
}
