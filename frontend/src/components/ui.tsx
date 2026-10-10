import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

import { ApiError } from '../api/client'
import {
  errorMessage,
  fractionToPercent,
  percentToFraction,
  splitAmount,
  todayISO,
} from '../lib/format'
import { buttonClass, type ButtonVariant } from './classes'

/** Base building blocks using the Cobradía tokens (doc 08). shadcn/ui
 * replaces these as screens grow; the class vocabulary stays the same. */

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant }) {
  return <button className={buttonClass(variant, className)} {...props} />
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
  hint,
  children,
}: {
  label: string
  error?: string
  /** One line under the control saying what the value does. */
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[12.5px] font-medium text-muted">{label}</span>
      {children}
      {error ? (
        <span className="block text-[12.5px] text-danger-600">{error}</span>
      ) : hint ? (
        <span className="block text-[12px] text-muted">{hint}</span>
      ) : null}
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
  // Problems interrupt the screen reader; confirmations and hints wait their turn.
  const role = tone === 'danger' || tone === 'warning' ? 'alert' : 'status'
  return (
    <div role={role} className={`rounded-lg border px-3 py-2 text-sm ${tones[tone]}`}>
      {children}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    // 16 px of padding on a phone, 24 from a tablet up: the content gets the width.
    <div className={`rounded-xl border border-edge bg-surface p-4 shadow-sm sm:p-6 ${className}`}>
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

/** Rates are typed as percentages and handed over as fractions (5 → 0.05).
 * Keeps its own text so «4.» survives typing; remount it (key) to reset. */
export function PercentInput({
  value,
  onChange,
  placeholder = 'Ej.: 5',
  disabled,
}: {
  value: string | null
  onChange: (fraction: string) => void
  placeholder?: string
  disabled?: boolean
}) {
  const [text, setText] = useState(() => fractionToPercent(value ?? ''))
  return (
    <div className="relative">
      <Input
        inputMode="decimal"
        placeholder={placeholder}
        disabled={disabled}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          onChange(percentToFraction(e.target.value))
        }}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm text-muted">
        %
      </span>
    </div>
  )
}

/** One file, picked with a button that speaks Spanish whatever the browser's
 * language («Choose File» is not ours), and that forgets the file once the
 * screen does (after an upload). */
export function FilePicker({
  file,
  onPick,
  accept,
  label = 'Elegir archivo',
  empty = 'Ningún archivo elegido',
  disabled,
}: {
  file: File | null
  onPick: (file: File | null) => void
  accept?: string
  label?: string
  empty?: string
  disabled?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
      <input
        ref={input}
        type="file"
        accept={accept}
        aria-label={label}
        className="sr-only"
        tabIndex={-1}
        disabled={disabled}
        onChange={(e) => {
          onPick(e.target.files?.[0] ?? null)
          e.target.value = '' // the same file can be picked again
        }}
      />
      <Button
        type="button"
        variant="secondary"
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        {label}
      </Button>
      <span className={`min-w-0 truncate ${file ? 'text-ink' : 'text-muted'}`}>
        {file ? file.name : empty}
      </span>
    </span>
  )
}

export function Select(props: ComponentProps<'select'>) {
  return <select className={`h-11 sm:h-9 ${controlClasses}`} {...props} />
}

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

/** A month («2026-10») picked with two selects in Spanish: `<input
 * type="month">` speaks the browser's language and is a bare text box in
 * Firefox and Safari. ``max`` («YYYY-MM») hides the months after it. */
export function MonthInput({
  value,
  onChange,
  max,
  label = 'Mes',
}: {
  value: string
  onChange: (month: string) => void
  max?: string
  label?: string
}) {
  const [year, month] = (value || todayISO().slice(0, 7)).split('-').map(Number)
  const lastYear = Number((max ?? todayISO()).slice(0, 4)) + (max ? 0 : 1)
  const lastMonth = (y: number) => (max && y === lastYear ? Number(max.slice(5, 7)) : 12)
  const firstYear = Math.min(year, lastYear - 5)
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => lastYear - i)
  const pick = (y: number, m: number) =>
    onChange(`${y}-${String(Math.min(m, lastMonth(y))).padStart(2, '0')}`)
  return (
    <span className="flex gap-2">
      <select
        aria-label={`${label}: mes`}
        value={month}
        onChange={(e) => pick(year, Number(e.target.value))}
        className={`h-11 min-w-0 flex-1 sm:h-9 ${controlClasses}`}
      >
        {MONTH_NAMES.slice(0, lastMonth(year)).map((name, index) => (
          <option key={name} value={index + 1}>
            {name}
          </option>
        ))}
      </select>
      <select
        aria-label={`${label}: año`}
        value={year}
        onChange={(e) => pick(Number(e.target.value), month)}
        className={`h-11 !w-24 shrink-0 sm:h-9 ${controlClasses}`}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </span>
  )
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
  documentTitle,
}: {
  back?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  /** Browser tab text when the title is not plain text. */
  documentTitle?: string
}) {
  const tab = documentTitle ?? (typeof title === 'string' ? title : null)
  useEffect(() => {
    if (!tab) return
    document.title = `${tab} · Cobradía`
    return () => {
      document.title = 'Cobradía'
    }
  }, [tab])
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
  const list = useRef<HTMLDivElement>(null)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const active = tabs.findIndex(([key]) => key === value)
  // On a phone the tabs scroll sideways: the chosen one is always in sight
  // (only the strip moves, never the page).
  useEffect(() => {
    const strip = list.current
    const tab = buttons.current[active]
    if (!strip || !tab) return
    const box = strip.getBoundingClientRect()
    const own = tab.getBoundingClientRect()
    if (own.left < box.left) strip.scrollLeft -= box.left - own.left + 16
    else if (own.right > box.right) strip.scrollLeft += own.right - box.right + 16
  }, [active])
  // Arrows, Home and End move between tabs (WAI-ARIA tabs pattern).
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1
    const next = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    }[event.key]
    if (next === undefined) return
    event.preventDefault()
    onChange(tabs[next][0])
    buttons.current[next]?.focus()
  }
  return (
    <div ref={list} role="tablist" className="flex gap-1 overflow-x-auto border-b border-edge">
      {tabs.map(([key, label], index) => (
        <button
          key={key}
          ref={(node) => {
            buttons.current[index] = node
          }}
          type="button"
          role="tab"
          aria-selected={value === key}
          tabIndex={value === key || (active === -1 && index === 0) ? 0 : -1}
          onClick={() => onChange(key)}
          onKeyDown={(event) => move(event, index)}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
            value === key
              ? 'border-brand-700 text-brand-700'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export function Stat({
  label,
  value,
  emphasis = false,
  danger = false,
  hint,
}: {
  label: string
  value: ReactNode
  emphasis?: boolean
  /** Money that is late or missing reads in red, never in the brand green. */
  danger?: boolean
  hint?: ReactNode
}) {
  return (
    // @container: the figure's size follows the card, not the screen (beside
    // the sidebar on a tablet, four cards are narrower than on a phone).
    <div className="@container min-w-0 rounded-xl border border-edge bg-surface p-4 shadow-sm">
      <div className="text-[12.5px] text-muted">{label}</div>
      <div
        className={`whitespace-nowrap font-display font-bold tabular-nums text-sm @min-[9rem]:text-base @min-[11rem]:text-lg @min-[13.5rem]:text-xl ${danger ? 'text-danger-600' : emphasis ? 'text-brand-700' : ''}`}
      >
        <Figure value={value} />
      </div>
      {hint ? <div className="mt-0.5 text-[12px] text-muted">{hint}</div> : null}
    </div>
  )
}

/** «RD$ 1,250,000.00» keeps one line on a phone: the currency goes smaller. */
export function Figure({ value }: { value: ReactNode }) {
  const parts = splitAmount(value)
  if (!parts) return <>{value}</>
  return (
    <>
      {parts.sign}
      <span className="mr-1 text-[0.7em] font-semibold opacity-80">RD$</span>
      {parts.amount}
    </>
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

/** A query that failed says so: a screen never stays blank (and a 400 for a
 * bad filter says which). */
export function LoadError({ error }: { error: unknown }) {
  return (
    <Alert tone="danger">
      {error instanceof ApiError
        ? errorMessage(error.data, 'No se pudo cargar esta información.')
        : 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.'}
    </Alert>
  )
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-muted">
      <span
        aria-hidden
        className="size-4 animate-spin rounded-full border-2 border-edge border-t-brand-700"
      />
      {label}
    </p>
  )
}

/** Layout of the screens outside the app: sign in, sign up, links. On wide
 * screens a brand panel keeps the first impression in Cobradía's identity. */
export function PublicPage({
  subtitle,
  lead,
  children,
}: {
  subtitle?: string
  /** A second, quieter line under the subtitle. */
  lead?: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen">
      <aside className="relative hidden w-[44%] max-w-xl flex-col justify-between overflow-hidden bg-brand-950 p-10 text-white lg:flex">
        <div
          aria-hidden
          className="absolute -right-24 -top-24 size-80 rounded-full border-[40px] border-brand-900/70"
        />
        <div
          aria-hidden
          className="absolute -bottom-32 -left-16 size-96 rounded-full border-[48px] border-brand-900/50"
        />
        <Brand className="relative text-3xl" tone="light" />
        <div className="relative space-y-6">
          <h2 className="text-3xl font-semibold leading-tight">
            Tu cartera al día,
            <br />
            cada día.
          </h2>
          <ul className="space-y-3 text-brand-200">
            {[
              'Cuotas, intereses y mora calculados al centavo.',
              'Desembolsos y caja que siempre cuadran con el libro.',
              'Los datos de tu financiera, aislados y protegidos.',
            ].map((line) => (
              <li key={line} className="flex items-start gap-3">
                <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-gold-500" />
                {line}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-[12.5px] text-brand-200/80">
          Hecho en República Dominicana para financieras dominicanas.
        </p>
      </aside>
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <Brand className="text-3xl lg:hidden" />
            {subtitle ? (
              <h1 className="mt-1 font-sans text-sm font-normal tracking-normal text-muted lg:font-display lg:text-xl lg:font-semibold lg:text-ink">
                {subtitle}
              </h1>
            ) : null}
            {lead ? <p className="mt-1 text-sm text-muted">{lead}</p> : null}
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}

/** Live search box of the list screens; filters as the user types. */
export function SearchInput({ className = '', ...props }: ComponentProps<'input'>) {
  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-muted">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          aria-hidden
          className="size-4"
        >
          <circle cx="11" cy="11" r="6.5" />
          <path d="m20 20-4.2-4.2" strokeLinecap="round" />
        </svg>
      </span>
      <input
        type="search"
        className={`h-11 pl-9 sm:h-9 ${controlClasses}`}
        aria-label={props.placeholder}
        {...props}
      />
    </div>
  )
}

export const PAGE_SIZE = 25

/** «26–50 de 120» with previous/next; hidden while everything fits one page. */
export function Pagination({
  page,
  count,
  onChange,
}: {
  page: number
  count: number
  onChange: (page: number) => void
}) {
  if (count <= PAGE_SIZE) return null
  const last = Math.ceil(count / PAGE_SIZE)
  const from = (page - 1) * PAGE_SIZE + 1
  const to = Math.min(page * PAGE_SIZE, count)
  return (
    <nav aria-label="Páginas" className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted tabular-nums">
        {from}–{to} de {count}
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Anterior
        </Button>
        <Button variant="secondary" disabled={page >= last} onClick={() => onChange(page + 1)}>
          Siguiente
        </Button>
      </div>
    </nav>
  )
}

/** A list of rows that are links: wraps gracefully from desktop to phone. */
export function RowList({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-edge bg-surface shadow-sm">
      <ul className="divide-y divide-edge">{children}</ul>
    </div>
  )
}

export const rowLinkClass =
  'flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 outline-none transition-colors hover:bg-surface-2 focus-visible:bg-brand-100'
