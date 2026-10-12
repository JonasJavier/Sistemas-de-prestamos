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
  initials,
  percentToFraction,
  splitAmount,
  todayISO,
} from '../lib/format'
import {
  buttonClass,
  cardClass,
  controlClass,
  type ButtonSize,
  type ButtonVariant,
} from './classes'
import { AlertIcon, CheckCircleIcon, CheckIcon, InfoIcon, SearchIcon } from './icons'

/** Base building blocks using the Cobradía tokens (doc 08). shadcn/ui
 * replaces these as screens grow; the class vocabulary stays the same. */

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, className, size)} {...props} />
}

export function Input(props: ComponentProps<'input'>) {
  return <input className={`h-11 sm:h-9 ${controlClass}`} {...props} />
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
    <label className="block space-y-1.5">
      <span className="block text-[13px] font-medium text-ink/85">{label}</span>
      {children}
      {error ? (
        <span className="block text-[12.5px] font-medium text-danger-600">{error}</span>
      ) : hint ? (
        <span className="block text-[12px] leading-snug text-muted">{hint}</span>
      ) : null}
    </label>
  )
}

const ALERT_TONES = {
  danger: { box: 'border-danger-600/25 bg-danger-600/[0.07] text-danger-600', icon: AlertIcon },
  warning: { box: 'border-warning-700/25 bg-warning-700/[0.07] text-warning-700', icon: AlertIcon },
  success: {
    box: 'border-success-600/25 bg-success-600/[0.07] text-success-600',
    icon: CheckCircleIcon,
  },
  info: { box: 'border-info-700/20 bg-info-700/[0.06] text-info-700', icon: InfoIcon },
}

export function Alert({
  tone,
  children,
}: {
  tone: 'danger' | 'warning' | 'success' | 'info'
  children: ReactNode
}) {
  const { box, icon: Icon } = ALERT_TONES[tone]
  // Problems interrupt the screen reader; confirmations and hints wait their turn.
  const role = tone === 'danger' || tone === 'warning' ? 'alert' : 'status'
  return (
    <div
      role={role}
      className={`flex animate-fade gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm ${box}`}
    >
      <span className="mt-px">
        <Icon />
      </span>
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    // 16 px of padding on a phone, 24 from a tablet up: the content gets the width.
    <div className={`${cardClass} p-4 sm:p-6 ${className}`}>{children}</div>
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
    <span
      className={`inline-flex items-center gap-[0.35em] font-display font-semibold tracking-tight ${color} ${className}`}
    >
      <BrandMark tone={tone} />
      <span>
        Cobrad<span className="text-gold-500">í</span>a
      </span>
    </span>
  )
}

/** The square mark of the favicon (public/favicon.svg): the «C» on forest
 * with the gold dot. On the forest sidebar the square goes translucent. */
export function BrandMark({
  tone = 'default',
  className = 'size-[1.15em]',
}: {
  tone?: 'default' | 'light'
  className?: string
}) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={`shrink-0 ${className}`}>
      <rect
        width="64"
        height="64"
        rx="16"
        className={tone === 'light' ? 'fill-white/12' : 'fill-brand-950'}
      />
      <path
        d="M42.5 22.5a13 13 0 1 0 0 19"
        fill="none"
        stroke="#fff"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <circle cx="45" cy="15" r="4.5" className="fill-gold-500" />
    </svg>
  )
}

/** The brand texture behind a panel (decision 111): the dot grid and the soft
 * light of the sign-in panel, on forest (the menu) or in gold on sand (the
 * home card). The container needs `relative` (and `overflow-hidden` when it
 * has rounded corners); the content sits above with `relative`. */
export function Texture({ tone }: { tone: 'forest' | 'sand' }) {
  return (
    <>
      <div aria-hidden className={`pointer-events-none absolute inset-0 texture-glow-${tone}`} />
      <div aria-hidden className={`pointer-events-none absolute inset-0 texture-grid-${tone}`} />
    </>
  )
}

/** A titled group of a screen; the gold dot is the house mark (decision 111). */
export function Section({
  title,
  aside,
  children,
}: {
  title: string
  /** A quiet note at the right of the title (the scope of the figures). */
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-label={title} className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-gold-500" />
          {title}
        </h2>
        {aside ? <span className="text-[12.5px] text-muted">{aside}</span> : null}
      </div>
      {children}
    </section>
  )
}

const controlClasses = controlClass
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
  neutral: 'bg-surface-2 text-muted ring-edge',
  info: 'bg-info-700/[0.07] text-info-700 ring-info-700/20',
  warning: 'bg-warning-700/[0.08] text-warning-700 ring-warning-700/20',
  success: 'bg-success-600/[0.08] text-success-600 ring-success-600/20',
  danger: 'bg-danger-600/[0.07] text-danger-600 ring-danger-600/20',
  brand: 'bg-brand-50 text-brand-800 ring-brand-700/20',
}

/** A state always reads as color AND text (doc 07 - section 5). */
export function Badge({ tone = 'neutral', children }: { tone?: string; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-px text-[11.5px] font-semibold leading-5 ring-1 ring-inset ${TONES[tone] ?? TONES.neutral}`}
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
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0 space-y-1">
        {back ? (
          <div className="text-[13px] font-medium text-muted [&_a:hover]:text-ink [&_a]:transition-colors">
            {back}
          </div>
        ) : null}
        <h1 className="text-[1.5rem] leading-tight sm:text-[1.75rem]">{title}</h1>
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
  // The indicator slides from the previous tab to the chosen one (decision 112).
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null)
  useEffect(() => {
    const tab = buttons.current[active]
    if (!tab) return
    setBar({ left: tab.offsetLeft, width: tab.offsetWidth })
  }, [active, tabs])
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
    <div
      ref={list}
      role="tablist"
      className="relative flex gap-1 overflow-x-auto border-b border-edge [scrollbar-width:none]"
    >
      {bar ? (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-0 h-0.5 rounded-full bg-brand-700 transition-[left,width] duration-200 ease-out"
          style={{ left: bar.left, width: bar.width }}
        />
      ) : null}
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
          className={`press press-down -mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-[13.5px] font-medium outline-none focus-visible:rounded-t-md focus-visible:ring-2 focus-visible:ring-accent-500 ${
            value === key
              ? `text-brand-700 ${bar ? '' : 'border-brand-700'}`
              : 'text-muted hover:border-edge hover:text-ink'
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
    <div className={`@container min-w-0 p-4 ${cardClass}`}>
      <div className="text-[12.5px] font-medium text-muted">{label}</div>
      <div
        className={`mt-1 whitespace-nowrap font-display font-semibold tracking-tight tabular-nums text-sm @min-[9rem]:text-base @min-[11rem]:text-lg @min-[13.5rem]:text-xl ${danger ? 'text-danger-600' : emphasis ? 'text-brand-700' : ''}`}
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
      <span className="mr-1 text-[0.68em] font-medium opacity-70">RD$</span>
      {parts.amount}
    </>
  )
}

/** The house drawing of an empty list: two cards and the gold dot. */
function EmptyArt() {
  return (
    <svg
      viewBox="0 0 96 64"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-16 w-24"
    >
      <path d="M30 14a6 6 0 0 1 6-6h32a6 6 0 0 1 6 6v24" className="text-muted/45" />
      <rect x="18" y="22" width="52" height="34" rx="6" className="fill-surface" />
      <path d="M28 36h18M28 44h26" />
      <circle cx="60" cy="33" r="3.5" className="fill-gold-500" stroke="none" />
    </svg>
  )
}

export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex animate-rise flex-col items-center rounded-xl border border-dashed border-edge bg-surface-2/60 px-4 py-9 text-center text-sm text-muted">
      <span className="mb-2 text-muted/80">
        <EmptyArt />
      </span>
      <p className="max-w-md text-balance">{children}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

const AVATAR_TONES = [
  'bg-brand-100 text-brand-800',
  'bg-gold-100 text-gold-800',
  'bg-info-700/10 text-info-700',
  'bg-warning-700/10 text-warning-700',
  'bg-surface-2 text-muted ring-1 ring-inset ring-edge',
]

/** Initials in a circle; the same name always gets the same soft tone. */
export function Avatar({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  const tone = AVATAR_TONES[hash % AVATAR_TONES.length]
  const box = size === 'lg' ? 'size-12 text-base' : 'size-9 text-[12.5px]'
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full font-semibold ${box} ${tone}`}
    >
      {initials(name)}
    </span>
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
      <aside className="relative hidden w-[44%] max-w-xl flex-col justify-between overflow-hidden bg-brand-950 p-10 text-white lg:flex xl:p-12">
        {/* A soft light from the corner and a fine dot grid: depth without noise. */}
        <Texture tone="forest" />
        <Brand className="relative text-2xl" tone="light" />
        <div className="relative space-y-8">
          <h2 className="text-[2.1rem] font-semibold leading-[1.15]">
            Tu cartera al día,
            <br />
            <span className="text-gold-500">cada día.</span>
          </h2>
          <ul className="space-y-4 text-[15px] text-brand-200">
            {[
              'Cuotas, intereses y mora calculados al centavo.',
              'Desembolsos y caja que siempre cuadran con el libro.',
              'Los datos de tu financiera, aislados y protegidos.',
            ].map((line) => (
              <li key={line} className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-white/10 text-gold-500 ring-1 ring-white/15"
                >
                  <CheckIcon />
                </span>
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
        <div className="w-full max-w-sm space-y-6 animate-fade">
          <div className="space-y-1.5 text-center">
            <Brand className="text-[1.7rem] lg:hidden" />
            {subtitle ? (
              <h1 className="font-sans text-sm font-normal tracking-normal text-muted lg:font-display lg:text-[1.4rem] lg:font-semibold lg:tracking-tight lg:text-ink">
                {subtitle}
              </h1>
            ) : null}
            {lead ? <p className="text-sm text-muted">{lead}</p> : null}
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
        <SearchIcon className="size-4 shrink-0" />
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
    <div className={`overflow-hidden ${cardClass}`}>
      <ul className="divide-y divide-edge">{children}</ul>
    </div>
  )
}

export const rowLinkClass =
  'press flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 outline-none hover:bg-brand-50/60 focus-visible:bg-brand-50 active:bg-brand-100/60'
