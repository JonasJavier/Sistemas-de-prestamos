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

export function Brand({
  className = 'text-3xl',
  tone = 'default',
}: {
  className?: string
  tone?: 'default' | 'light'
}) {
  const color = tone === 'light' ? 'text-white' : 'text-brand-700'
  return (
    <span className={`font-display font-semibold tracking-tight ${color} ${className}`}>
      Cobrad<span className="text-gold-500">í</span>a
    </span>
  )
}

const controlClasses =
  'w-full rounded-lg border border-edge bg-surface px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent-500'

export function Select(props: ComponentProps<'select'>) {
  return <select className={`h-11 sm:h-9 ${controlClasses}`} {...props} />
}

export function Textarea(props: ComponentProps<'textarea'>) {
  return <textarea rows={3} className={`py-2 ${controlClasses}`} {...props} />
}

const TONES: Record<string, string> = {
  neutral: 'bg-edge/60 text-muted',
  info: 'bg-info-700/12 text-info-700',
  warning: 'bg-warning-700/12 text-warning-700',
  success: 'bg-success-600/12 text-success-600',
  danger: 'bg-danger-600/12 text-danger-600',
  brand: 'bg-brand-100 text-brand-800',
}

/** A state always reads as color AND text (doc 07 - section 5). */
export function Badge({ tone = 'neutral', children }: { tone?: string; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-medium ${TONES[tone] ?? TONES.neutral}`}
    >
      {children}
    </span>
  )
}

/** Breadcrumb, title and ONE main action on the right (doc 07 - section 2). */
export function PageHeader({
  back,
  title,
  subtitle,
  actions,
}: {
  back?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back ? <div className="text-[12.5px] text-muted">{back}</div> : null}
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle ? <div className="text-sm text-muted">{subtitle}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly (readonly [T, string])[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-edge">
      {tabs.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
            value === key
              ? 'border-brand-700 text-brand-700'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          {label}
        </button>
      ))}
    </nav>
  )
}

export function Stat({
  label,
  value,
  emphasis = false,
  hint,
}: {
  label: string
  value: ReactNode
  emphasis?: boolean
  hint?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-edge bg-surface p-4 shadow-sm">
      <div className="text-[12.5px] text-muted">{label}</div>
      <div
        className={`font-display text-xl font-bold tabular-nums ${emphasis ? 'text-brand-700' : ''}`}
      >
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-[12px] text-muted">{hint}</div> : null}
    </div>
  )
}

export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-edge bg-surface-2 px-4 py-8 text-center text-sm text-muted">
      <p>{children}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return <p className="text-sm text-muted">{label}</p>
}
