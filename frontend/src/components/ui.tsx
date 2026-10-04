import type { ComponentProps, ReactNode } from 'react'

/** Base building blocks using the Cobradía tokens (doc 08). shadcn/ui
 * replaces these as screens grow; the class vocabulary stays the same. */

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: 'primary' | 'secondary' }) {
  const styles =
    variant === 'primary'
      ? 'bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-60'
      : 'border border-edge bg-surface text-ink hover:bg-brand-100'
  return (
    <button
      className={`h-11 rounded-lg px-4 text-sm font-semibold transition-colors sm:h-9 ${styles} ${className}`}
      {...props}
    />
  )
}

export function Input(props: ComponentProps<'input'>) {
  return (
    <input
      className="h-11 w-full rounded-lg border border-edge bg-surface px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent-500 sm:h-9"
      {...props}
    />
  )
}

export function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: ReactNode
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[12.5px] font-medium text-muted">{label}</span>
      {children}
      {error ? <span className="block text-[12.5px] text-danger-600">{error}</span> : null}
    </label>
  )
}

export function Alert({
  tone,
  children,
}: {
  tone: 'danger' | 'warning' | 'success' | 'info'
  children: ReactNode
}) {
  const tones = {
    danger: 'border-danger-600/30 bg-danger-600/10 text-danger-600',
    warning: 'border-warning-700/30 bg-warning-700/10 text-warning-700',
    success: 'border-success-600/30 bg-success-600/10 text-success-600',
    info: 'border-info-700/30 bg-info-700/10 text-info-700',
  }
  return (
    <div role="alert" className={`rounded-lg border px-3 py-2 text-sm ${tones[tone]}`}>
      {children}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-edge bg-surface p-6 shadow-sm ${className}`}>
      {children}
    </div>
  )
}

export function Brand({ className = 'text-3xl' }: { className?: string }) {
  return (
    <span className={`font-semibold tracking-tight text-brand-700 ${className}`}>
      Cobrad<span className="text-accent-500">í</span>a
    </span>
  )
}
